const assert = require('assert');

const passwordReset = require('../server/api/student-password-reset');
const passwordRecovery = require('../server/api/student-password-recovery');
const passwordUpdate = require('../server/api/student-password-update');
const studentRegister = require('../server/api/student-register');
const registrationEmail = require('../server/api/_student-registration-email');
const apiRouter = require('../api/router');

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
            host: 'www.darpasolutionsllc.net',
            origin: settings.origin || 'https://www.darpasolutionsllc.net',
            'content-type': 'application/json',
            ...(settings.headers || {}),
        },
        socket: { remoteAddress: '127.0.0.1' },
    };
}

async function run() {
    const originalFetch = global.fetch;
    const originalSendRegistrationEmail = registrationEmail.sendStudentRegistrationEmail;
    const originalEnvironment = {
        APP_ORIGIN: process.env.APP_ORIGIN,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
        STUDENT_COOKIE_SECURE: process.env.STUDENT_COOKIE_SECURE,
        RESEND_API_KEY: process.env.RESEND_API_KEY,
    };

    process.env.APP_ORIGIN = 'https://www.darpasolutionsllc.net';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
    process.env.STUDENT_COOKIE_SECURE = 'true';

    try {
        let fetchCalls = [];
        global.fetch = async function (url, options) {
            fetchCalls.push({ url: String(url), options: options || {} });
            return { ok: true, status: 200 };
        };

        const routedResetRequest = makeRequest({ email: 'not-an-email' });
        routedResetRequest.query = { route: ['student-password-reset'] };
        const routedResetResponse = makeResponse();
        await apiRouter(routedResetRequest, routedResetResponse);
        assert.equal(routedResetResponse.statusCode, 200, 'The catch-all API router must preserve reset URLs.');
        assert.match(routedResetResponse.payload.message, /^If a student account exists/);

        const missingRouteRequest = makeRequest({});
        missingRouteRequest.query = { route: ['not-a-real-route'] };
        const missingRouteResponse = makeResponse();
        await apiRouter(missingRouteRequest, missingRouteResponse);
        assert.equal(missingRouteResponse.statusCode, 404, 'Unknown catch-all API routes must fail closed.');

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
            fetchCalls[0].url.includes(encodeURIComponent('https://www.darpasolutionsllc.net/student-portal/?mode=recovery')),
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

        fetchCalls = [];
        global.fetch = async function (url, options) {
            fetchCalls.push({ url: String(url), options: options || {} });
            return {
                ok: true,
                status: 200,
                async json() {
                    return {
                        user: {
                            id: '00000000-0000-0000-0000-000000000000',
                            identities: [],
                        },
                    };
                },
            };
        };

        const repeatedSignupResponse = makeResponse();
        await studentRegister(
            makeRequest({
                fullName: 'Student Tester',
                email: 'existing-student@example.com',
                password: 'secure-password-123',
                confirmPassword: 'secure-password-123',
                courseCode: '6010',
            }),
            repeatedSignupResponse
        );
        assert.equal(repeatedSignupResponse.statusCode, 409, 'Repeated student signups must not report success.');
        assert.equal(repeatedSignupResponse.payload.code, 'ACCOUNT_EXISTS');
        assert.match(repeatedSignupResponse.payload.error, /Sign in or use Forgot Password/);
        assert.equal(fetchCalls.length, 1, 'Valid student registration attempts must reach Supabase once.');

        let registrationNotification = null;
        registrationEmail.sendStudentRegistrationEmail = async function (registration) {
            registrationNotification = registration;
            return { sent: true, id: 'email-test-id' };
        };
        fetchCalls = [];
        global.fetch = async function (url, options) {
            fetchCalls.push({ url: String(url), options: options || {} });
            return {
                ok: true,
                status: 200,
                async json() {
                    return {
                        user: {
                            id: '11111111-1111-4111-8111-111111111111',
                            identities: [{ id: 'identity-test-id' }],
                        },
                    };
                },
            };
        };

        const newSignupResponse = makeResponse();
        await studentRegister(
            makeRequest({
                fullName: 'New Student',
                email: 'new-student@example.com',
                password: 'secure-password-456',
                confirmPassword: 'secure-password-456',
                courseCode: 'recertification-6020',
            }),
            newSignupResponse
        );
        assert.equal(newSignupResponse.statusCode, 202, 'New student signups must be accepted for review.');
        assert.equal(newSignupResponse.payload.notificationSent, true, 'A successful signup must notify Frank.');
        assert.equal(fetchCalls.length, 1, 'The signup must create exactly one Supabase user.');
        assert.equal(registrationNotification.fullName, 'New Student');
        assert.equal(registrationNotification.email, 'new-student@example.com');
        assert.equal(registrationNotification.courseCode, 'recertification-6020');
        assert.equal(Object.hasOwn(registrationNotification, 'password'), false, 'Notification data must never include a password.');

        const emailFixture = {
            userId: '11111111-1111-4111-8111-111111111111',
            fullName: '<New Student>',
            email: 'new-student@example.com',
            courseCode: '6020',
            requestedAt: 'September 3, 2026 at 10:30 AM EDT',
            adminUrl: 'https://www.darpasolutionsllc.net/admin/',
        };
        const emailHtml = registrationEmail.buildRegistrationEmailHtml(emailFixture);
        const emailText = registrationEmail.buildRegistrationEmailText(emailFixture);
        assert.match(emailHtml, /&lt;New Student&gt;/, 'Registration email HTML must escape student input.');
        assert.doesNotMatch(emailHtml, /<New Student>/, 'Untrusted student input must not become email markup.');
        assert.match(emailText, /ASSE 6020 — Medical Gas Systems Inspector/);
        assert.match(emailText, /new-student@example\.com/);

        let resendMessage = null;
        let resendOptions = null;
        const delivery = await originalSendRegistrationEmail(emailFixture, {
            apiKey: 'test-resend-key',
            recipient: 'ahnguyen2019@gmail.com',
            resend: {
                emails: {
                    async send(message, options) {
                        resendMessage = message;
                        resendOptions = options;
                        return { data: { id: 'test-delivery-id' }, error: null };
                    },
                },
            },
        });
        assert.equal(delivery.sent, true);
        assert.deepEqual(resendMessage.to, ['ahnguyen2019@gmail.com']);
        assert.equal(resendMessage.replyTo, 'new-student@example.com');
        assert.match(resendMessage.subject, /ASSE 6020/);
        assert.equal(resendOptions.idempotencyKey, 'student-registration-' + emailFixture.userId);

        console.log('Auth security checks passed.');
    } finally {
        global.fetch = originalFetch;
        registrationEmail.sendStudentRegistrationEmail = originalSendRegistrationEmail;
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
