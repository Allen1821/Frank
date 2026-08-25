const crypto = require('crypto');
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

const RESET_WINDOW_MS = 60 * 60 * 1000;
const RESET_MAX_PER_IP = 8;
const RESET_MAX_PER_ACCOUNT = 4;
const resetHits = new Map();
const GENERIC_MESSAGE = 'If a student account exists for that email, a secure reset link has been sent.';

setInterval(function () {
    pruneRateLimit(resetHits, RESET_WINDOW_MS);
}, RESET_WINDOW_MS).unref();

function getTrustedAppOrigin(req) {
    const configured = String(process.env.APP_ORIGIN || '').trim().replace(/\/+$/, '');
    if (configured) {
        try {
            const parsed = new URL(configured);
            if (parsed.protocol === 'https:' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
                return parsed.origin;
            }
        } catch {
            return '';
        }
        return '';
    }

    const host = String(req.headers.host || '').split(',')[0].trim().toLowerCase();
    if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) return '';
    return 'http://' + host;
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
    if (JSON.stringify(body).length > 4096 || Object.keys(body).some(function (key) { return key !== 'email'; })) {
        return sendJson(res, 400, { success: false, error: 'Invalid password reset request.' });
    }

    const email = String(body.email || '').trim().toLowerCase();
    const clientIp = getClientIp(req);
    const emailHash = crypto.createHash('sha256').update(email).digest('hex').slice(0, 20);
    const limited = checkRateLimit(resetHits, 'ip:' + clientIp, RESET_MAX_PER_IP, RESET_WINDOW_MS)
        || checkRateLimit(resetHits, 'email:' + emailHash, RESET_MAX_PER_ACCOUNT, RESET_WINDOW_MS);
    if (limited) {
        return sendJson(res, 429, {
            success: false,
            error: 'Too many reset requests. Please wait before trying again.',
        });
    }

    const config = getSupabaseConfig();
    const appOrigin = getTrustedAppOrigin(req);
    if (!config || !appOrigin) {
        return sendJson(res, 503, { success: false, error: 'Password reset is not configured right now.' });
    }

    if (!isValidEmail(email)) {
        return sendJson(res, 200, { success: true, message: GENERIC_MESSAGE });
    }

    try {
        const redirectTo = appOrigin + '/student-portal/?mode=recovery';
        const response = await fetch(
            config.url + '/auth/v1/recover?redirect_to=' + encodeURIComponent(redirectTo),
            {
                method: 'POST',
                headers: {
                    apikey: config.publishableKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
                signal: AbortSignal.timeout(10000),
            }
        );

        if (response.status === 429) {
            return sendJson(res, 429, {
                success: false,
                error: 'Too many reset requests. Please wait before trying again.',
            });
        }

        return sendJson(res, 200, { success: true, message: GENERIC_MESSAGE });
    } catch (error) {
        console.error('Student password reset request error:', error instanceof Error ? error.message : 'unknown error');
        return sendJson(res, 503, { success: false, error: 'Unable to request a reset link right now.' });
    }
};
