const crypto = require('crypto');
const registrationEmail = require('./_student-registration-email');
const {
    checkRateLimit,
    getClientIp,
    getSupabaseConfig,
    isJsonRequest,
    isValidEmail,
    pruneRateLimit,
    requireSameOrigin,
    sendJson,
    setStudentSecurityHeaders,
} = require('./_student-utils');

const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
const REGISTRATION_MAX_ATTEMPTS = 4;
const registrationHits = new Map();
const ALLOWED_COURSE_CODES = new Set(Object.keys(registrationEmail.COURSE_LABELS));

setInterval(function () {
    pruneRateLimit(registrationHits, REGISTRATION_WINDOW_MS);
}, REGISTRATION_WINDOW_MS).unref();

function cleanName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

module.exports = async function handler(req, res) {
    setStudentSecurityHeaders(res);
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return sendJson(res, 405, { success: false, error: 'Method not allowed.' });
    }
    if (!requireSameOrigin(req, res)) return;
    if (!isJsonRequest(req)) {
        return sendJson(res, 400, { success: false, error: 'Content-Type must be application/json.' });
    }

    const body = req.body || {};
    if (JSON.stringify(body).length > 8192) {
        return sendJson(res, 400, { success: false, error: 'Registration request is too large.' });
    }
    const unknownFields = Object.keys(body).filter(function (key) {
        return !['fullName', 'email', 'password', 'confirmPassword', 'courseCode'].includes(key);
    });
    if (unknownFields.length) {
        return sendJson(res, 400, { success: false, error: 'Unexpected fields in request.' });
    }

    const fullName = cleanName(body.fullName);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const confirmPassword = String(body.confirmPassword || '');
    const courseCode = String(body.courseCode || '').trim();

    if (fullName.length < 2 || fullName.length > 120 || /[<>\x00-\x1f\x7f]/.test(fullName)) {
        return sendJson(res, 400, { success: false, error: 'Enter your full name.' });
    }
    if (!isValidEmail(email)) {
        return sendJson(res, 400, { success: false, error: 'Enter a valid email address.' });
    }
    if (password.length < 12 || password.length > 256 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        return sendJson(res, 400, {
            success: false,
            error: 'Use at least 12 characters with at least one letter and one number.',
        });
    }
    if (password !== confirmPassword) {
        return sendJson(res, 400, { success: false, error: 'Passwords do not match.' });
    }
    if (!ALLOWED_COURSE_CODES.has(courseCode)) {
        return sendJson(res, 400, { success: false, error: 'Choose the class connected to your account.' });
    }

    const clientIp = getClientIp(req);
    const emailHash = crypto.createHash('sha256').update(email).digest('hex').slice(0, 16);
    const ipLimited = checkRateLimit(
        registrationHits,
        'ip:' + clientIp,
        REGISTRATION_MAX_ATTEMPTS,
        REGISTRATION_WINDOW_MS
    );
    const accountLimited = checkRateLimit(
        registrationHits,
        'account:' + emailHash,
        REGISTRATION_MAX_ATTEMPTS,
        REGISTRATION_WINDOW_MS
    );
    if (ipLimited || accountLimited) {
        return sendJson(res, 429, {
            success: false,
            error: 'Too many registration attempts. Please wait and try again.',
        });
    }

    const config = getSupabaseConfig();
    if (!config) {
        return sendJson(res, 503, { success: false, error: 'Student registration is not configured.' });
    }

    try {
        const authResponse = await fetch(config.url + '/auth/v1/signup', {
            method: 'POST',
            headers: {
                apikey: config.publishableKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email,
                password,
                data: {
                    account_type: 'student',
                    full_name: fullName,
                    requested_course_code: courseCode,
                },
            }),
            signal: AbortSignal.timeout(10000),
        });

        let authPayload = {};
        try {
            authPayload = await authResponse.json();
        } catch (_error) {
            authPayload = {};
        }

        const identities = authPayload && authPayload.user && authPayload.user.identities;
        const accountAlreadyExists =
            authPayload.code === 'user_already_exists' ||
            (Array.isArray(identities) && identities.length === 0);

        if (accountAlreadyExists) {
            return sendJson(res, 409, {
                success: false,
                code: 'ACCOUNT_EXISTS',
                error: 'This email is already connected to an account. Sign in or use Forgot Password instead.',
            });
        }

        if (!authResponse.ok) {
            if (authResponse.status === 429) {
                return sendJson(res, 429, {
                    success: false,
                    error: 'Too many registration attempts. Please wait and try again.',
                });
            }
            return sendJson(res, 400, {
                success: false,
                error: 'We could not create the account. Check the information and try again.',
            });
        }

        const userId = String(authPayload?.user?.id || '');
        let notificationSent = false;
        if (userId) {
            const configuredOrigin = String(process.env.APP_ORIGIN || '').trim().replace(/\/+$/, '');
            const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
            const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
            const requestOrigin = host ? (forwardedProto || 'https') + '://' + host : '';
            const adminUrl = (configuredOrigin || requestOrigin || 'https://www.darpasolutionsllc.net') + '/admin/';

            try {
                const notification = await registrationEmail.sendStudentRegistrationEmail({
                    userId,
                    fullName,
                    email,
                    courseCode,
                    requestedAt: new Date().toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: 'America/New_York',
                        timeZoneName: 'short',
                    }),
                    adminUrl,
                });
                notificationSent = notification.sent;
            } catch (notificationError) {
                console.error(
                    'Student registration notification error:',
                    notificationError instanceof Error ? notificationError.message : 'unknown error'
                );
            }
        }

        return sendJson(res, 202, {
            success: true,
            notificationSent,
            message: 'Student account request received. Check your email if confirmation is required. Frank will review your portal access.',
        });
    } catch (error) {
        console.error('Student registration error:', error instanceof Error ? error.message : 'unknown error');
        return sendJson(res, 503, { success: false, error: 'Unable to create the account right now.' });
    }
};
