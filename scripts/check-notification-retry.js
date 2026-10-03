// Exercises the browser retry helpers in isolation. No mail service is contacted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(require.resolve('../admin/admin.js'), 'utf8');
const start = source.indexOf('    async function notificationRequestId(notification) {');
const end = source.indexOf('    function updatePendingBadge(', start);
assert.ok(start > 0 && end > start);
const values = new Map();
const context = {
    TextEncoder, Date, Uint8Array, Array, Object, JSON, Number,
    sessionEmail: { textContent: 'owner@example.test' },
    UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    sessionStorage: { getItem(k) { return values.get(k) || null; }, setItem(k, v) { values.set(k, v); } },
    window: { crypto: webcrypto },
};
vm.runInNewContext(source.slice(start, end) + '\nglobalThis.helpers = { notificationRequestId, clearPendingNotification };', context);
async function run() {
    const a = { scope: 'all_active', studentId: '', certificateCode: '', subject: 'Subject', message: 'First message' };
    const b = { ...a, message: 'Edited message' };
    const a1 = await context.helpers.notificationRequestId(a);
    const a2 = await context.helpers.notificationRequestId(a);
    assert.equal(a1.id, a2.id, 'same composition must reuse request ID');
    const b1 = await context.helpers.notificationRequestId(b);
    assert.notEqual(a1.id, b1.id, 'edited composition must get separate request ID');
    const a3 = await context.helpers.notificationRequestId(a);
    assert.equal(a1.id, a3.id, 'returning to uncertain composition must retain ID');
    const stored = values.get('frank-pending-notifications');
    assert.doesNotMatch(stored, /owner@example|First message|Edited message|Subject/);
    context.helpers.clearPendingNotification(b1.fingerprint);
    const a4 = await context.helpers.notificationRequestId(a);
    assert.equal(a1.id, a4.id, 'success of another composition must preserve uncertain ID');
    const b2 = await context.helpers.notificationRequestId(b);
    assert.notEqual(b1.id, b2.id, 'completed composition may be sent anew');
    console.log('Notification retry checks passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
