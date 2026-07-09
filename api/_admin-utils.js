const crypto = require('crypto');

const SESSION_COOKIE = 'ds_admin_session';
const CSRF_COOKIE = 'ds_admin_csrf';
const DEFAULT_GITHUB_REPO = 'Allen1821/Frank';
const DEFAULT_CONTENT_PATH = 'content/site-content.json';

function setAdminSecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cache-Control', 'no-store');
}

function sendJson(res, statusCode, payload) {
    setAdminSecurityHeaders(res);
    return res.status(statusCode).json(payload);
}

function getClientIp(req) {
    return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
        || req.socket?.remoteAddress
        || 'unknown';
}

function isJsonRequest(req) {
    return String(req.headers['content-type'] || '').toLowerCase().includes('application/json');
}

function checkRateLimit(store, key, maxHits, windowMs) {
    const now = Date.now();
    const entry = store.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
        store.set(key, { windowStart: now, count: 1 });
        return false;
    }

    entry.count += 1;
    return entry.count > maxHits;
}

function pruneRateLimit(store, windowMs) {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (now - entry.windowStart > windowMs) store.delete(key);
    }
}

function parseCookies(req) {
    const header = String(req.headers.cookie || '');
    const cookies = {};

    header.split(';').forEach(part => {
        const trimmed = part.trim();
        if (!trimmed) return;

        const equalsIndex = trimmed.indexOf('=');
        if (equalsIndex === -1) return;

        const name = trimmed.slice(0, equalsIndex).trim();
        const value = trimmed.slice(equalsIndex + 1);
        if (!name) return;

        try {
            cookies[name] = decodeURIComponent(value);
        } catch {
            cookies[name] = value;
        }
    });

    return cookies;
}

function serializeCookie(name, value, options) {
    const cookieOptions = options || {};
    const parts = [`${name}=${encodeURIComponent(value)}`];

    if (cookieOptions.maxAge !== undefined) {
        parts.push(`Max-Age=${Math.max(0, Math.floor(cookieOptions.maxAge))}`);
    }

    parts.push(`Path=${cookieOptions.path || '/'}`);

    if (cookieOptions.httpOnly) parts.push('HttpOnly');
    if (cookieOptions.secure) parts.push('Secure');

    parts.push(`SameSite=${cookieOptions.sameSite || 'Lax'}`);
    return parts.join('; ');
}

function shouldUseSecureCookie(req) {
    const configured = String(process.env.ADMIN_COOKIE_SECURE || '').trim().toLowerCase();
    if (configured === 'true') return true;
    if (configured === 'false') return false;

    const host = String(req.headers.host || '').toLowerCase();
    if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return false;

    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    return proto === 'https' || process.env.NODE_ENV === 'production';
}

function setAdminCookies(res, req, accessToken, csrfToken, maxAgeSeconds) {
    const secure = shouldUseSecureCookie(req);
    const maxAge = Math.max(60, Math.min(Number(maxAgeSeconds) || 3600, 3600));

    res.setHeader('Set-Cookie', [
        serializeCookie(SESSION_COOKIE, accessToken, {
            httpOnly: true,
            secure,
            sameSite: 'Lax',
            maxAge,
        }),
        serializeCookie(CSRF_COOKIE, csrfToken, {
            httpOnly: false,
            secure,
            sameSite: 'Lax',
            maxAge,
        }),
    ]);
}

function clearAdminCookies(res, req) {
    const secure = shouldUseSecureCookie(req);

    res.setHeader('Set-Cookie', [
        serializeCookie(SESSION_COOKIE, '', {
            httpOnly: true,
            secure,
            sameSite: 'Lax',
            maxAge: 0,
        }),
        serializeCookie(CSRF_COOKIE, '', {
            httpOnly: false,
            secure,
            sameSite: 'Lax',
            maxAge: 0,
        }),
    ]);
}

function generateCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
}

function getSupabaseConfig() {
    const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();

    if (!url || !anonKey) return null;
    return { url, anonKey };
}

