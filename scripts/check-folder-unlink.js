const assert = require('assert/strict');
const fs = require('fs');

// Static migration contract checks; actual RLS execution needs an approved DB test.
const migration = fs.readFileSync(require.resolve('../supabase/migrations/20261007172456_student_folder_unlink.sql'), 'utf8');
assert.match(migration, /write_policy_count <> 1/);
assert.match(migration, /write_policy\.roles <> array\['authenticated'\]::name\[\]/);
assert.match(migration, /write_policy\.with_check is distinct from write_policy\.qual/);
assert.match(migration, /and relrowsecurity/);
assert.match(migration, /cmd in \('DELETE', 'ALL'\)/);
assert.match(migration, /'Admins unlink student folders', write_policy\.qual/);
assert.match(migration, /grant delete on table public\.student_drive_folders to authenticated;/);
assert.ok(!/using \(\s*exists/i.test(migration), 'Migration must preserve the existing write predicate rather than replace role/MFA checks');

const adminStudentFolder = require('../server/api/admin-student-folder');
const studentDocument = require('../server/api/student-document');
const { createFolderDocumentToken } = require('../server/api/_google-drive');

// Every request below uses a local fetch mock. No credentials, student records,
// Supabase project, or Google Drive files are read or changed by this suite.
const ORIGIN = 'https://www.darpasolutionsllc.net';
const SUPABASE_ORIGIN = 'https://folder-unlink-tests.invalid';
const ADMIN_TOKEN = 'test-admin-session';
const STUDENT_TOKEN = 'test-student-session';
const PUBLISHABLE_KEY = 'test-publishable-key';
const CSRF_TOKEN = 'c'.repeat(64);
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const FOLDER_ID = '33333333-3333-4333-8333-333333333333';
const REPLACEMENT_ID = '44444444-4444-4444-8444-444444444444';
const STUDENT_USER_ID = '55555555-5555-4555-8555-555555555555';
const UPDATED_AT = '2026-10-07T14:22:31.123456+00:00';
const VALID_BODY = { studentId: STUDENT_ID, folderId: FOLDER_ID, updatedAt: UPDATED_AT };
const AUTH_PATH = '/auth/v1/user';
const FOLDER_PATH = '/rest/v1/student_drive_folders';
const STUDENT_PATH = '/rest/v1/students';

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

function adminRequest(body = VALID_BODY, options = {}) {
    return {
        method: options.method || 'DELETE',
        body,
        headers: {
            host: new URL(ORIGIN).host,
            origin: ORIGIN,
            'content-type': 'application/json',
            cookie: `ds_admin_session=${ADMIN_TOKEN}; ds_admin_csrf=${CSRF_TOKEN}`,
            'x-csrf-token': CSRF_TOKEN,
            ...options.headers,
        },
        socket: { remoteAddress: '127.0.0.1' },
    };
}

function step(path, method, data, options = {}) {
    return { path, method, data, status: 200, ...options };
}

function adminAuth(options = {}) {
    return step(AUTH_PATH, 'GET', { id: ADMIN_ID, email: 'admin@example.com' }, options);
}

function deleteMapping(data = [{ id: FOLDER_ID }], options = {}) {
    return step(FOLDER_PATH, 'DELETE', data, options);
}

function readMapping(data = [], options = {}) {
    return step(FOLDER_PATH, 'GET', data, options);
}

async function invoke(handler, request, steps, expectedStatus, description) {
    const calls = [];
    const unexpected = [];
    let nextStep = 0;
    global.fetch = async function (input, options = {}) {
        const url = new URL(String(input));
        const method = options.method || 'GET';
        calls.push({ url, options, method });
        const expected = steps[nextStep];
        if (
            url.origin !== SUPABASE_ORIGIN
            || !expected
            || url.pathname !== expected.path
            || method !== expected.method
        ) {
            // Record unexpected calls separately: a handler may catch the
            // exception, but that must never make this test appear to pass.
            unexpected.push(`${method} ${url.origin}${url.pathname}`);
            throw new Error('Unexpected mocked request; live network is disabled.');
        }
        nextStep += 1;
        if (expected.error) throw expected.error;
        return {
            ok: expected.status >= 200 && expected.status < 300,
            status: expected.status,
            async json() {
                if (expected.jsonError) throw expected.jsonError;
                return expected.data;
            },
        };
    };

    const response = makeResponse();
    await handler(request, response);
    assert.deepEqual(unexpected, [], `${description}: no unexpected or Google Drive requests`);
    assert.equal(nextStep, steps.length, `${description}: expected upstream requests were made`);
    assert.equal(response.statusCode, expectedStatus, description);
    assert.equal(response.payload?.success, expectedStatus === 200, `${description}: response success flag`);
    assert.match(response.getHeader('Cache-Control'), /no-store/, `${description}: response must not be cached`);
    assert.equal(response.getHeader('X-Content-Type-Options'), 'nosniff');
    return { response, calls };
}

function assertAdminCredentials(call) {
    assert.equal(call.options.headers.apikey, PUBLISHABLE_KEY, 'Use the publishable key and admin session for RLS');
    assert.equal(call.options.headers.Authorization, `Bearer ${ADMIN_TOKEN}`);
    assert.ok(call.options.signal, 'Upstream operations must have a timeout');
}

function assertDeleteFilters(call, body = VALID_BODY) {
    assert.equal(call.method, 'DELETE');
    assert.equal(call.url.pathname, FOLDER_PATH, 'Unlink only the student folder mapping');
    assert.equal(call.url.searchParams.get('student_id'), `eq.${body.studentId}`);
    assert.equal(call.url.searchParams.get('id'), `eq.${body.folderId}`);
    assert.equal(call.url.searchParams.get('updated_at'), `eq.${body.updatedAt}`, 'Preserve timestamp precision and offset');
    assert.deepEqual(
        [...call.url.searchParams.keys()].sort(),
        ['id', 'select', 'student_id', 'updated_at'],
        'All concurrency predicates belong to the single atomic DELETE'
    );
    assert.equal(call.options.headers.Prefer, 'return=representation', 'Confirm the number of deleted mappings');
    assert.equal(call.options.body, undefined, 'Unlink must not overwrite other student or document data');
    assertAdminCredentials(call);
}

function assertReadFilters(call) {
    assert.equal(call.method, 'GET');
    assert.equal(call.url.pathname, FOLDER_PATH);
    assert.equal(call.url.searchParams.get('student_id'), `eq.${STUDENT_ID}`);
    assert.equal(call.url.searchParams.get('id'), null, 'Conflict check must find a replacement with a new mapping ID');
    assert.equal(call.url.searchParams.get('updated_at'), null, 'Conflict check must find a newer mapping revision');
    assert.equal(call.url.searchParams.get('limit'), '1');
    assertAdminCredentials(call);
}

async function run() {
    const originalFetch = global.fetch;
    const originalConsoleError = console.error;
    const environment = {
        APP_ORIGIN: ORIGIN,
        ADMIN_EMAILS: 'admin@example.com',
        ADMIN_COOKIE_SECURE: 'true',
        STUDENT_COOKIE_SECURE: 'true',
        SUPABASE_URL: SUPABASE_ORIGIN,
        SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
        // Fail closed if a regression accidentally invokes a Drive helper.
        GOOGLE_SERVICE_ACCOUNT_EMAIL: '',
        GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: '',
        GOOGLE_SERVICE_ACCOUNT_JSON_PATH: '',
    };
    const originalEnvironment = Object.fromEntries(
        Object.keys(environment).map(key => [key, process.env[key]])
    );
    Object.assign(process.env, environment);
    let passed = 0;
    const failures = [];

    async function check(description, callback) {
        try {
            await callback();
            passed += 1;
        } catch (error) {
            failures.push(`${description}: ${error.message}`);
        }
    }

    async function checkAdmin(description, request, steps, status, verify) {
        await check(description, async function () {
            const result = await invoke(adminStudentFolder, request, steps, status, description);
            if (verify) verify(result);
        });
    }

    try {
        // Expected mocked failures are asserted below; keep their server logs
        // from obscuring the actionable check output.
        console.error = function () {};

        await checkAdmin('GET is rejected with the correct Allow header', adminRequest(VALID_BODY, { method: 'GET' }), [], 405, ({ response }) => {
            assert.deepEqual(response.getHeader('Allow').split(/,\s*/).sort(), ['DELETE', 'POST']);
        });
        await checkAdmin('Missing admin session cannot unlink', adminRequest(VALID_BODY, {
            headers: { cookie: `ds_admin_csrf=${CSRF_TOKEN}` },
        }), [], 401);
        await checkAdmin('Expired admin session cannot unlink', adminRequest(), [adminAuth({ status: 401 })], 401);
        await checkAdmin('Non-admin session cannot unlink', adminRequest(), [
            adminAuth({ data: { id: STUDENT_USER_ID, email: 'student@example.com' } }),
        ], 403);

        const blockedHeaders = [
            ['Cross-origin DELETE', { origin: 'https://attacker.example' }],
            ['Wrong-scheme origin', { origin: 'http://www.darpasolutionsllc.net' }],
            ['Malformed origin', { origin: 'not an origin' }],
            ['Missing CSRF header', { 'x-csrf-token': '' }],
            ['Missing CSRF cookie', { cookie: `ds_admin_session=${ADMIN_TOKEN}` }],
            ['Mismatched CSRF token', { 'x-csrf-token': 'd'.repeat(64) }],
            ['Wrong-length CSRF token', { 'x-csrf-token': 'short' }],
        ];
        for (const [description, headers] of blockedHeaders) {
            await checkAdmin(description, adminRequest(VALID_BODY, { headers }), [], 403);
        }
        await checkAdmin('Non-JSON DELETE is rejected', adminRequest(VALID_BODY, {
            headers: { 'content-type': 'text/plain' },
        }), [], 400);

        const invalidBodies = [
            ['Empty body', {}],
            ['Null body', null],
            ['Array body', [VALID_BODY]],
            ['String body', JSON.stringify(VALID_BODY)],
            ['Missing student ID', { folderId: FOLDER_ID, updatedAt: UPDATED_AT }],
            ['Missing folder ID', { studentId: STUDENT_ID, updatedAt: UPDATED_AT }],
            ['Missing timestamp', { studentId: STUDENT_ID, folderId: FOLDER_ID }],
            ['Unknown field', { ...VALID_BODY, force: true }],
            ['Drive ID is not a mapping ID', { ...VALID_BODY, folderId: 'drive_folder_123456' }],
            ['Malformed student ID', { ...VALID_BODY, studentId: 'invalid' }],
            ['Student ID filter injection', { ...VALID_BODY, studentId: `${STUDENT_ID}&id=neq.x` }],
            ['Folder ID filter injection', { ...VALID_BODY, folderId: `${FOLDER_ID},id.neq.x` }],
            ['Array student ID', { ...VALID_BODY, studentId: [STUDENT_ID] }],
            ['Array folder ID', { ...VALID_BODY, folderId: [FOLDER_ID] }],
            ['Object folder ID', { ...VALID_BODY, folderId: { id: FOLDER_ID } }],
            ['Numeric timestamp', { ...VALID_BODY, updatedAt: 1791381600000 }],
            ['Array timestamp', { ...VALID_BODY, updatedAt: [UPDATED_AT] }],
            ['Empty timestamp', { ...VALID_BODY, updatedAt: '' }],
            ['Invalid timestamp text', { ...VALID_BODY, updatedAt: 'yesterday' }],
            ['Date-only timestamp', { ...VALID_BODY, updatedAt: '2026-10-07' }],
            ['Invalid timestamp month', { ...VALID_BODY, updatedAt: '2026-13-07T14:22:31Z' }],
            ['Missing timestamp timezone', { ...VALID_BODY, updatedAt: '2026-10-07T14:22:31' }],
            ['Timestamp filter injection', { ...VALID_BODY, updatedAt: `${UPDATED_AT}&id=neq.x` }],
            ['Oversized request', { ...VALID_BODY, extra: 'x'.repeat(8192) }],
        ];
        for (const [description, body] of invalidBodies) {
            await checkAdmin(description, adminRequest(body), [adminAuth()], 400);
        }

        for (const timestamp of [UPDATED_AT, '2026-10-07T14:22:31.001Z', '2026-10-07T10:22:31-04:00']) {
            const body = { ...VALID_BODY, updatedAt: timestamp };
            await checkAdmin(`Unlink preserves timestamp ${timestamp}`, adminRequest(body), [adminAuth(), deleteMapping()], 200, ({ response, calls }) => {
                assert.deepEqual(response.payload, { success: true, folder: null });
                assert.equal(calls.length, 2, 'Authenticate then delete; no race-prone preflight read');
                assertAdminCredentials(calls[0]);
                assertDeleteFilters(calls[1], body);
            });
        }

        await checkAdmin('Repeated or already-unlinked request is idempotent', adminRequest(), [
            adminAuth(), deleteMapping([]), readMapping([]),
        ], 200, ({ response, calls }) => {
            assert.deepEqual(response.payload, { success: true, folder: null });
            assertDeleteFilters(calls[1]);
            assertReadFilters(calls[2]);
        });

        for (const currentMapping of [
            { id: FOLDER_ID, updated_at: '2026-10-07T14:23:00.000001+00:00' },
            { id: REPLACEMENT_ID, updated_at: '2026-10-07T14:23:00.000001+00:00' },
        ]) {
            await checkAdmin(`Stale unlink preserves current mapping ${currentMapping.id}`, adminRequest(), [
                adminAuth(), deleteMapping([]), readMapping([currentMapping]),
            ], 409, ({ calls, response }) => {
                assertDeleteFilters(calls[1]);
                assertReadFilters(calls[2]);
                assert.equal(calls.filter(call => call.method === 'DELETE').length, 1, 'Never retry with relaxed predicates');
                assert.match(response.payload.error, /changed|refresh/i);
            });
        }

        for (const status of [401, 403, 409, 500, 503]) {
            await checkAdmin(`DELETE upstream ${status} fails closed`, adminRequest(), [
                adminAuth(), deleteMapping(null, { status }),
            ], status === 403 ? 403 : 502);
        }
        await checkAdmin('DELETE network failure is reported', adminRequest(), [
            adminAuth(), deleteMapping(null, { error: new Error('Mock network failure') }),
        ], 502);
        await checkAdmin('DELETE invalid JSON is reported', adminRequest(), [
            adminAuth(), deleteMapping(null, { jsonError: new SyntaxError('Mock invalid JSON') }),
        ], 502);
        for (const data of [null, { id: FOLDER_ID }, [null], [{}], [{ id: REPLACEMENT_ID }], [{ id: FOLDER_ID }, { id: REPLACEMENT_ID }]]) {
            await checkAdmin(`DELETE malformed representation ${JSON.stringify(data)}`, adminRequest(), [
                adminAuth(), deleteMapping(data),
            ], 502);
        }

        for (const status of [403, 500]) {
            await checkAdmin(`Conflict read upstream ${status} fails closed`, adminRequest(), [
                adminAuth(), deleteMapping([]), readMapping(null, { status }),
            ], status === 403 ? 403 : 502);
        }
        await checkAdmin('Conflict read network failure is reported', adminRequest(), [
            adminAuth(), deleteMapping([]), readMapping(null, { error: new Error('Mock read failure') }),
        ], 502);
        await checkAdmin('Conflict read invalid JSON is reported', adminRequest(), [
            adminAuth(), deleteMapping([]), readMapping(null, { jsonError: new SyntaxError('Mock invalid JSON') }),
        ], 502);
        for (const data of [null, { id: REPLACEMENT_ID }, [null], [{}], [{ id: 'not-a-mapping-id' }], [{ id: FOLDER_ID }, { id: REPLACEMENT_ID }]]) {
            await checkAdmin(`Conflict read malformed representation ${JSON.stringify(data)}`, adminRequest(), [
                adminAuth(), deleteMapping([]), readMapping(data),
            ], 502);
        }

        // Exercise the actual student-document handler, including its real
        // session and active-account checks. This token was valid for a file
        // before unlinking; removing the mapping must revoke view and download.
        const oldDocumentId = 'folder_' + createFolderDocumentToken(
            STUDENT_TOKEN, STUDENT_ID, 'previous_drive_file_123'
        );
        for (const mode of ['view', 'download']) {
            for (const active of [true, false]) {
                const description = `${mode}: old folder token denied when ${active ? 'unlinked' : 'account inactive'}`;
                await check(description, async function () {
                    const request = {
                        method: 'GET',
                        query: { id: oldDocumentId, mode },
                        headers: { host: new URL(ORIGIN).host, cookie: `ds_student_access=${STUDENT_TOKEN}` },
                    };
                    const steps = [
                        step(AUTH_PATH, 'GET', { id: STUDENT_USER_ID, email: 'student@example.com' }),
                        step(STUDENT_PATH, 'GET', active ? [{ id: STUDENT_ID }] : []),
                    ];
                    if (active) steps.push(readMapping([]));
                    const { response, calls } = await invoke(studentDocument, request, steps, 404, description);
                    assert.equal(response.payload.error, 'Document not found.');
                    assert.equal(calls[1].url.searchParams.get('auth_user_id'), `eq.${STUDENT_USER_ID}`);
                    assert.equal(calls[1].url.searchParams.get('portal_active'), 'eq.true', 'Disabled accounts cannot read documents');
                    if (active) {
                        assert.equal(calls[2].url.searchParams.get('student_id'), `eq.${STUDENT_ID}`);
                    }
                    for (const call of calls) {
                        assert.equal(call.method, 'GET', 'Denied student access must not mutate anything');
                        assert.equal(call.options.headers.apikey, PUBLISHABLE_KEY);
                        assert.equal(call.options.headers.Authorization, `Bearer ${STUDENT_TOKEN}`);
                    }
                    assert.equal(calls.length, active ? 3 : 2, 'Access denial must happen before any Drive request');
                });
            }
        }
    } finally {
        global.fetch = originalFetch;
        console.error = originalConsoleError;
        for (const [key, value] of Object.entries(originalEnvironment)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }

    if (failures.length) {
        throw new Error(`Folder unlink checks: ${passed} passed, ${failures.length} failed.\n${failures.join('\n')}`);
    }
    console.log(`Folder unlink checks passed (${passed} checks; mocked API only).`);
}

run().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
