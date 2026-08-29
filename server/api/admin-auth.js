const {
    clearAdminCookies,
    generateCsrfToken,
    getClientIp,
    getSupabaseConfig,
    isAdminEmail,
    isJsonRequest,
    checkRateLimit,
    pruneRateLimit,
    requireSameOrigin,
    sendJson,
    setAdminCookies,
    setAdminSecurityHeaders,
} = require('./_admin-utils');

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 6;
const loginHits = new Map();

setInterval(() => {
    pruneRateLimit(loginHits, LOGIN_WINDOW_MS);
}, LOGIN_WINDOW_MS).unref();

function isValidEmail(email) {
    return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(email);
}

module.exports = async function handler(req, res) {
    setAdminSecurityHeaders(res);

    if (req.method === 'DELETE') {
        if (!requireSameOrigin(req, res)) return;
        clearAdminCookies(res, req);
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

    const clientIp = getClientIp(req);
    if (checkRateLimit(loginHits, clientIp, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS)) {
        return sendJson(res, 429, { success: false, error: 'Too many login attempts. Please wait and try again.' });
    }

    const body = req.body || {};
    const rawBody = JSON.stringify(body);
    if (rawBody.length > 8192) {
        return sendJson(res, 400, { success: false, error: 'Login request is too large.' });
    }

    const unknownFields = Object.keys(body).filter(key => !['email', 'password'].includes(key));
    if (unknownFields.length > 0) {
        return sendJson(res, 400, { success: false, error: 'Unexpected fields in request.' });
    }

    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!isValidEmail(email) || password.length < 8 || password.length > 256) {
        return sendJson(res, 401, { success: false, error: 'Invalid email or password.' });
    }

    const supabase = getSupabaseConfig();
    if (!supabase) {
        return sendJson(res, 500, { success: false, error: 'Admin authentication is not configured.' });
    }

    try {
        const authResponse = await fetch(`${supabase.url}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: {
                apikey: supabase.anonKey,
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
        const expiresIn = Number(session.expires_in || 3600);
        const userEmail = String(session.user?.email || email).trim().toLowerCase();

        if (!accessToken || !isAdminEmail(userEmail)) {
            return sendJson(res, 403, { success: false, error: 'This account is not allowed to access the admin area.' });
        }

        const csrfToken = generateCsrfToken();
        setAdminCookies(res, req, accessToken, csrfToken, expiresIn);

        return sendJson(res, 200, {
            success: true,
            csrfToken,
            user: { email: userEmail },
        });
    } catch (err) {
        console.error('Admin auth error:', err instanceof Error ? err.message : 'unknown error');
        return sendJson(res, 500, { success: false, error: 'Unable to log in right now.' });
    }
};
