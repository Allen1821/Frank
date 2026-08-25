const crypto = require('crypto');

const ACCESS_COOKIE = 'ds_student_access';
const REFRESH_COOKIE = 'ds_student_refresh';
const CSRF_COOKIE = 'ds_student_csrf';
const RECOVERY_COOKIE = 'ds_student_recovery';
const RECOVERY_CSRF_COOKIE = 'ds_student_recovery_csrf';
const ACCESS_MAX_AGE = 60 * 60;
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;
const RECOVERY_MAX_AGE = 10 * 60;

function setStudentSecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
}

function sendJson(res, statusCode, payload) {
    setStudentSecurityHeaders(res);
    return res.status(statusCode).json(payload);
}

function getClientIp(req) {
    return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
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
    const cookies = {};
    String(req.headers.cookie || '').split(';').forEach(function (part) {
        const trimmed = part.trim();
        const separator = trimmed.indexOf('=');
        if (separator < 1) return;

        const name = trimmed.slice(0, separator).trim();
        const value = trimmed.slice(separator + 1);
        try {
            cookies[name] = decodeURIComponent(value);
        } catch {
            cookies[name] = value;
        }
    });
    return cookies;
}

function serializeCookie(name, value, options) {
    const settings = options || {};
    const parts = [name + '=' + encodeURIComponent(value)];
    if (settings.maxAge !== undefined) {
        parts.push('Max-Age=' + Math.max(0, Math.floor(settings.maxAge)));
    }
    parts.push('Path=/');
    if (settings.httpOnly) parts.push('HttpOnly');
    if (settings.secure) parts.push('Secure');
    parts.push('SameSite=' + (settings.sameSite || 'Lax'));
    return parts.join('; ');
}

function appendSetCookies(res, cookies) {
    const existing = res.getHeader('Set-Cookie');
    const current = Array.isArray(existing) ? existing : existing ? [existing] : [];
    res.setHeader('Set-Cookie', current.concat(cookies));
}

function shouldUseSecureCookie(req) {
    const configured = String(
        process.env.STUDENT_COOKIE_SECURE
        || process.env.ADMIN_COOKIE_SECURE
        || ''
    ).trim().toLowerCase();
    if (configured === 'true') return true;
    if (configured === 'false') return false;

    const host = String(req.headers.host || '').toLowerCase();
    if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return false;

    const proto = String(req.headers['x-forwarded-proto'] || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
    return proto === 'https' || process.env.NODE_ENV === 'production';
}

function setStudentCookies(res, req, session, csrfToken) {
    const secure = shouldUseSecureCookie(req);
    const accessMaxAge = Math.max(60, Math.min(Number(session.expires_in) || ACCESS_MAX_AGE, ACCESS_MAX_AGE));
    appendSetCookies(res, [
        serializeCookie(ACCESS_COOKIE, String(session.access_token || ''), {
            httpOnly: true,
            secure,
            sameSite: 'Lax',
            maxAge: accessMaxAge,
        }),
        serializeCookie(REFRESH_COOKIE, String(session.refresh_token || ''), {
            httpOnly: true,
            secure,
            sameSite: 'Lax',
            maxAge: REFRESH_MAX_AGE,
        }),
        serializeCookie(CSRF_COOKIE, csrfToken, {
            httpOnly: false,
            secure,
            sameSite: 'Lax',
            maxAge: REFRESH_MAX_AGE,
        }),
    ]);
}

function clearStudentCookies(res, req) {
    const secure = shouldUseSecureCookie(req);
    appendSetCookies(res, [
        serializeCookie(ACCESS_COOKIE, '', { httpOnly: true, secure, sameSite: 'Lax', maxAge: 0 }),
        serializeCookie(REFRESH_COOKIE, '', { httpOnly: true, secure, sameSite: 'Lax', maxAge: 0 }),
        serializeCookie(CSRF_COOKIE, '', { httpOnly: false, secure, sameSite: 'Lax', maxAge: 0 }),
    ]);
}

function setStudentRecoveryCookies(res, req, accessToken, csrfToken) {
    const secure = shouldUseSecureCookie(req);
    appendSetCookies(res, [
        serializeCookie(RECOVERY_COOKIE, accessToken, {
            httpOnly: true,
            secure,
            sameSite: 'Lax',
            maxAge: RECOVERY_MAX_AGE,
        }),
        serializeCookie(RECOVERY_CSRF_COOKIE, csrfToken, {
            httpOnly: false,
            secure,
            sameSite: 'Lax',
            maxAge: RECOVERY_MAX_AGE,
        }),
    ]);
}

function clearStudentRecoveryCookies(res, req) {
    const secure = shouldUseSecureCookie(req);
    appendSetCookies(res, [
        serializeCookie(RECOVERY_COOKIE, '', { httpOnly: true, secure, sameSite: 'Lax', maxAge: 0 }),
        serializeCookie(RECOVERY_CSRF_COOKIE, '', { httpOnly: false, secure, sameSite: 'Lax', maxAge: 0 }),
    ]);
}

function getStudentRecoveryToken(req) {
    return parseCookies(req)[RECOVERY_COOKIE] || '';
}

function generateCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
}

