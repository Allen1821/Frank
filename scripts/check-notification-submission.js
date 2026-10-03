// Runs the actual browser submit handler against synthetic DOM and HTTP responses.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(require.resolve('../admin/admin.js'), 'utf8');
const start = source.indexOf('    async function handleStudentNotification(event) {');
const end = source.indexOf('    function updatePendingBadge(', start);
assert.ok(start > 0 && end > start);
const storage = new Map();
const requests = [];
let attempts = 0;
const button = { disabled: false };
const status = { textContent: '' };
const context = {
    TextEncoder, Date, Uint8Array, Array, Object, JSON, Number,
    sessionEmail: { textContent: 'owner@example.test' },
    studentRecords: [{ id: '00000000-0000-4000-8000-000000000001', email: 'synthetic@example.test', portalActive: true }],
    studentNotificationForm: { reportValidity() { return true; }, reset() {} },
    studentNotificationButton: button, studentNotificationStatus: status,
    studentNotificationSubject: { value: 'Synthetic subject' },
    studentNotificationMessage: { value: 'Synthetic message long enough.' },
    csrfToken: 'synthetic-csrf',
    UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    FormData: class { get(name) { return name === 'scope' ? 'all_active' : ''; } },
    window: { crypto: webcrypto, confirm() { return true; } },
    sessionStorage: { getItem(k) { return storage.get(k) || null; }, setItem(k, v) { storage.set(k, v); } },
    fetch: async (path, options) => {
        assert.equal(path, '/api/admin-student-notification');
        requests.push(JSON.parse(options.body));
        attempts += 1;
        return attempts === 1
            ? { ok: false, status: 502, json: async () => ({ success: false, error: 'Synthetic second batch failed.' }) }
            : { ok: true, status: 200, json: async () => ({ success: true, message: 'Synthetic delivery complete.' }) };
    },
    setStatus(element, message) { element.textContent = message; },
    setButtonBusy() {}, updateStudentNotificationControls() {},
    studentHasCertificate() { throw new Error('Unexpected certificate path'); },
    showLogin() { throw new Error('Unexpected login path'); },
};
vm.runInNewContext(source.slice(start, end) + '\nglobalThis.submit = handleStudentNotification;', context);
async function run() {
    const event = { preventDefault() {} };
    await context.submit(event);
    assert.equal(requests.length, 1);
    assert.match(status.textContent, /uncertain/);
    await context.submit(event);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].requestId, requests[1].requestId, 'partial retry must reuse the request ID');
    assert.equal(requests[0].message, 'Synthetic message long enough.');
    assert.equal(status.textContent, 'Synthetic delivery complete.');
    assert.deepEqual(JSON.parse(storage.get('frank-pending-notifications')), {});
    console.log('Notification submission and partial retry checks passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

