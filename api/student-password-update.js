const {
    clearStudentCookies,
    clearStudentRecoveryCookies,
    getStudentRecoveryToken,
    getSupabaseConfig,
    isJsonRequest,
    requireRecoveryCsrf,
    requireSameOrigin,
    sendJson,
    setStudentSecurityHeaders,
} = require('./_student-utils');

function isStrongPassword(password) {
    return password.length >= 12
        && password.length <= 256
        && /[A-Za-z]/.test(password)
        && /\d/.test(password);
}

module.exports = async function handler(req, res) {
    setStudentSecurityHeaders(res);
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return sendJson(res, 405, { success: false, error: 'Method not allowed.' });
    }
    if (!requireSameOrigin(req, res) || !requireRecoveryCsrf(req, res)) return;
    if (!isJsonRequest(req)) {
        return sendJson(res, 400, { success: false, error: 'Content-Type must be application/json.' });
    }

    const body = req.body || {};
    const unknownFields = Object.keys(body).filter(function (key) {
        return !['password', 'confirmPassword'].includes(key);
    });
    const password = String(body.password || '');
    const confirmPassword = String(body.confirmPassword || '');
    if (JSON.stringify(body).length > 4096 || unknownFields.length || !isStrongPassword(password)) {
        return sendJson(res, 400, {
            success: false,
            error: 'Use at least 12 characters with at least one letter and one number.',
        });
    }
    if (password !== confirmPassword) {
        return sendJson(res, 400, { success: false, error: 'Passwords do not match.' });
    }

    const accessToken = getStudentRecoveryToken(req);
    const config = getSupabaseConfig();
    if (!accessToken || !config) {
        clearStudentRecoveryCookies(res, req);
        return sendJson(res, 401, { success: false, error: 'This password reset session has expired.' });
    }

    try {
        const response = await fetch(config.url + '/auth/v1/user', {
            method: 'PUT',
            headers: {
                apikey: config.publishableKey,
                Authorization: 'Bearer ' + accessToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password }),
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) clearStudentRecoveryCookies(res, req);
            return sendJson(res, response.status === 401 || response.status === 403 ? 401 : 400, {
                success: false,
                error: response.status === 401 || response.status === 403
                    ? 'This password reset session has expired. Request a new reset link.'
                    : 'The new password could not be saved. Try a different password.',
            });
        }

        try {
            await fetch(config.url + '/auth/v1/logout?scope=global', {
                method: 'POST',
                headers: {
                    apikey: config.publishableKey,
                    Authorization: 'Bearer ' + accessToken,
                },
                signal: AbortSignal.timeout(8000),
            });
        } catch {
            // The password is already changed; local recovery credentials are still cleared below.
        }

        clearStudentRecoveryCookies(res, req);
        clearStudentCookies(res, req);
        return sendJson(res, 200, {
            success: true,
            message: 'Password updated. Sign in with your new password.',
        });
    } catch (error) {
        console.error('Student password update error:', error instanceof Error ? error.message : 'unknown error');
        return sendJson(res, 503, { success: false, error: 'Unable to update the password right now.' });
    }
};
