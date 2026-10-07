// Offline API regression checks; all upstream calls and Drive reads are mocked.
const assert = require('node:assert/strict');
const drivePath = require.resolve('../server/api/_google-drive');
const drive = require(drivePath);
let driveReads = 0;
require.cache[drivePath].exports = { ...drive,
    listDriveFolderTree: async () => { driveReads++; return { folder: { id: 'canonical-folder-id' }, items: [] }; },
};
const handler = require('../server/api/admin-student-folder');
const ORIGIN = 'https://www.darpasolutionsllc.net';
const DB = 'https://conflict-tests.invalid';
const STUDENT = '22222222-2222-4222-8222-222222222222';
const OWNER = '33333333-3333-4333-8333-333333333333';
const CSRF = 'a'.repeat(64);
Object.assign(process.env, { APP_ORIGIN: ORIGIN, ADMIN_EMAILS: 'admin@example.test',
    SUPABASE_URL: DB, SUPABASE_PUBLISHABLE_KEY: 'synthetic-public-key' });
async function invoke({ auth = 'admin@example.test', cookie = true, csrf = true,
    status = 409, mappings = [{ student_id: OWNER }], students = [{ id: OWNER, full_name: 'Same Name', student_number: 'ST-002' }],
    replacement = false, lookupStatus = 200, profileStatus = 200, lookupThrow = false, lookupJson = false } = {}) {
    const calls = [];
    driveReads = 0;
    global.fetch = async (input, options = {}) => {
        const url = new URL(input);
        calls.push({ url, options });
        assert.equal(url.origin, DB, 'No live network');
        let data, code = 200;
        if (url.pathname === '/auth/v1/user') data = { id: STUDENT, email: auth };
        else {
            assert.equal(options.headers.Authorization, 'Bearer synthetic-session');
            assert.equal(options.headers.apikey, 'synthetic-public-key');
            assert.ok(options.signal);
            if (['POST', 'PATCH'].includes(options.method)) { data = {}; code = status; }
            else if (url.searchParams.get('google_drive_folder_id')) {
                assert.equal(url.searchParams.get('google_drive_folder_id'), 'eq.canonical-folder-id');
                assert.equal(url.searchParams.get('student_id'), 'neq.' + STUDENT);
                assert.equal(url.searchParams.get('select'), 'student_id');
                assert.equal(url.searchParams.get('limit'), '2');
                if (lookupThrow) throw new Error('secret upstream error');
                data = mappings; code = lookupStatus;
            } else if (url.pathname === '/rest/v1/students') {
                assert.equal(url.searchParams.get('id'), 'eq.' + OWNER);
                assert.equal(url.searchParams.get('select'), 'id,full_name,student_number');
                data = students; code = profileStatus;
            } else { assert.equal(url.searchParams.get('student_id'), 'eq.' + STUDENT); data = replacement ? [{ id: STUDENT }] : []; }
        }
        return { ok: code >= 200 && code < 300, status: code, json: async () => {
            if (lookupJson && url.searchParams.get('google_drive_folder_id')) throw new Error('secret invalid JSON');
            return data;
        } };
    };
    const headers = {};
    const res = { statusCode: 200, setHeader: (k,v) => { headers[k.toLowerCase()] = v; },
        status(n) { this.statusCode=n; return this; }, json(data) { this.payload=data; return this; } };
    await handler({ method: 'POST', body: { studentId: STUDENT, title: 'Student Records', driveFolder: 'supplied-folder-id' },
        headers: { host: new URL(ORIGIN).host, origin: ORIGIN, 'content-type': 'application/json',
            cookie: (cookie ? 'ds_admin_session=synthetic-session; ' : '') + 'ds_admin_csrf=' + CSRF,
            'x-csrf-token': csrf ? CSRF : '' } }, res);
    assert.match(headers['cache-control'], /no-store/);
    assert.equal(res.payload.success, false);
    return { res, calls };
}
(async () => {
    let count = 0;
    for (const [options, code, calls] of [[{ cookie:false },401,0], [{ auth:'student@example.test' },403,1], [{csrf:false},403,0]]) {
        const r = await invoke(options); assert.equal(r.res.statusCode,code); assert.equal(r.calls.length,calls);
        assert.equal(driveReads,0); assert.ok(!JSON.stringify(r.res.payload).includes('Same Name')); count++;
    }
    let r = await invoke();
    assert.equal(r.res.statusCode,409); assert.match(r.res.payload.error,/Same Name \(student #ST-002\)/);
    assert.equal(r.calls.length,5); assert.equal(r.calls.filter(c=>c.options.method === 'POST').length,1); count++;
    r = await invoke({ students:[{id:OWNER,full_name:'Same Name',student_number:'ST-003'}] });
    assert.match(r.res.payload.error,/student #ST-003/); count++;
    r = await invoke({ students:[{id:OWNER,full_name:'Same Name'}] });
    assert.ok(r.res.payload.error.includes('account '+OWNER)); count++;
    for (const options of [{mappings:[]}, {mappings:[{student_id:OWNER},{student_id:OWNER}]}, {mappings:[{student_id:'bad'}]},
        {lookupStatus:403}, {lookupThrow:true}, {lookupJson:true}, {students:[]}, {students:[{id:STUDENT,full_name:'Wrong student'}]}, {profileStatus:403}]) {
        r = await invoke(options); assert.equal(r.res.statusCode,409);
        assert.match(r.res.payload.error,/could not be identified/); assert.ok(!/Same Name|Wrong student|secret/.test(r.res.payload.error)); count++;
    }
    r = await invoke({ replacement: true });
    assert.equal(r.res.statusCode, 409);
    assert.match(r.res.payload.error, /Same Name \(student #ST-002\)/);
    assert.equal(r.calls.filter(c => c.options.method === 'PATCH').length, 1);
    assert.equal(r.calls.filter(c => c.options.method === 'POST' || c.options.method === 'DELETE').length, 0);
    count++;
    for(const status of [403,500]) {
        r = await invoke({status}); assert.equal(r.res.statusCode,status===403?403:502);
        assert.equal(r.calls.length,3,'Non-conflict errors do not read other students'); count++;
    }
    console.log(`Folder conflict checks passed: ${count} authorization, owner identity, same-name, lookup failure, and no-write-retry cases.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
