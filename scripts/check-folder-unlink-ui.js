// Offline browser regression checks. Execute the real admin script and its event
// handlers with a small DOM shim; no production accounts or Drive files are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../admin/admin.js'), 'utf8');
const html = fs.readFileSync(require.resolve('../admin/index.html'), 'utf8');
assert.match(html, /<button[^>]+id="studentFolderUnlinkButton"[^>]+type="button"[^>]+hidden>Unlink folder<\/button>/);

class Element {
    constructor() {
        this.hidden = false;
        this.disabled = false;
        this.textContent = '';
        this.value = '';
        this.children = [];
        this.events = {};
        this.attributes = {};
        this.dataset = {};
        this.valid = true;
        const classes = new Set();
        this.classList = {
            add: value => classes.add(value),
            remove: value => classes.delete(value),
            toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value),
        };
    }
    addEventListener(type, callback) { this.events[type] = callback; }
    dispatch(type) { return this.events[type]?.({ preventDefault() {} }); }
    setAttribute(name, value) { this.attributes[name] = value; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren(...children) { this.children = children; }
    querySelector() { return null; }
    reset() {}
    reportValidity() { return this.valid; }
    scrollIntoView() {}
}

function response(status = 200, result = { success: true, folder: null }) {
    return { ok: status >= 200 && status < 300, status, json: async () => result };
}

function harness() {
    const elements = new Map();
    function element(id) {
        if (!elements.has(id)) elements.set(id, new Element());
        return elements.get(id);
    }
    const students = [1, 2].map(index => ({
        id: '00000000-0000-4000-8000-' + String(index).padStart(12, '0'),
        fullName: 'Student ' + index,
        email: 'student' + index + '@example.test',
        portalActive: true,
        renewalStatus: 'active',
        renewalDate: '2026-01-01',
        enrollments: [],
        driveFolder: {
            id: '00000000-0000-4000-8000-' + String(index + 10).padStart(12, '0'),
            title: 'Folder ' + index,
            updatedAt: '2026-10-07T17:00:00.123456+00:00',
        },
    }));
    const requests = [];
    const confirmations = [];
    const windowEvents = {};
    const context = {
        console,
        seedStudents: students,
        document: {
            getElementById: element,
            querySelector: element,
            createElement: () => new Element(),
            addEventListener() {},
        },
        window: {
            confirm(message) { confirmations.push(message); return context.confirm(); },
            addEventListener(type, callback) { windowEvents[type] = callback; },
        },
        confirm: () => true,
        FormData: class {
            get(name) {
                if (name === 'title') return element('studentFolderTitle').value;
                if (name === 'driveFolder') return element('studentDriveFolder').value;
                return '';
            }
        },
        Option: class extends Element {
            constructor(text, value) { super(); this.textContent = text; this.value = value; }
        },
        fetch(url, options) {
            return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
        },
    };
    element('loginView').hidden = true;
    element('studentFolderForm').reset = function () {
        element('studentDriveFolder').value = '';
        element('studentFolderTitle').value = 'Student Records';
    };
    // Expose only inspection/seeding helpers inside the VM. Production code has
    // no exported test hooks, and all mutations below use its real event wiring.
    const instrumented = source.replace(/\}\)\(\);\s*$/, `
        globalThis.testAdmin = {
            select(index) {
                studentsTableBody.children[index].children[4].children[0].dispatch('click');
            },
            setFolder(folder) {
                getSelectedStudent().driveFolder = folder;
                renderStudentInspector(getSelectedStudent());
            },
            showLogin,
            showEditor,
            get records() { return studentRecords; },
        };
        studentRecords = globalThis.seedStudents;
        selectedStudentId = studentRecords[0].id;
        activeWorkspace = 'students';
        csrfToken = 'synthetic-csrf-token';
        renderStudentRows(studentRecords);
        renderStudentInspector(studentRecords[0]);
    })();`);
    assert.notEqual(instrumented, source);
    vm.runInNewContext(instrumented, context);
    return {
        students, requests, confirmations, element, context, windowEvents,
        unlink: () => element('studentFolderUnlinkButton').dispatch('click'),
        connect: () => {
            element('studentFolderTitle').value = 'Replacement records';
            element('studentDriveFolder').value = 'synthetic-drive-folder';
            return element('studentFolderForm').dispatch('submit');
        },
        assertUnlocked() {
            assert.equal(element('studentFolderButton').disabled, false);
            assert.equal(element('studentFolderUnlinkButton').disabled, false);
        },
        assertLocked() {
            assert.equal(element('studentFolderButton').disabled, true);
            assert.equal(element('studentFolderUnlinkButton').disabled, true);
        },
    };
}

