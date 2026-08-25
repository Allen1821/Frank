const {
    checkRateLimit,
    clearStudentRecoveryCookies,
    generateCsrfToken,
    getClientIp,
    getSupabaseConfig,
    isJsonRequest,
    pruneRateLimit,
    requireSameOrigin,
    sendJson,
    setStudentRecoveryCookies,
    setStudentSecurityHeaders,
} = require('./_student-utils');

const RECOVERY_WINDOW_MS = 15 * 60 * 1000;
const RECOVERY_MAX_ATTEMPTS = 10;
const recoveryHits = new Map();

setInterval(function () {
    pruneRateLimit(recoveryHits, RECOVERY_WINDOW_MS);
}, RECOVERY_WINDOW_MS).unref();

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
    if (checkRateLimit(recoveryHits, getClientIp(req), RECOVERY_MAX_ATTEMPTS, RECOVERY_WINDOW_MS)) {
        return sendJson(res, 429, { success: false, error: 'Too many recovery attempts. Request a new reset link.' });
    }

    const body = req.body || {};
    const unknownFields = Object.keys(body).filter(function (key) { return !['accessToken', 'type'].includes(key); });
    const accessToken = String(body.accessToken || '').trim();
    if (
        unknownFields.length
        || body.type !== 'recovery'
        || accessToken.length < 50
        || accessToken.length > 8192
    ) {
        clearStudentRecoveryCookies(res, req);
        return sendJson(res, 400, { success: false, error: 'This password reset link is invalid or expired.' });
    }

    const config = getSupabaseConfig();
    if (!config) {
        return sendJson(res, 503, { success: false, error: 'Password reset is not configured right now.' });
    }

    try {
        const response = await fetch(config.url + '/auth/v1/user', {
            method: 'GET',
            headers: {
                apikey: config.publishableKey,
                Authorization: 'Bearer ' + accessToken,
            },
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
            clearStudentRecoveryCookies(res, req);
            return sendJson(res, 401, { success: false, error: 'This password reset link is invalid or expired.' });
        }

        const user = await response.json();
        if (!user || !user.id) {
            clearStudentRecoveryCookies(res, req);
            return sendJson(res, 401, { success: false, error: 'This password reset link is invalid or expired.' });
        }

        const csrfToken = generateCsrfToken();
        setStudentRecoveryCookies(res, req, accessToken, csrfToken);
        return sendJson(res, 200, {
            success: true,
            csrfToken,
            email: String(user.email || '').trim().toLowerCase(),
        });
    } catch (error) {
        console.error('Student password recovery error:', error instanceof Error ? error.message : 'unknown error');
        return sendJson(res, 503, { success: false, error: 'Unable to verify the reset link right now.' });
    }
};
