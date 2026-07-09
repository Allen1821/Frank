(function () {
    'use strict';

    const loginView = document.getElementById('loginView');
    const editorView = document.getElementById('editorView');
    const loginForm = document.getElementById('loginForm');
    const loginButton = document.getElementById('loginButton');
    const loginStatus = document.getElementById('loginStatus');
    const sessionEmail = document.getElementById('sessionEmail');
    const refreshButton = document.getElementById('refreshButton');
    const logoutButton = document.getElementById('logoutButton');
    const pageList = document.getElementById('pageList');
    const sourceLabel = document.getElementById('sourceLabel');
    const pageTitle = document.getElementById('pageTitle');
    const pageDescription = document.getElementById('pageDescription');
    const contentForm = document.getElementById('contentForm');
    const saveButton = document.getElementById('saveButton');
    const dirtyPill = document.getElementById('dirtyPill');
    const editorStatus = document.getElementById('editorStatus');

    let csrfToken = '';
    let siteContent = null;
    let activePageId = '';
    let isDirty = false;

    document.addEventListener('DOMContentLoaded', restoreSession);
    loginForm.addEventListener('submit', handleLogin);
    refreshButton.addEventListener('click', loadContent);
    logoutButton.addEventListener('click', handleLogout);
    saveButton.addEventListener('click', saveContent);

    async function restoreSession() {
        setStatus(loginStatus, '');
        try {
            const response = await fetch('/api/admin-session', { method: 'GET', credentials: 'same-origin' });
            const result = await response.json();
            if (!response.ok || !result.success) {
                showLogin();
                return;
            }

            csrfToken = result.csrfToken || '';
            sessionEmail.textContent = result.user?.email || '';
            showEditor();
            await loadContent();
        } catch {
            showLogin();
        }
    }

    async function handleLogin(event) {
        event.preventDefault();
        setStatus(loginStatus, '');

        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!email || !password) {
            setStatus(loginStatus, 'Enter an email and password.', 'error');
            return;
        }

        loginButton.disabled = true;
        loginButton.textContent = 'Logging in';

        try {
            const response = await fetch('/api/admin-auth', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                setStatus(loginStatus, result.error || 'Unable to log in.', 'error');
                return;
            }

            csrfToken = result.csrfToken || '';
            sessionEmail.textContent = result.user?.email || email;
            loginForm.reset();
            showEditor();
            await loadContent();
        } catch {
            setStatus(loginStatus, 'Network error. Please try again.', 'error');
        } finally {
            loginButton.disabled = false;
            loginButton.textContent = 'Log in';
        }
    }

    async function handleLogout() {
        await fetch('/api/admin-auth', {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
        }).catch(function () {});

        csrfToken = '';
        siteContent = null;
        activePageId = '';
        setDirty(false);
        contentForm.replaceChildren();
        showLogin();
    }

    async function loadContent() {
        setStatus(editorStatus, 'Loading content...');
        refreshButton.disabled = true;

        try {
            const response = await fetch('/api/admin-content', { method: 'GET', credentials: 'same-origin' });
            const result = await response.json();

            if (!response.ok || !result.success) {
                setStatus(editorStatus, result.error || 'Unable to load content.', 'error');
                if (response.status === 401) showLogin();
                return;
            }

            siteContent = result.content;
            sourceLabel.textContent = result.source?.type || '';
            activePageId = activePageId || siteContent.pages[0]?.id || '';
            renderPageList();
            renderActivePage();
            setDirty(false);
            setStatus(editorStatus, result.source?.warning ? result.source.warning : '');
        } catch {
            setStatus(editorStatus, 'Unable to load content.', 'error');
        } finally {
            refreshButton.disabled = false;
        }
    }

    function renderPageList() {
        pageList.replaceChildren();
        if (!siteContent || !Array.isArray(siteContent.pages)) return;

        siteContent.pages.forEach(function (page) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'page-tab';
            if (page.id === activePageId) button.classList.add('active');

            const label = document.createElement('strong');
            label.textContent = page.label;

            const desc = document.createElement('span');
            desc.textContent = page.description || '';

            button.append(label, desc);
            button.addEventListener('click', function () {
                if (isDirty && !window.confirm('Discard unsaved changes and switch pages?')) return;
                activePageId = page.id;
                renderPageList();
                renderActivePage();
                setDirty(false);
            });

            pageList.appendChild(button);
        });
    }

    function renderActivePage() {
        contentForm.replaceChildren();
        const page = getActivePage();
        if (!page) return;

        pageTitle.textContent = page.label;
        pageDescription.textContent = page.description || '';

        page.fields.forEach(function (field) {
            const row = document.createElement('div');
            row.className = 'field-row';

            const label = document.createElement('label');
            label.textContent = field.label;

            const input = field.type === 'textarea'
                ? document.createElement('textarea')
                : document.createElement('input');

            if (field.type !== 'textarea') input.type = 'text';
            input.value = field.value || '';
            input.maxLength = field.maxLength;
            input.dataset.fieldId = field.id;

            const selectorNote = document.createElement('small');
            selectorNote.textContent = field.selector;

            const count = document.createElement('small');
            count.className = 'char-count';

            function updateCount() {
                count.textContent = input.value.length + ' / ' + field.maxLength;
            }

            input.addEventListener('input', function () {
                field.value = input.value;
                updateCount();
                validateInput(input);
                setDirty(true);
            });

            label.appendChild(input);
            row.append(label, selectorNote, count);
            contentForm.appendChild(row);
            updateCount();
            validateInput(input);
        });
    }

    function validateInput(input) {
        const hasMarkup = /[<>]|&(?:lt|gt|#60|#62|#x3c|#x3e);/i.test(input.value);
        const hasControl = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(input.value);
        input.setCustomValidity(hasMarkup || hasControl ? 'Use plain text only.' : '');
    }

    async function saveContent() {
        if (!siteContent) return;

        Array.from(contentForm.querySelectorAll('input, textarea')).forEach(validateInput);
        if (!contentForm.reportValidity()) {
            setStatus(editorStatus, 'Fix invalid fields before saving.', 'error');
            return;
        }

        saveButton.disabled = true;
        setStatus(editorStatus, 'Saving to GitHub...');

        try {
            const response = await fetch('/api/admin-content', {
                method: 'PUT',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({ content: siteContent }),
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                const msg = result.errors ? result.errors.join(' ') : result.error || 'Unable to save content.';
                setStatus(editorStatus, msg, 'error');
                return;
            }

            siteContent = result.content;
            setDirty(false);
            const saved = result.commit?.sha ? ' Saved commit ' + result.commit.sha.slice(0, 7) + '.' : ' Saved.';
            const deploy = result.deployTriggered ? ' Deploy triggered.' : ' GitHub update complete.';
            setStatus(editorStatus, saved + deploy, 'success');
        } catch {
            setStatus(editorStatus, 'Unable to save content.', 'error');
        } finally {
            saveButton.disabled = !isDirty;
        }
    }

    function getActivePage() {
        return siteContent?.pages?.find(function (page) { return page.id === activePageId; });
    }

    function setDirty(value) {
        isDirty = Boolean(value);
        dirtyPill.hidden = !isDirty;
        saveButton.disabled = !isDirty;
    }

    function showLogin() {
        loginView.hidden = false;
        editorView.hidden = true;
    }

    function showEditor() {
        loginView.hidden = true;
        editorView.hidden = false;
    }

    function setStatus(element, message, type) {
        element.textContent = message || '';
        element.className = 'status-msg';
        if (type) element.classList.add(type);
    }
})();
