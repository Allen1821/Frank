// Offline browser regression checks. Execute the real admin script and its event
// handlers with a small DOM shim; no production accounts or Drive files are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../admin/admin.js'), 'utf8');
const html = fs.readFileSync(require.resolve('../admin/index.html'), 'utf8');
assert.match(html, /<button[^>]+id="studentFolderUnlinkButton"[^>]+type="button"[^>]+hidden>Unlink folder<\/button>/);
assert.match(html, /class="connected-documents"[\s\S]*id="studentFolderUnlinkConfirmation"[^>]+role="group"[^>]+aria-labelledby="studentFolderUnlinkTitle"[^>]+aria-describedby="studentFolderUnlinkMessage studentFolderUnlinkHelp"[^>]+tabindex="-1"[^>]+hidden>/);
assert.match(html, /id="studentFolderUnlinkConfirmButton"[^>]+type="button"[^>]+disabled>Confirm unlink/);
assert.match(html, /id="studentFolderUnlinkCancelButton"[^>]+type="button"[^>]+disabled>Cancel/);
assert.match(html, /This only removes the folder link[\s\S]*Google Drive files, folders, sharing permissions, and student accounts will not change/);

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
    dispatch(type, event = {}) { return this.events[type]?.({ preventDefault() {}, ...event }); }
    setAttribute(name, value) { this.attributes[name] = value; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren(...children) { this.children = children; }
    querySelector() { return null; }
    reset() {}
    reportValidity() { return this.valid; }
    scrollIntoView() { this.scrolled = true; }
}

function response(status = 200, result = { success: true, folder: null }) {
    return { ok: status >= 200 && status < 300, status, json: async () => result };
}