async function run() {
    {
        const h = harness();
        assert.equal(h.element('studentFolderUnlinkButton').hidden, false);
        h.context.confirm = () => false;
        h.element('studentFolderStatus').textContent = 'Existing message';
        await h.unlink();
        assert.equal(h.requests.length, 0, 'cancel must not send any request');
        assert.equal(h.element('studentFolderStatus').textContent, 'Existing message');
        assert.match(h.confirmations[0], /Folder 1.*Student 1/);
        assert.match(h.confirmations[0], /only removes the folder link/);
        assert.match(h.confirmations[0], /Google Drive files, folders, sharing permissions, and student accounts will not change/);
        h.assertUnlocked();
        h.context.testAdmin.setFolder(null);
        assert.equal(h.element('studentFolderUnlinkButton').hidden, true);
        await h.unlink();
        assert.equal(h.requests.length, 0, 'an unconnected student cannot be unlinked');
    }
    {
        const h = harness();
        const original = JSON.parse(JSON.stringify(h.students[0]));
        h.element('studentRenewalDate').value = '2026-12-31';
        const pending = h.unlink();
        assert.equal(h.requests.length, 1);
        const request = h.requests[0];
        assert.equal(request.url, '/api/admin-student-folder');
        assert.equal(request.options.method, 'DELETE');
        assert.equal(request.options.credentials, 'same-origin');
        assert.equal(request.options.cache, 'no-store');
        assert.equal(request.options.headers['Content-Type'], 'application/json');
        assert.equal(request.options.headers['X-CSRF-Token'], 'synthetic-csrf-token');
        assert.deepEqual(JSON.parse(request.options.body), {
            studentId: original.id, folderId: original.driveFolder.id,
            updatedAt: original.driveFolder.updatedAt,
        });
        h.assertLocked();
        await h.unlink();
        await h.connect();
        assert.equal(h.requests.length, 1, 'repeat unlink and connect must be blocked while unlinking');
        assert.equal(h.confirmations.length, 1);
        request.resolve(response());
        await pending;
        assert.deepEqual(h.students[0], { ...original, driveFolder: null }, 'only the mapping is removed');
        assert.match(h.element('studentFolderSummary').textContent, /No Drive folder connected/);
        assert.match(h.element('studentFolderStatus').textContent, /Folder unlinked/);
        assert.equal(h.element('studentFolderUnlinkButton').hidden, true);
        assert.equal(h.element('studentRenewalDate').value, '2026-12-31', 'do not reset unrelated unsaved inspector fields');
        h.assertUnlocked();
    }
    {
        const h = harness();
        const pending = h.connect();
        h.assertLocked();
        await h.unlink();
        await h.connect();
        assert.equal(h.requests.length, 1, 'unlink and repeat connect must be blocked while connecting');
        assert.equal(h.confirmations.length, 0);
        assert.equal(h.requests[0].options.method, 'POST');
        assert.deepEqual(JSON.parse(h.requests[0].options.body), {
            studentId: h.students[0].id, title: 'Replacement records', driveFolder: 'synthetic-drive-folder',
        });
        const folder = { ...h.students[0].driveFolder, title: 'New folder', itemCount: 3 };
        h.requests[0].resolve(response(201, { success: true, folder }));
        await pending;
        assert.equal(h.students[0].driveFolder, folder);
        assert.equal(h.element('studentFolderUnlinkButton').hidden, false);
        assert.match(h.element('studentFolderStatus').textContent, /3 items found/);
        assert.equal(h.element('studentDriveFolder').value, '');
        h.assertUnlocked();
    }
    for (const code of [400, 403, 409, 502]) {
        const h = harness();
        const folder = h.students[0].driveFolder;
        const pending = h.unlink();
        h.requests[0].resolve(response(code, { success: false, error: 'Synthetic error ' + code }));
        await pending;
        assert.equal(h.students[0].driveFolder, folder, 'a failed unlink must preserve the mapping');
        assert.equal(h.element('studentFolderUnlinkButton').hidden, false);
        assert.equal(h.element('studentFolderStatus').textContent, 'Synthetic error ' + code);
        h.assertUnlocked();
    }
    for (const invalid of ['network', 'json']) {
        const h = harness();
        const folder = h.students[0].driveFolder;
        const pending = h.unlink();
        if (invalid === 'network') h.requests[0].reject(new Error('Synthetic network failure'));
        else h.requests[0].resolve({ json: async () => { throw new Error('Invalid JSON'); } });
        await pending;
        assert.equal(h.students[0].driveFolder, folder);
        assert.match(h.element('studentFolderStatus').textContent, /Unable to confirm.*Refresh/);
        h.assertUnlocked();
    }
    {
        const h = harness();
        const pending = h.unlink();
        h.requests[0].resolve(response(401, { success: false, error: 'Sign in again' }));
        await pending;
        assert.equal(h.element('loginView').hidden, false);
        assert.equal(h.element('editorView').hidden, true);
    }
    {
        const h = harness();
        delete h.students[0].driveFolder.updatedAt;
        await h.unlink();
        assert.equal(h.requests.length, 0, 'missing optimistic-concurrency metadata must fail closed');
        assert.equal(h.confirmations.length, 0);
        assert.match(h.element('studentFolderStatus').textContent, /Refresh/);
    }
    {
        const h = harness();
        h.context.confirm = () => { h.context.testAdmin.select(1); return true; };
        await h.unlink();
        assert.equal(h.requests.length, 0, 'a changed confirmation context must not submit');
    }
    for (const replacement of ['record', 'folder']) {
        const h = harness();
        const pending = h.unlink();
        const newFolder = { ...h.students[0].driveFolder, title: 'Newer connection', updatedAt: '2026-10-07T18:00:00Z' };
        if (replacement === 'folder') {
            h.context.testAdmin.setFolder(newFolder);
        } else {
            h.element('refreshButton').dispatch('click');
            const records = JSON.parse(JSON.stringify(h.students));
            records[0].driveFolder = newFolder;
            h.requests[1].resolve(response(200, { success: true, students: records }));
            await new Promise(resolve => setImmediate(resolve));
        }
        h.requests[0].resolve(response());
        await pending;
        assert.equal(h.context.testAdmin.records[0].driveFolder, newFolder,
            'a late success must not clear a newer ' + replacement);
        assert.match(h.element('studentFolderSummary').textContent, /Newer connection/);
    }
    // Exercise real navigation/lifecycle handlers with late success, HTTP errors,
    // and transport failures for BOTH mutations, including A -> B -> A.
    for (const mutation of ['unlink', 'connect']) {
        for (const navigation of ['student', 'return-to-student', 'workspace', 'refresh', 'logout', 'session', 'pagehide']) {
            for (const outcome of ['success', 'error', 'network']) {
                const h = harness();
                const original = JSON.stringify(h.students);
                const pending = h[mutation]();
                let logoutPending;
                if (navigation === 'student' || navigation === 'return-to-student') {
                    h.context.testAdmin.select(1);
                    if (navigation === 'return-to-student') h.context.testAdmin.select(0);
                    h.assertLocked();
                } else if (navigation === 'workspace') {
                    h.element('editWebsiteTab').dispatch('click');
                } else if (navigation === 'refresh') {
                    h.element('refreshButton').dispatch('click');
                } else if (navigation === 'logout') {
                    logoutPending = h.element('logoutButton').dispatch('click');
                    h.assertLocked();
                } else if (navigation === 'session') {
                    h.context.testAdmin.showLogin();
                    h.context.testAdmin.showEditor();
                } else {
                    h.windowEvents.pagehide();
                }
                const visible = ['studentInspectorTitle', 'studentFolderSummary', 'studentFolderStatus']
                    .map(id => h.element(id).textContent);
                const loginHidden = h.element('loginView').hidden;
                if (outcome === 'success') {
                    h.requests[0].resolve(response(200, { success: true, folder: { id: 'new', title: 'Stale result' } }));
                } else if (outcome === 'error') {
                    h.requests[0].resolve(response(401, { success: false, error: 'Stale authentication error' }));
                } else {
                    h.requests[0].reject(new Error('Stale transport failure'));
                }
                await pending;
                const label = [mutation, navigation, outcome].join('/');
                const canUpdateCache = outcome === 'success'
                    && ['student', 'return-to-student', 'workspace', 'refresh'].includes(navigation);
                const expected = JSON.parse(original);
                if (canUpdateCache) {
                    expected[0].driveFolder = mutation === 'unlink' ? null : { id: 'new', title: 'Stale result' };
                }
                assert.equal(JSON.stringify(h.students), JSON.stringify(expected), label + ': only update the original same-session cache');
                const expectedVisible = visible.slice();
                if (canUpdateCache && navigation === 'return-to-student') {
                    expectedVisible[1] = mutation === 'unlink' ? 'No Drive folder connected yet.' : 'Stale result — connected';
                }
                assert.deepEqual(['studentInspectorTitle', 'studentFolderSummary', 'studentFolderStatus']
                    .map(id => h.element(id).textContent), expectedVisible, label + ': do not repaint another inspector or show stale messages');
                if (canUpdateCache && navigation === 'student') {
                    h.context.testAdmin.select(0);
                    assert.equal(h.element('studentFolderUnlinkButton').hidden, mutation === 'unlink',
                        label + ': returning to the original student uses the updated cache');
                }
                assert.equal(h.element('loginView').hidden, loginHidden, label + ': ignore stale auth failures');
                if (logoutPending) {
                    h.assertLocked();
                    h.requests.find(request => request.url === '/api/admin-auth').resolve(response());
                    await logoutPending;
                    assert.equal(h.element('editorView').hidden, true);
                    assert.equal(h.element('studentInspector').hidden, true);
                    assert.equal(h.element('studentFolderUnlinkButton').hidden, true);
                } else {
                    h.assertUnlocked();
                }
            }
        }
    }
    console.log('Folder unlink UI checks passed: confirmation, exact version, mutual exclusion, errors, and 42 stale-response cases.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