function getAdminEmails() {
    return new Set(
        String(process.env.ADMIN_EMAILS || '')
            .split(',')
            .map(email => email.trim().toLowerCase())
            .filter(Boolean)
    );
}

function isAdminEmail(email) {
    const allowed = getAdminEmails();
    return allowed.size > 0 && allowed.has(String(email || '').trim().toLowerCase());
}

async function getSupabaseUser(accessToken) {
    const config = getSupabaseConfig();
    if (!config) {
        return {
            ok: false,
            status: 500,
            error: 'Admin authentication is not configured.',
        };
    }

    const response = await fetch(`${config.url}/auth/v1/user`, {
        method: 'GET',
        headers: {
            apikey: config.anonKey,
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        return {
            ok: false,
            status: 401,
            error: 'Admin session has expired. Please log in again.',
        };
    }

    const user = await response.json();
    if (!isAdminEmail(user.email)) {
        return {
            ok: false,
            status: 403,
            error: 'This account is not allowed to access the admin area.',
        };
    }

    return { ok: true, user };
}

async function requireAdmin(req, res) {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (!token) {
        sendJson(res, 401, { success: false, error: 'Please log in.' });
        return null;
    }

    const result = await getSupabaseUser(token);
    if (!result.ok) {
        sendJson(res, result.status, { success: false, error: result.error });
        return null;
    }

    return result.user;
}

function sameOriginRequest(req) {
    const origin = String(req.headers.origin || '').trim();
    if (!origin) return true;

    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
        .split(',')[0]
        .trim();
    if (!host) return false;

    const protoHeader = String(req.headers['x-forwarded-proto'] || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
    const proto = protoHeader || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');

    try {
        return new URL(origin).origin === `${proto}://${host}`;
    } catch {
        return false;
    }
}

function requireSameOrigin(req, res) {
    if (sameOriginRequest(req)) return true;
    sendJson(res, 403, { success: false, error: 'Cross-origin admin requests are not allowed.' });
    return false;
}

function requireCsrf(req, res) {
    const cookies = parseCookies(req);
    const csrfCookie = cookies[CSRF_COOKIE] || '';
    const csrfHeader = String(req.headers['x-csrf-token'] || '').trim();

    if (csrfCookie && csrfHeader && csrfCookie === csrfHeader) return true;

    sendJson(res, 403, { success: false, error: 'Admin request verification failed.' });
    return false;
}

function getCsrfCookie(req) {
    return parseCookies(req)[CSRF_COOKIE] || '';
}

function getGithubConfig() {
    const repo = String(process.env.GITHUB_REPO || DEFAULT_GITHUB_REPO).trim();
    const token = String(process.env.GITHUB_TOKEN || '').trim();
    const branch = String(process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || 'Demo').trim();
    const contentPath = String(process.env.ADMIN_CONTENT_PATH || DEFAULT_CONTENT_PATH).trim();

    const [owner, name] = repo.split('/');
    if (!owner || !name || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) {
        return { ok: false, error: 'GITHUB_REPO must use owner/repo format.' };
    }

    if (!token) return { ok: false, error: 'GITHUB_TOKEN is not configured.' };
    if (!branch || !/^[A-Za-z0-9._/-]+$/.test(branch)) {
        return { ok: false, error: 'GITHUB_BRANCH is invalid.' };
    }
    if (contentPath !== DEFAULT_CONTENT_PATH) {
        return { ok: false, error: 'Only content/site-content.json can be edited from admin.' };
    }

    return { ok: true, owner, repo: name, token, branch, contentPath };
}

module.exports = {
    CSRF_COOKIE,
    SESSION_COOKIE,
    clearAdminCookies,
    generateCsrfToken,
    getClientIp,
    getCsrfCookie,
    getGithubConfig,
    getSupabaseConfig,
    isAdminEmail,
    isJsonRequest,
    checkRateLimit,
    pruneRateLimit,
    requireAdmin,
    requireCsrf,
    requireSameOrigin,
    sendJson,
    setAdminCookies,
    setAdminSecurityHeaders,
};