function harness() {
    const elements = new Map();
    function element(id) {
        if (!elements.has(id)) {
            const node = new Element();
            node.focus = () => { context.document.activeElement = node; };
            elements.set(id, node);
        }
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
        // Simulate iPhone/browser suppression. The unlink UI must work without
        // ever calling the native confirmation, even when it always returns false.
        confirm: () => false,
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
            changeToken() { csrfToken = 'new-session-token'; },
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
        openUnlink: () => element('studentFolderUnlinkButton').dispatch('click'),
        confirmUnlink: () => element('studentFolderUnlinkConfirmButton').dispatch('click'),
        cancelUnlink: () => element('studentFolderUnlinkCancelButton').dispatch('click'),
        unlink: () => {
            element('studentFolderUnlinkButton').dispatch('click');
            return element('studentFolderUnlinkConfirmButton').dispatch('click');
        },
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
        assert.equal(h.element('studentFolderUnlinkConfirmation').hidden, true);
        await h.confirmUnlink();
        assert.equal(h.requests.length, 0, 'confirm without opening must not send any request');
        h.element('studentFolderStatus').textContent = 'Existing message';
        h.openUnlink();
        assert.equal(h.requests.length, 0, 'opening confirmation must not send any request');
        assert.equal(h.element('studentFolderUnlinkConfirmation').hidden, false);
        assert.equal(h.element('studentFolderUnlinkButton').attributes['aria-expanded'], 'true');
        assert.equal(h.context.document.activeElement, h.element('studentFolderUnlinkConfirmation'));
        assert.equal(h.element('studentFolderUnlinkConfirmation').scrolled, true);
        assert.equal(h.element('studentFolderUnlinkConfirmButton').disabled, false);
        assert.equal(h.element('studentFolderUnlinkCancelButton').disabled, false);
        assert.match(h.element('studentFolderUnlinkMessage').textContent, /Folder 1.*Student 1/);
        h.assertLocked();
        h.openUnlink();
        await h.connect();
        assert.equal(h.requests.length, 0, 'repeated opening and connect must be blocked during confirmation');
        h.cancelUnlink();
        assert.equal(h.requests.length, 0, 'cancel must not send any request');
        assert.equal(h.element('studentFolderUnlinkConfirmation').hidden, true);
        assert.equal(h.element('studentFolderUnlinkConfirmButton').disabled, true);
        assert.equal(h.element('studentFolderUnlinkCancelButton').disabled, true);
        assert.equal(h.element('studentFolderUnlinkButton').attributes['aria-expanded'], 'false');
        assert.equal(h.context.document.activeElement, h.element('studentFolderUnlinkButton'));
        assert.equal(h.element('studentFolderStatus').textContent, 'Existing message');
        assert.equal(h.confirmations.length, 0, 'unlink must not invoke a native dialog');
        h.assertUnlocked();
        await h.confirmUnlink();
        assert.equal(h.requests.length, 0, 'a late confirm after cancel must not send any request');
        h.openUnlink();
        assert.equal(h.element('studentFolderUnlinkConfirmation').hidden, false, 'cancel permits a fresh confirmation');
        h.element('studentFolderUnlinkConfirmation').dispatch('keydown', { key: 'Escape' });
        assert.equal(h.element('studentFolderUnlinkConfirmation').hidden, true);
        assert.equal(h.context.document.activeElement, h.element('studentFolderUnlinkButton'));
        assert.equal(h.requests.length, 0, 'Escape must cancel without a request');
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
        assert.equal(h.element('studentFolderUnlinkConfirmation').hidden, true);
        assert.equal(h.element('studentFolderUnlinkConfirmButton').disabled, true);
        assert.equal(h.context.document.activeElement, h.element('studentFolderSummary'));
        await h.confirmUnlink();
        await h.unlink();
        await h.connect();
        assert.equal(h.requests.length, 1, 'repeat unlink and connect must be blocked while unlinking');
        assert.equal(h.confirmations.length, 0, 'confirmed unlink succeeds even if native dialogs are suppressed');
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
    for (const navigation of ['none', 'student', 'return-to-student', 'session']) {
        const h = harness();
        const pending = h.connect();
        const originalFolder = h.students[0].driveFolder;
        if (navigation === 'student' || navigation === 'return-to-student') {
            h.context.testAdmin.select(1);
            if (navigation === 'return-to-student') h.context.testAdmin.select(0);
        } else if (navigation === 'session') {
            h.context.testAdmin.showLogin();
            h.context.testAdmin.showEditor();
        }
        const warning = 'That Drive folder is already connected to <img onerror=alert(1)> (student #ST-002).';
        h.requests[0].resolve(response(409, { success: false, error: warning }));
        await pending;
        assert.equal(h.students[0].driveFolder, originalFolder);
        assert.equal(h.element('studentFolderStatus').textContent, navigation === 'none' ? warning : '',
            'Show owner details as text only and only in the original active view/session');
        assert.equal(h.element('studentFolderStatus').children.length, 0);
        assert.equal(h.requests.length, 1, 'A duplicate must not cause automatic unlink or retry');
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
        h.openUnlink();
        assert.equal(h.requests.length, 1, 'retry still requires explicit confirmation');
        assert.equal(h.element('studentFolderUnlinkConfirmation').hidden, false);
        h.cancelUnlink();
        assert.equal(h.students[0].driveFolder, folder, 'cancelled retry preserves the mapping');
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
    // Any view/session/mapping change invalidates the open confirmation. Even
    // synthetic late button events must not submit an old or replacement mapping.
    for (const change of ['student', 'return-to-student', 'workspace', 'refresh', 'logout',
        'session', 'pagehide', 'folder', 'folder-object', 'record-object', 'folder-id', 'folder-version', 'student-id', 'token']) {
        const h = harness();
        h.openUnlink();
        let logoutPending;
        if (change === 'student' || change === 'return-to-student') {
            h.context.testAdmin.select(1);
            if (change === 'return-to-student') h.context.testAdmin.select(0);
        } else if (change === 'workspace') {
            h.element('editWebsiteTab').dispatch('click');
        } else if (change === 'refresh') {
            h.element('refreshButton').dispatch('click');
        } else if (change === 'logout') {
            logoutPending = h.element('logoutButton').dispatch('click');
        } else if (change === 'session') {
            h.context.testAdmin.showLogin();
            h.context.testAdmin.showEditor();
        } else if (change === 'pagehide') {
            h.windowEvents.pagehide();
        } else if (change === 'folder') {
            h.context.testAdmin.setFolder({ ...h.students[0].driveFolder, updatedAt: 'new-version' });
        } else if (change === 'folder-object') {
            h.students[0].driveFolder = { ...h.students[0].driveFolder };
        } else if (change === 'record-object') {
            h.context.testAdmin.records[0] = { ...h.students[0] };
        } else if (change === 'folder-id') {
            h.students[0].driveFolder.id = 'replacement-folder-id';
        } else if (change === 'folder-version') {
            h.students[0].driveFolder.updatedAt = 'new-version';
        } else if (change === 'student-id') {
            h.students[0].id = 'replacement-student-id';
        } else {
            h.context.testAdmin.changeToken();
        }
        if (!['folder-object', 'record-object', 'folder-id', 'folder-version', 'student-id', 'token'].includes(change)) {
            assert.equal(h.element('studentFolderUnlinkConfirmation').hidden, true,
                change + ': view change immediately dismisses confirmation');
        }
        await h.confirmUnlink();
        assert.equal(h.requests.filter(request => request.url === '/api/admin-student-folder').length, 0,
            change + ': a stale confirmation must not submit');
        assert.equal(h.element('studentFolderUnlinkConfirmation').hidden, true);
        if (logoutPending) {
            h.requests.find(request => request.url === '/api/admin-auth').resolve(response());
            await logoutPending;
        }
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
    console.log('Folder unlink UI checks passed: inline confirmation, focus/cancel/Escape, exact version, mutual exclusion, errors/retries, 14 stale-confirmation cases, and 42 stale-response cases.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
