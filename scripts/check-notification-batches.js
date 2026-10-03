// Offline API integration: a fake Resend records actual simulated deliveries.
const assert = require('node:assert/strict');
const resendPath = require.resolve('resend');
const cached = require.cache[resendPath];
require(resendPath);
const originalResend = require.cache[resendPath].exports;
const originalFetch = global.fetch;
const keys = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'ADMIN_ROLES_ENFORCED',
    'ADMIN_MFA_REQUIRED', 'ADMIN_EMAILS', 'RESEND_API_KEY', 'STUDENT_NOTIFICATION_FROM'];
const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
Object.assign(process.env, { SUPABASE_URL: 'https://offline.invalid', SUPABASE_PUBLISHABLE_KEY: 'offline-key',
    ADMIN_ROLES_ENFORCED: 'false', ADMIN_MFA_REQUIRED: 'false', ADMIN_EMAILS: 'owner@example.test', RESEND_API_KEY: 'offline-key',
    STUDENT_NOTIFICATION_FROM: 'Offline Sender <offline@example.test>',
});
const deliveries = new Map();
let failSecondOnce = true;
require.cache[resendPath].exports = { Resend: class {
    constructor() { this.batch = { send: async (batch, options) => {
        const key = options.idempotencyKey;
        const payload = JSON.stringify(batch);
        if (deliveries.has(key)) {
            assert.equal(deliveries.get(key).payload, payload, 'retry must preserve payload for provider key');
            return { data: { data: deliveries.get(key).result } };
        }
        if (key.endsWith('-1') && failSecondOnce) {
            failSecondOnce = false;
            return { error: { message: 'synthetic second-batch failure' } };
        }
        const result = batch.map((_, i) => ({ id: key + '-' + i }));
        deliveries.set(key, { payload, result });
        return { data: { data: result } };
    } }; }
} };
const handler = require('../server/api/admin-student-notification');
const userId = '00000000-0000-4000-8000-000000000001';
const jwt = 'x.' + Buffer.from(JSON.stringify({ sub: userId, aal: 'aal2',
    exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.x';
const students = Array.from({ length: 101 }, (_, i) => ({
    id: '00000000-0000-4000-8000-' + (i + 100).toString().padStart(12, '0'),
    full_name: 'Synthetic Student ' + i, email: 'student' + i + '@example.test',
}));
global.fetch = async url => {
    const path = new URL(url).pathname;
    if (path === '/auth/v1/user') return { ok: true, json: async () => ({ id: userId,
        email: 'owner@example.test', factors: [] }) };
    if (path === '/rest/v1/portal_admins') return { ok: true, json: async () => [{ role: 'owner' }] };
    if (path === '/rest/v1/students') return { ok: true, json: async () => students };
    throw new Error('Unexpected upstream request: ' + path);
};
async function send(requestId) {
    const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; },
        json(data) { this.data = data; return this; } };
    await handler({ method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000',
        'content-type': 'application/json', cookie: 'ds_admin_session=' + jwt + '; ds_admin_csrf=csrf',
        'x-csrf-token': 'csrf',
    }, body: { scope: 'all_active', studentId: '', certificateCode: '', subject: 'Synthetic notice',
        message: 'This is a synthetic integration test message.', requestId,
    } }, res);
    return res;
}
async function run() {
    const requestId = '00000000-0000-4000-8000-000000000010';
    assert.equal((await send(requestId)).code, 502, 'later batch fails after first is accepted');
    assert.equal(deliveries.size, 1);
    const retry = await send(requestId);
    assert.equal(retry.code, 200); assert.equal(retry.data.sent, 101);
    assert.equal(deliveries.size, 2, 'first batch is reused, not duplicated');
    console.log('Synthetic two-batch notification retry passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    global.fetch = originalFetch;
    require.cache[resendPath].exports = originalResend;
    if (!cached) delete require.cache[resendPath];
    for (const [key, value] of Object.entries(old)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
});
