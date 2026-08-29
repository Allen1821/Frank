const assert = require('assert');

const passwordReset = require('../api/student-password-reset');
const passwordRecovery = require('../api/student-password-recovery');
const passwordUpdate = require('../api/student-password-update');

function makeResponse() {
    const headers = new Map();
    return {
        statusCode: 200,
        payload: null,
        setHeader(name, value) {
            headers.set(String(name).toLowerCase(), value);
        },
        getHeader(name) {
            return headers.get(String(name).toLowerCase());
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        },
    };
}

function makeRequest(body, options) {
    const settings = options || {};
    return {
        method: settings.method || 'POST',
        body: body || {},
        headers: {
            host: 'darpasolutionsllc.net',
            origin: settings.origin || 'https://darpasolutionsllc.net',
            'content-type': 'application/json',
            ...(settings.headers || {}),
        },
        socket: { remoteAddress: '127.0.0.1' },
    };
}

async function run() {
    const originalFetch = global.fetch;
    const originalEnvironment = {
        APP_ORIGIN: process.env.APP_ORIGIN,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
        STUDENT_COOKIE_SECURE: process.env.STUDENT_COOKIE_SECURE,
    };

    process.env.APP_ORIGIN = 'https://darpasolutionsllc.net';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
    process.env.STUDENT_COOKIE_SECURE = 'true';

    try {
        let fetchCalls = [];
        global.fetch = async function (url, options) {
            fetchCalls.push({ url: String(url), options: options || {} });
            return { ok: true, status: 200 };
        };

        const crossOriginResponse = makeResponse();
        await passwordReset(
            makeRequest({ email: 'student@example.com' }, { origin: 'https://attacker.example' }),
            crossOriginResponse
        );
        assert.equal(crossOriginResponse.statusCode, 403, 'Cross-origin reset requests must be rejected.');
        assert.equal(fetchCalls.length, 0, 'Rejected cross-origin requests must not reach Supabase.');

        const invalidEmailResponse = makeResponse();
        await passwordReset(makeRequest({ email: 'not-an-email' }), invalidEmailResponse);
        assert.equal(invalidEmailResponse.statusCode, 200, 'Invalid emails must receive the generic response.');
        assert.match(invalidEmailResponse.payload.message, /^If a student account exists/);
        assert.equal(fetchCalls.length, 0, 'Invalid email input must not reach Supabase.');

        const resetResponse = makeResponse();
        await passwordReset(makeRequest({ email: 'student@example.com' }), resetResponse);
        assert.equal(resetResponse.statusCode, 200);
        assert.match(resetResponse.payload.message, /^If a student account exists/);
        assert.equal(fetchCalls.length, 1);
        assert.match(fetchCalls[0].url, /\/auth\/v1\/recover\?redirect_to=/);
        assert.ok(
            fetchCalls[0].url.includes(encodeURIComponent('https://darpasolutionsllc.net/student-portal/?mode=recovery')),
            'Recovery links must return only to the production portal.'
        );

        const invalidRecoveryResponse = makeResponse();
        await passwordRecovery(
            makeRequest({ accessToken: 'short', type: 'recovery' }),
            invalidRecoveryResponse
        );
        assert.equal(invalidRecoveryResponse.statusCode, 400);

        const missingCsrfResponse = makeResponse();
        await passwordUpdate(
            makeRequest({ password: 'secure-password-123', confirmPassword: 'secure-password-123' }),
            missingCsrfResponse
        );
        assert.equal(missingCsrfResponse.statusCode, 403, 'Password updates must require recovery CSRF.');

        const weakPasswordResponse = makeResponse();
        const csrfToken = 'a'.repeat(64);
        const recoveryToken = 'r'.repeat(80);
        const authenticatedHeaders = {
            cookie: `ds_student_recovery=${recoveryToken}; ds_student_recovery_csrf=${csrfToken}`,
            'x-csrf-token': csrfToken,
        };
        await passwordUpdate(
            makeRequest(
                { password: 'short123', confirmPassword: 'short123' },
                { headers: authenticatedHeaders }
            ),
            weakPasswordResponse
        );
        assert.equal(weakPasswordResponse.statusCode, 400, 'Weak recovery passwords must be rejected.');

        fetchCalls = [];
        const updateResponse = makeResponse();
        await passwordUpdate(
            makeRequest(
                { password: 'secure-password-123', confirmPassword: 'secure-password-123' },
                { headers: authenticatedHeaders }
            ),
            updateResponse
        );
        assert.equal(updateResponse.statusCode, 200);
        assert.equal(fetchCalls.length, 2, 'Password update must be followed by global logout.');
        assert.equal(fetchCalls[0].options.method, 'PUT');
        assert.deepEqual(JSON.parse(fetchCalls[0].options.body), { password: 'secure-password-123' });
        assert.match(fetchCalls[1].url, /\/auth\/v1\/logout\?scope=global$/);
        assert.ok(
            updateResponse.getHeader('set-cookie').every(function (cookie) {
                return cookie.includes('Secure') && cookie.includes('SameSite=Lax');
            }),
            'Cleared auth cookies must preserve secure cookie attributes.'
        );

        console.log('Auth security checks passed.');
    } finally {
        global.fetch = originalFetch;
        Object.entries(originalEnvironment).forEach(function ([key, value]) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        });
    }
}

run().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
