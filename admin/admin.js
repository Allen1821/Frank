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
    const DATES_PAGE_ID = 'dates';
    const DATE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,80}$/i;
    const DEFAULT_DATE_GROUPS = [
        {
            id: 'class-6010',
            category: 'ASSE Classes',
            label: 'ASSE 6010 Class Dates',
            description: '3-day Medical Gas Installer course sessions shown on the 6010 registration form.',
            courseCodes: ['6010'],
            dates: [
                { id: '2026-08-03', label: 'August 3, 4, and 5, 2026', note: 'Monday-Wednesday' },
                { id: '2026-10-05', label: 'October 5, 6, and 7, 2026', note: 'Monday-Wednesday' },
                { id: '2027-01-11', label: 'January 11, 12, and 13, 2027', note: 'Monday-Wednesday' },
            ],
        },
        {
            id: 'class-6020',
            category: 'ASSE Classes',
            label: 'ASSE 6020 Class Dates',
            description: '3-day Medical Gas Inspector course sessions shown on the 6020 registration form.',
            courseCodes: ['6020'],
            dates: [
                { id: '2026-08-03', label: 'August 3, 4, and 5, 2026', note: 'Monday-Wednesday' },
                { id: '2026-10-05', label: 'October 5, 6, and 7, 2026', note: 'Monday-Wednesday' },
                { id: '2027-01-11', label: 'January 11, 12, and 13, 2027', note: 'Monday-Wednesday' },
            ],
        },
        {
            id: 'class-6040',
            category: 'ASSE Classes',
            label: 'ASSE 6040 Class Dates',
            description: '3-day Medical Gas Maintenance Technician course sessions shown on the 6040 registration form.',
            courseCodes: ['6040'],
            dates: [
                { id: '2026-08-03', label: 'August 3, 4, and 5, 2026', note: 'Monday-Wednesday' },
                { id: '2026-10-05', label: 'October 5, 6, and 7, 2026', note: 'Monday-Wednesday' },
                { id: '2027-01-11', label: 'January 11, 12, and 13, 2027', note: 'Monday-Wednesday' },
            ],
        },
        {
            id: 'recertification',
            category: 'Recertification',
            label: 'ASSE Recertification Dates',
            description: '4-hour recertification class plus test sessions shown on the Students registration form.',
            courseCodes: ['recertification-6010', 'recertification-6020', 'recertification-6040'],
            dates: [
                { id: 'recertification-tbd', label: 'Dates to be announced', note: '4-hour recertification class plus test' },
            ],
        },
    ];

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
            ensureDateGroups();
            sourceLabel.textContent = result.source?.type || '';
            activePageId = activePageId || getEditorPages()[0]?.id || '';
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

        getEditorPages().forEach(function (page) {
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
        if (activePageId === DATES_PAGE_ID) {
            renderDatesPage();
            return;
        }

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

    function renderDatesPage() {
        const groups = getDateGroups();

        pageTitle.textContent = 'Dates';
        pageDescription.textContent = 'Add, remove, and edit the date boxes shown on ASSE class and recertification registration forms.';

        if (!groups.length) {
            const empty = document.createElement('div');
            empty.className = 'field-row';
            empty.textContent = 'No editable date groups are configured yet.';
            contentForm.appendChild(empty);
            return;
        }

        let currentCategory = '';
        groups.forEach(function (group) {
            if (group.category !== currentCategory) {
                currentCategory = group.category || 'Dates';
                const heading = document.createElement('h3');
                heading.className = 'date-category-heading';
                heading.textContent = currentCategory;
                contentForm.appendChild(heading);
            }

            contentForm.appendChild(renderDateGroup(group));
        });
    }

    function renderDateGroup(group) {
        const section = document.createElement('section');
        section.className = 'date-group-card';

        const head = document.createElement('div');
        head.className = 'date-group-head';

        const text = document.createElement('div');
        const title = document.createElement('h3');
        title.textContent = group.label || group.id;
        const desc = document.createElement('p');
        desc.textContent = group.description || '';
        const courseCodes = document.createElement('small');
        courseCodes.textContent = 'Connected forms: ' + (Array.isArray(group.courseCodes) ? group.courseCodes.join(', ') : group.id);
        text.append(title, desc, courseCodes);

        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'primary-btn';
        addButton.textContent = 'Add date box';
        addButton.addEventListener('click', function () {
            if (!Array.isArray(group.dates)) group.dates = [];
            group.dates.push({
                id: nextDateId(group),
                label: 'New date',
                note: 'Schedule details',
            });
            setDirty(true);
            renderActivePage();
        });

        head.append(text, addButton);

        const list = document.createElement('div');
        list.className = 'date-entry-list';

        if (!Array.isArray(group.dates) || group.dates.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'date-entry-empty';
            empty.textContent = 'No dates yet. Add a date box to show this option on the site.';
            list.appendChild(empty);
        } else {
            group.dates.forEach(function (date, index) {
                list.appendChild(renderDateEntry(group, date, index));
            });
        }

        section.append(head, list);
        return section;
    }

    function renderDateEntry(group, date, index) {
        const row = document.createElement('div');
        row.className = 'date-entry-row';

        const codeField = createDateInput({
            label: 'Date code',
            value: date.id || '',
            maxLength: 80,
            required: true,
            fieldName: 'id',
            help: 'Used in form submissions. Example: 2026-08-03',
            onInput: function (value) { date.id = value.trim(); },
        });

        const labelField = createDateInput({
            label: 'Display date',
            value: date.label || '',
            maxLength: 120,
            required: true,
            fieldName: 'label',
            help: 'This is the large text students see in the date box.',
            onInput: function (value) { date.label = value; },
        });

        const noteField = createDateInput({
            label: 'Small note',
            value: date.note || '',
            maxLength: 120,
            required: false,
            fieldName: 'note',
            help: 'Optional line under the date, such as Monday-Wednesday.',
            onInput: function (value) { date.note = value; },
        });

        const removeWrap = document.createElement('div');
        removeWrap.className = 'date-remove-wrap';
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'ghost-btn date-remove-btn';
        removeButton.textContent = 'Remove';
        removeButton.setAttribute('aria-label', 'Remove date box ' + (index + 1) + ' from ' + (group.label || group.id));
        removeButton.addEventListener('click', function () {
            group.dates.splice(index, 1);
            setDirty(true);
            renderActivePage();
        });
        removeWrap.appendChild(removeButton);

        row.append(codeField, labelField, noteField, removeWrap);
        return row;
    }

    function createDateInput(options) {
        const label = document.createElement('label');
        label.textContent = options.label;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = options.value || '';
        input.maxLength = options.maxLength;
        input.required = Boolean(options.required);
        input.dataset.dateField = options.fieldName;

        const help = document.createElement('small');
        help.textContent = options.help || '';

        const count = document.createElement('small');
        count.className = 'char-count';

        function updateCount() {
            count.textContent = input.value.length + ' / ' + options.maxLength;
        }

        input.addEventListener('input', function () {
            options.onInput(input.value);
            updateCount();
            validateInput(input);
            setDirty(true);
        });

        label.append(input, help, count);
        updateCount();
        validateInput(input);
        return label;
    }

    function validateInput(input) {
        const hasMarkup = /[<>]|&(?:lt|gt|#60|#62|#x3c|#x3e);/i.test(input.value);
        const hasControl = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(input.value);
        const invalidDateId = input.dataset.dateField === 'id' && !DATE_ID_PATTERN.test(input.value.trim());

        if (hasMarkup || hasControl) {
            input.setCustomValidity('Use plain text only.');
        } else if (invalidDateId) {
            input.setCustomValidity('Use letters, numbers, dots, underscores, or hyphens. Example: 2026-08-03');
        } else {
            input.setCustomValidity('');
        }
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

    function getEditorPages() {
        const pages = Array.isArray(siteContent?.pages) ? siteContent.pages.slice() : [];
        pages.push({
            id: DATES_PAGE_ID,
            label: 'Dates',
            description: 'Class and recertification date boxes.',
        });
        return pages;
    }

    function getDateGroups() {
        return Array.isArray(siteContent?.dateGroups) ? siteContent.dateGroups : [];
    }

    function ensureDateGroups() {
        if (!siteContent || Array.isArray(siteContent.dateGroups)) return;
        siteContent.dateGroups = JSON.parse(JSON.stringify(DEFAULT_DATE_GROUPS));
    }

    function nextDateId(group) {
        const dates = Array.isArray(group.dates) ? group.dates : [];
        let index = dates.length + 1;
        let id = 'new-date-' + index;
        const existing = new Set(dates.map(function (date) { return date.id; }));
        while (existing.has(id)) {
            index += 1;
            id = 'new-date-' + index;
        }
        return id;
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