function getSupabaseConfig() {
    const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const publishableKey = String(
        process.env.SUPABASE_PUBLISHABLE_KEY
        || process.env.SUPABASE_ANON_KEY
        || ''
    ).trim();
    if (!url || !publishableKey) return null;
    return { url, publishableKey };
}

function isValidEmail(email) {
    return /^[a-zA-Z0-9.!#$%&'*+/=?^_{}|~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(email);
}

async function getSupabaseUser(accessToken) {
    const config = getSupabaseConfig();
    if (!config) return { ok: false, status: 503, error: 'Student portal authentication is not configured.' };

    let response;
    try {
        response = await fetch(config.url + '/auth/v1/user', {
            method: 'GET',
            headers: {
                apikey: config.publishableKey,
                Authorization: 'Bearer ' + accessToken,
            },
            signal: AbortSignal.timeout(10000),
        });
    } catch {
        return { ok: false, status: 503, error: 'Unable to verify the student session.' };
    }

    if (!response.ok) {
        return { ok: false, status: 401, error: 'Student session has expired. Please log in again.' };
    }
    return { ok: true, user: await response.json() };
}

async function refreshStudentSession(refreshToken) {
    const config = getSupabaseConfig();
    if (!config || !refreshToken) return null;

    try {
        const response = await fetch(config.url + '/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: {
                apikey: config.publishableKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refresh_token: refreshToken }),
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

async function requireStudent(req, res) {
    const cookies = parseCookies(req);
    let accessToken = cookies[ACCESS_COOKIE] || '';
    let csrfToken = cookies[CSRF_COOKIE] || '';
    let result = accessToken ? await getSupabaseUser(accessToken) : null;

    if (!result?.ok && cookies[REFRESH_COOKIE]) {
        const session = await refreshStudentSession(cookies[REFRESH_COOKIE]);
        if (session?.access_token && session?.refresh_token) {
            accessToken = String(session.access_token);
            csrfToken = csrfToken || generateCsrfToken();
            setStudentCookies(res, req, session, csrfToken);
            result = session.user
                ? { ok: true, user: session.user }
                : await getSupabaseUser(accessToken);
        }
    }

    if (!result?.ok) {
        clearStudentCookies(res, req);
        sendJson(res, result?.status || 401, {
            success: false,
            error: result?.error || 'Please log in.',
        });
        return null;
    }

    if (!csrfToken && cookies[REFRESH_COOKIE]) {
        csrfToken = generateCsrfToken();
        setStudentCookies(res, req, {
            access_token: accessToken,
            refresh_token: cookies[REFRESH_COOKIE],
            expires_in: ACCESS_MAX_AGE,
        }, csrfToken);
    }
    return { user: result.user, accessToken, csrfToken };
}

function sameOriginRequest(req) {
    const origin = String(req.headers.origin || '').trim();
    if (!origin) return true;

    const configuredOrigin = String(process.env.APP_ORIGIN || '').trim().replace(/\/+$/, '');
    if (configuredOrigin) {
        try {
            return new URL(origin).origin === new URL(configuredOrigin).origin;
        } catch {
            return false;
        }
    }

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
        return new URL(origin).origin === proto + '://' + host;
    } catch {
        return false;
    }
}

function requireSameOrigin(req, res) {
    if (sameOriginRequest(req)) return true;
    sendJson(res, 403, { success: false, error: 'Cross-origin student requests are not allowed.' });
    return false;
}

function requireCsrf(req, res) {
    const cookieToken = parseCookies(req)[CSRF_COOKIE] || '';
    const headerToken = String(req.headers['x-csrf-token'] || '').trim();
    if (
        cookieToken
        && headerToken
        && cookieToken.length === headerToken.length
        && crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
    ) {
        return true;
    }
    sendJson(res, 403, { success: false, error: 'Student request verification failed.' });
    return false;
}

function requireRecoveryCsrf(req, res) {
    const cookieToken = parseCookies(req)[RECOVERY_CSRF_COOKIE] || '';
    const headerToken = String(req.headers['x-csrf-token'] || '').trim();
    if (
        cookieToken
        && headerToken
        && cookieToken.length === headerToken.length
        && crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
    ) {
        return true;
    }
    sendJson(res, 403, { success: false, error: 'Password reset verification failed. Request a new reset link.' });
    return false;
}

module.exports = {
    checkRateLimit,
    clearStudentRecoveryCookies,
    clearStudentCookies,
    generateCsrfToken,
    getClientIp,
    getStudentRecoveryToken,
    getSupabaseConfig,
    isJsonRequest,
    isValidEmail,
    pruneRateLimit,
    requireCsrf,
    requireRecoveryCsrf,
    requireSameOrigin,
    requireStudent,
    sendJson,
    setStudentRecoveryCookies,
    setStudentCookies,
    setStudentSecurityHeaders,
};
