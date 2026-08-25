const crypto = require('crypto');
const {
    checkRateLimit,
    clearStudentCookies,
    generateCsrfToken,
    getClientIp,
    getSupabaseConfig,
    isJsonRequest,
    isValidEmail,
    pruneRateLimit,
    requireCsrf,
    requireSameOrigin,
    sendJson,
    setStudentCookies,
    setStudentSecurityHeaders,
} = require('./_student-utils');

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 6;
const loginHits = new Map();

setInterval(function () {
    pruneRateLimit(loginHits, LOGIN_WINDOW_MS);
}, LOGIN_WINDOW_MS).unref();

async function hasStudentProfile(config, accessToken, userId) {
    const url = config.url
        + '/rest/v1/students?select=id,portal_active&auth_user_id=eq.'
        + encodeURIComponent(userId)
        + '&portal_active=eq.true&limit=1';
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            apikey: config.publishableKey,
            Authorization: 'Bearer ' + accessToken,
        },
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { ok: false, configured: response.status !== 404 };
    const rows = await response.json();
    return { ok: Array.isArray(rows) && rows.length === 1, configured: true };
}

module.exports = async function handler(req, res) {
    setStudentSecurityHeaders(res);

    if (req.method === 'DELETE') {
        if (!requireSameOrigin(req, res) || !requireCsrf(req, res)) return;
        clearStudentCookies(res, req);
        return sendJson(res, 200, { success: true });
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, DELETE');
        return sendJson(res, 405, { success: false, error: 'Method not allowed.' });
    }

    if (!requireSameOrigin(req, res)) return;
    if (!isJsonRequest(req)) {
        return sendJson(res, 400, { success: false, error: 'Content-Type must be application/json.' });
    }

    const body = req.body || {};
    if (JSON.stringify(body).length > 8192) {
        return sendJson(res, 400, { success: false, error: 'Login request is too large.' });
    }
    const unknownFields = Object.keys(body).filter(function (key) {
        return !['email', 'password'].includes(key);
    });
    if (unknownFields.length) {
        return sendJson(res, 400, { success: false, error: 'Unexpected fields in request.' });
    }

    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!isValidEmail(email) || password.length < 8 || password.length > 256) {
        return sendJson(res, 401, { success: false, error: 'Invalid email or password.' });
    }

    const clientIp = getClientIp(req);
    const emailHash = crypto.createHash('sha256').update(email).digest('hex').slice(0, 16);
    const ipLimited = checkRateLimit(loginHits, 'ip:' + clientIp, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
    const accountLimited = checkRateLimit(
        loginHits,
        'account:' + emailHash + ':' + clientIp,
        LOGIN_MAX_ATTEMPTS,
        LOGIN_WINDOW_MS
    );
    if (ipLimited || accountLimited) {
        return sendJson(res, 429, { success: false, error: 'Too many login attempts. Please wait and try again.' });
    }

    const config = getSupabaseConfig();
    if (!config) {
        return sendJson(res, 503, { success: false, error: 'Student portal authentication is not configured.' });
    }

    try {
        const authResponse = await fetch(config.url + '/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: {
                apikey: config.publishableKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
            signal: AbortSignal.timeout(10000),
        });
        if (!authResponse.ok) {
            return sendJson(res, 401, { success: false, error: 'Invalid email or password.' });
        }

        const session = await authResponse.json();
        const accessToken = String(session.access_token || '');
        const refreshToken = String(session.refresh_token || '');
        const userId = String(session.user?.id || '');
        if (!accessToken || !refreshToken || !userId) {
            return sendJson(res, 401, { success: false, error: 'Invalid email or password.' });
        }

        const profile = await hasStudentProfile(config, accessToken, userId);
        if (!profile.configured) {
            return sendJson(res, 503, { success: false, error: 'Student portal data is not configured yet.' });
        }
        if (!profile.ok) {
            return sendJson(res, 403, { success: false, error: 'This account does not have student portal access.' });
        }

        const csrfToken = generateCsrfToken();
        setStudentCookies(res, req, session, csrfToken);
        return sendJson(res, 200, {
            success: true,
            csrfToken,
            user: { email: String(session.user?.email || email).toLowerCase() },
        });
    } catch (error) {
        console.error('Student auth error:', error instanceof Error ? error.message : 'unknown error');
        return sendJson(res, 503, { success: false, error: 'Unable to log in right now.' });
    }
};
