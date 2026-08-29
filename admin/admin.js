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
    const editWebsiteTab = document.getElementById('editWebsiteTab');
    const studentsTab = document.getElementById('studentsTab');
    const pendingStudentTabCount = document.getElementById('pendingStudentTabCount');
    const editorLayout = document.getElementById('editorLayout');
    const adminWorkspacePanel = document.getElementById('adminWorkspacePanel');
    const pageList = document.getElementById('pageList');
    const sourceLabel = document.getElementById('sourceLabel');
    const pageTitle = document.getElementById('pageTitle');
    const pageDescription = document.getElementById('pageDescription');
    const contentForm = document.getElementById('contentForm');
    const saveButton = document.getElementById('saveButton');
    const saveActions = document.querySelector('.save-actions');
    const dirtyPill = document.getElementById('dirtyPill');
    const editorStatus = document.getElementById('editorStatus');
    const studentsPanel = document.getElementById('studentsPanel');
    const studentCount = document.getElementById('studentCount');
    const activeStudentCount = document.getElementById('activeStudentCount');
    const pendingStudentCount = document.getElementById('pendingStudentCount');
    const deactivatedStudentCount = document.getElementById('deactivatedStudentCount');
    const classCountList = document.getElementById('classCountList');
    const studentNotificationForm = document.getElementById('studentNotificationForm');
    const studentNotificationCount = document.getElementById('studentNotificationCount');
    const studentNotificationCertificateField = document.getElementById('studentNotificationCertificateField');
    const studentNotificationCertificate = document.getElementById('studentNotificationCertificate');
    const studentNotificationRecipientField = document.getElementById('studentNotificationRecipientField');
    const studentNotificationStudent = document.getElementById('studentNotificationStudent');
    const studentNotificationSubject = document.getElementById('studentNotificationSubject');
    const studentNotificationMessage = document.getElementById('studentNotificationMessage');
    const studentNotificationMessageCount = document.getElementById('studentNotificationMessageCount');
    const studentNotificationPreview = document.getElementById('studentNotificationPreview');
    const studentNotificationButton = document.getElementById('studentNotificationButton');
    const studentNotificationStatus = document.getElementById('studentNotificationStatus');
    const studentsTableBody = document.getElementById('studentsTableBody');
    const studentsStatus = document.getElementById('studentsStatus');
    const studentInspector = document.getElementById('studentInspector');
    const studentInspectorTitle = document.getElementById('studentInspectorTitle');
    const studentInspectorEmail = document.getElementById('studentInspectorEmail');
    const studentInspectorAccess = document.getElementById('studentInspectorAccess');
    const studentAccessDescription = document.getElementById('studentAccessDescription');
    const studentAccessButton = document.getElementById('studentAccessButton');
    const studentAccessStatus = document.getElementById('studentAccessStatus');
    const studentRenewalForm = document.getElementById('studentRenewalForm');
    const studentRenewalStatus = document.getElementById('studentRenewalStatus');
    const studentRenewalDate = document.getElementById('studentRenewalDate');
    const studentRenewalDueDate = document.getElementById('studentRenewalDueDate');
    const studentRenewalButton = document.getElementById('studentRenewalButton');
    const studentRenewalStatusMessage = document.getElementById('studentRenewalStatusMessage');
    const driveServiceAccountEmail = document.getElementById('driveServiceAccountEmail');
    const studentFolderForm = document.getElementById('studentFolderForm');
    const studentFolderButton = document.getElementById('studentFolderButton');
    const studentFolderStatus = document.getElementById('studentFolderStatus');
    const studentFolderSummary = document.getElementById('studentFolderSummary');

    let csrfToken = '';
    let siteContent = null;
    let activePageId = '';
    let activeWorkspace = 'website';
    let selectedStudentId = '';
    let studentRecords = [];
    let isDirty = false;
    const DATES_PAGE_ID = 'dates';
    const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
                { id: '2026-10-12', label: 'October 12, 2026', note: 'Monday | 8:00 AM - 3:00 PM', location: '7802 E Telecom Pkwy, Tampa, FL 33637' },
                { id: '2026-12-14', label: 'December 14, 2026', note: 'Monday | 8:00 AM - 3:00 PM', location: '7802 E Telecom Pkwy, Tampa, FL 33637' },
            ],
        },
    ];

    document.addEventListener('DOMContentLoaded', restoreSession);
    loginForm.addEventListener('submit', handleLogin);
    refreshButton.addEventListener('click', function () {
        if (activeWorkspace === 'students') loadStudents(selectedStudentId);
        else loadContent();
    });
    logoutButton.addEventListener('click', handleLogout);
    editWebsiteTab.addEventListener('click', function () { switchWorkspace('website'); });
    studentsTab.addEventListener('click', function () { switchWorkspace('students'); });
    studentAccessButton.addEventListener('click', handleStudentAccessUpdate);
    studentRenewalForm.addEventListener('submit', handleStudentRenewalUpdate);
    studentFolderForm.addEventListener('submit', handleStudentFolderConnect);
    studentNotificationForm.addEventListener('submit', handleStudentNotification);
    studentNotificationForm.addEventListener('change', updateStudentNotificationControls);
    studentNotificationSubject.addEventListener('input', updateStudentNotificationControls);
    studentNotificationMessage.addEventListener('input', updateStudentNotificationControls);
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
        activeWorkspace = 'website';
        selectedStudentId = '';
        studentRecords = [];
        setDirty(false);
        contentForm.replaceChildren();
        studentsTableBody.replaceChildren();
        classCountList.replaceChildren();
        studentNotificationForm.reset();
        studentNotificationCertificate.replaceChildren(new Option('Choose a certificate group', ''));
        studentNotificationStudent.replaceChildren(new Option('Choose an active student', ''));
        updateStudentNotificationControls();
        studentFolderSummary.textContent = 'No Drive folder connected yet.';
        studentInspector.hidden = true;
        studentNotificationCount.textContent = 'Loading active recipients…';
        studentNotificationButton.disabled = true;
        updateWorkspaceTabs();
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
            if (activeWorkspace === 'students') renderStudentsPage();
            else renderActivePage();
            setDirty(false);
            setStatus(editorStatus, result.source?.warning ? result.source.warning : '');
        } catch {
            setStatus(editorStatus, 'Unable to load content.', 'error');
        } finally {
            refreshButton.disabled = false;
        }
    }

    function switchWorkspace(workspace) {
        if (!['website', 'students'].includes(workspace) || workspace === activeWorkspace) return;
        if (isDirty && !window.confirm('Discard unsaved website changes and switch sections?')) return;

        activeWorkspace = workspace;
        setDirty(false);
        updateWorkspaceTabs();
        if (activeWorkspace === 'students') renderStudentsPage();
        else renderActivePage();
    }

    function updateWorkspaceTabs() {
        const websiteActive = activeWorkspace === 'website';
        editWebsiteTab.classList.toggle('active', websiteActive);
        editWebsiteTab.setAttribute('aria-selected', String(websiteActive));
        studentsTab.classList.toggle('active', !websiteActive);
        studentsTab.setAttribute('aria-selected', String(!websiteActive));
        adminWorkspacePanel.setAttribute('aria-labelledby', (websiteActive ? 'editWebsiteTab' : 'studentsTab') + ' pageTitle');
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
        editorLayout.classList.remove('students-workspace');
        contentForm.replaceChildren();
        contentForm.hidden = false;
        studentsPanel.hidden = true;
        saveActions.hidden = false;

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

    function renderStudentsPage() {
        activeWorkspace = 'students';
        updateWorkspaceTabs();
        editorLayout.classList.add('students-workspace');
        pageTitle.textContent = 'Students';
        pageDescription.textContent = 'Review accounts, see class totals, manage renewal dates, control portal access, and connect each student’s Drive folder.';
        contentForm.hidden = true;
        studentsPanel.hidden = false;
        saveActions.hidden = true;
        setDirty(false);
        loadStudents(selectedStudentId);
    }

    async function loadStudents(preferredStudentId) {
        setStatus(studentsStatus, 'Loading students...');
        studentCount.textContent = '—';
        activeStudentCount.textContent = '—';
        pendingStudentCount.textContent = '—';
        deactivatedStudentCount.textContent = '—';
        classCountList.replaceChildren();
        studentsTableBody.replaceChildren();
        studentInspector.hidden = true;

        try {
            const response = await fetch('/api/admin-students', {
                method: 'GET',
                credentials: 'same-origin',
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                setStatus(studentsStatus, result.error || 'Unable to load students.', 'error');
                if (response.status === 401) showLogin();
                return;
            }

            studentCount.textContent = String(Number(result.totalStudents) || 0);
            activeStudentCount.textContent = String(Number(result.activePortalStudents) || 0);
            pendingStudentCount.textContent = String(Number(result.pendingStudents) || 0);
            deactivatedStudentCount.textContent = String(Number(result.deactivatedPortalStudents) || 0);
            updatePendingBadge(Number(result.pendingStudents) || 0);
            driveServiceAccountEmail.textContent = result.driveServiceAccountEmail
                || 'Google Drive is not configured yet';
            renderClassCounts(Array.isArray(result.classCounts) ? result.classCounts : []);
            studentRecords = (Array.isArray(result.students) ? result.students : [])
                .filter(function (student) { return student && UUID_PATTERN.test(String(student.id || '')); });
            renderStudentNotificationRecipients();

            selectedStudentId = studentRecords.some(function (student) { return student.id === preferredStudentId; })
                ? preferredStudentId
                : '';
            renderStudentRows(studentRecords);
            if (selectedStudentId) renderStudentInspector(getSelectedStudent());
            setStatus(studentsStatus, studentRecords.length ? 'Student roster is up to date.' : 'No students have registered yet.', 'success');
        } catch {
            setStatus(studentsStatus, 'Unable to load students.', 'error');
            studentNotificationCount.textContent = 'Recipients unavailable';
            updateStudentNotificationControls();
        }
    }

    function renderStudentNotificationRecipients() {
        const activeStudents = studentRecords.filter(function (student) {
            return student.portalActive && student.email;
        });
        const previousCertificate = studentNotificationCertificate.value;
        const previousValue = studentNotificationStudent.value;
        const certificateGroups = getCertificateGroups(activeStudents);

        studentNotificationCertificate.replaceChildren(new Option('Choose a certificate group', ''));
        certificateGroups.forEach(function (group) {
            const option = document.createElement('option');
            option.value = group.code;
            option.textContent = 'ASSE ' + group.code + ' — ' + group.count + ' active student'
                + (group.count === 1 ? '' : 's');
            studentNotificationCertificate.appendChild(option);
        });
        if (certificateGroups.some(function (group) { return group.code === previousCertificate; })) {
            studentNotificationCertificate.value = previousCertificate;
        }

        studentNotificationStudent.replaceChildren(new Option('Choose an active student', ''));
        activeStudents.forEach(function (student) {
            const option = document.createElement('option');
            option.value = student.id;
            option.textContent = (student.fullName || 'Unnamed student') + ' — ' + student.email;
            studentNotificationStudent.appendChild(option);
        });
        if (activeStudents.some(function (student) { return student.id === previousValue; })) {
            studentNotificationStudent.value = previousValue;
        }
        studentNotificationCount.textContent = activeStudents.length + ' active recipient'
            + (activeStudents.length === 1 ? '' : 's');
        updateStudentNotificationControls();
    }

    function getCertificateCode(courseCode) {
        const match = String(courseCode || '').match(/(?:^|[^0-9])(\d{4})$/);
        return match ? match[1] : '';
    }

    function studentHasCertificate(student, certificateCode) {
        return Array.isArray(student.enrollments) && student.enrollments.some(function (enrollment) {
            return enrollment.enrollmentStatus !== 'cancelled'
                && getCertificateCode(enrollment.courseCode) === certificateCode;
        });
    }

    function getCertificateGroups(activeStudents) {
        const counts = new Map();
        activeStudents.forEach(function (student) {
            const studentCodes = new Set();
            (Array.isArray(student.enrollments) ? student.enrollments : []).forEach(function (enrollment) {
                if (enrollment.enrollmentStatus === 'cancelled') return;
                const code = getCertificateCode(enrollment.courseCode);
                if (code) studentCodes.add(code);
            });
            studentCodes.forEach(function (code) { counts.set(code, (counts.get(code) || 0) + 1); });
        });
        return Array.from(counts, function (entry) { return { code: entry[0], count: entry[1] }; })
            .sort(function (a, b) { return a.code.localeCompare(b.code); });
    }

    function updateStudentNotificationControls() {
        const scopeInput = studentNotificationForm.querySelector('input[name="scope"]:checked');
        const scope = scopeInput ? scopeInput.value : 'all_active';
        const activeStudents = studentRecords.filter(function (student) {
            return student.portalActive && student.email;
        });
        const certificateGroup = scope === 'certificate';
        const oneStudent = scope === 'student';
        studentNotificationCertificateField.hidden = !certificateGroup;
        studentNotificationCertificate.disabled = !certificateGroup;
        studentNotificationRecipientField.hidden = !oneStudent;
        studentNotificationStudent.disabled = !oneStudent;
        studentNotificationMessageCount.textContent = studentNotificationMessage.value.length + ' / 5000';

        let recipientCount = activeStudents.length;
        let preview = recipientCount
            ? recipientCount + ' active student' + (recipientCount === 1 ? '' : 's') + ' will receive an individual email.'
            : 'No active students available.';
        if (certificateGroup) {
            const certificateCode = studentNotificationCertificate.value;
            recipientCount = activeStudents.filter(function (student) {
                return studentHasCertificate(student, certificateCode);
            }).length;
            preview = certificateCode
                ? recipientCount + ' active ASSE ' + certificateCode + ' student'
                    + (recipientCount === 1 ? '' : 's') + ' will receive an individual email.'
                : 'Choose a certificate group.';
        } else if (oneStudent) {
            const student = activeStudents.find(function (item) { return item.id === studentNotificationStudent.value; });
            recipientCount = student ? 1 : 0;
            preview = student
                ? 'Only ' + (student.fullName || student.email) + ' will receive this email.'
                : 'Choose one active student.';
        }

        studentNotificationPreview.textContent = preview;
        const subjectReady = studentNotificationSubject.value.trim().length >= 3;
        const messageReady = studentNotificationMessage.value.trim().length >= 10;
        studentNotificationButton.disabled = recipientCount < 1 || !subjectReady || !messageReady;
    }

    async function handleStudentNotification(event) {
        event.preventDefault();
        setStatus(studentNotificationStatus, '');
        updateStudentNotificationControls();
        if (!studentNotificationForm.reportValidity() || studentNotificationButton.disabled) return;

        const formData = new FormData(studentNotificationForm);
        const scope = String(formData.get('scope') || 'all_active');
        const studentId = scope === 'student' ? String(formData.get('studentId') || '') : '';
        const certificateCode = scope === 'certificate' ? String(formData.get('certificateCode') || '') : '';
        const activeStudents = studentRecords.filter(function (student) {
            return student.portalActive && student.email;
        });
        const selectedStudent = activeStudents.find(function (student) { return student.id === studentId; });
        const recipientCount = scope === 'student'
            ? (selectedStudent ? 1 : 0)
            : scope === 'certificate'
                ? activeStudents.filter(function (student) { return studentHasCertificate(student, certificateCode); }).length
                : activeStudents.length;
        if (!recipientCount) {
            setStatus(studentNotificationStatus, scope === 'certificate'
                ? 'Choose a certificate group with at least one active student.'
                : 'Choose an active student recipient.', 'error');
            return;
        }

        const audienceLabel = scope === 'student'
            ? (selectedStudent.fullName || selectedStudent.email)
            : scope === 'certificate'
                ? recipientCount + ' active ASSE ' + certificateCode + ' students'
            : recipientCount + ' active students';
        if (!window.confirm('Send this notification to ' + audienceLabel + '? Each recipient will receive a private email.')) return;

        setButtonBusy(studentNotificationButton, true, 'Sending…');
        try {
            const response = await fetch('/api/admin-student-notification', {
                method: 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({
                    scope,
                    studentId,
                    certificateCode,
                    subject: studentNotificationSubject.value.trim(),
                    message: studentNotificationMessage.value.trim(),
                    requestId: createRequestId(),
                }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                setStatus(studentNotificationStatus, result.error || 'Unable to send the notification.', 'error');
                if (response.status === 401) showLogin();
                return;
            }

            studentNotificationSubject.value = '';
            studentNotificationMessage.value = '';
            updateStudentNotificationControls();
            setStatus(studentNotificationStatus, result.message || 'Notification sent.', 'success');
        } catch {
            setStatus(studentNotificationStatus, 'Unable to send the notification.', 'error');
        } finally {
            setButtonBusy(studentNotificationButton, false, 'Send notification');
            updateStudentNotificationControls();
        }
    }

    function createRequestId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
        return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16)
            + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
    }

    function updatePendingBadge(count) {
        pendingStudentTabCount.textContent = String(count);
        pendingStudentTabCount.hidden = count < 1;
    }

    function renderClassCounts(counts) {
        classCountList.replaceChildren();
        if (!counts.length) {
            const group = document.createElement('div');
            const term = document.createElement('dt');
            const value = document.createElement('dd');
            term.textContent = 'No class enrollments';
            value.textContent = '0';
            group.append(term, value);
            classCountList.appendChild(group);
            return;
        }

        counts.forEach(function (item) {
            const group = document.createElement('div');
            const term = document.createElement('dt');
            const value = document.createElement('dd');
            term.textContent = [item.courseCode, item.courseName, item.classSession].filter(Boolean).join(' · ');
            value.textContent = String(Number(item.count) || 0);
            group.append(term, value);
            classCountList.appendChild(group);
        });
    }

    function renderStudentRows(rows) {
        studentsTableBody.replaceChildren();
        if (!rows.length) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 5;
            cell.className = 'students-empty';
            cell.textContent = 'No student records found.';
            row.appendChild(cell);
            studentsTableBody.appendChild(row);
            return;
        }

        rows.forEach(function (item) {
            const row = document.createElement('tr');
            if (item.id === selectedStudentId) row.classList.add('selected-student-row');

            const studentCell = document.createElement('td');
            const name = document.createElement('strong');
            const email = document.createElement('span');
            const number = document.createElement('small');
            name.textContent = item.fullName || 'Unnamed student';
            email.textContent = item.email || 'No email';
            number.textContent = (item.studentNumber || 'No student number')
                + (item.createdAt ? ' · Registered ' + formatDate(item.createdAt) : '');
            studentCell.append(name, email, number);

            const accessCell = createStatusCell(getStudentAccessState(item));
            const enrollments = Array.isArray(item.enrollments) ? item.enrollments : [];
            const firstEnrollment = enrollments[0] || {};
            const classCell = createRosterCell(
                [firstEnrollment.courseCode, firstEnrollment.courseName].filter(Boolean).join(' · ') || 'Not assigned'
            );
            if (enrollments.length > 1) {
                const more = document.createElement('small');
                more.textContent = '+' + (enrollments.length - 1) + ' more enrollment' + (enrollments.length === 2 ? '' : 's');
                classCell.appendChild(more);
            }

            const renewalCell = document.createElement('td');
            renewalCell.appendChild(createStatusPill(item.renewalStatus || 'pending'));
            const renewedDate = document.createElement('small');
            renewedDate.textContent = item.renewalDate
                ? 'Renewed ' + formatDate(item.renewalDate)
                : 'Renewal date not recorded';
            const dueDate = document.createElement('small');
            dueDate.textContent = item.renewalDueDate
                ? 'Expires ' + formatDate(item.renewalDueDate)
                : 'No expiration date';
            renewalCell.append(renewedDate, dueDate);

            const actionCell = document.createElement('td');
            const manageButton = document.createElement('button');
            manageButton.type = 'button';
            manageButton.className = 'student-manage-btn';
            manageButton.textContent = 'Manage';
            manageButton.setAttribute('aria-pressed', String(item.id === selectedStudentId));
            manageButton.addEventListener('click', function () {
                selectedStudentId = item.id;
                renderStudentRows(studentRecords);
                renderStudentInspector(item);
                studentInspector.scrollIntoView({ block: 'nearest' });
            });
            actionCell.appendChild(manageButton);

            row.append(studentCell, accessCell, classCell, renewalCell, actionCell);
            studentsTableBody.appendChild(row);
        });
    }

    function renderStudentInspector(student) {
        if (!student) {
            studentInspector.hidden = true;
            return;
        }

        studentInspector.hidden = false;
        studentInspectorTitle.textContent = student.fullName || 'Student account';
        studentInspectorEmail.textContent = [student.email, student.studentNumber].filter(Boolean).join(' · ');
        const accessState = getStudentAccessState(student);
        studentInspectorAccess.className = 'roster-status roster-status-' + accessState;
        studentInspectorAccess.textContent = accessState === 'active'
            ? 'Portal active'
            : accessState === 'disabled' ? 'Portal deactivated' : 'Waiting for review';
        studentAccessDescription.textContent = student.portalActive
            ? 'Deactivation immediately blocks this student’s records and Drive files. Access can be restored later.'
            : accessState === 'disabled'
                ? 'This student cannot sign in or access private records. Reactivate access when appropriate.'
                : 'Review this account before granting access to private records.';
        studentAccessButton.textContent = student.portalActive ? 'Deactivate portal access' : 'Activate portal access';
        studentAccessButton.classList.toggle('danger-btn', student.portalActive);
        studentRenewalStatus.value = ['active', 'due_soon', 'expired', 'pending'].includes(student.renewalStatus)
            ? student.renewalStatus
            : 'pending';
        studentRenewalDate.value = normalizeDateInput(student.renewalDate);
        studentRenewalDueDate.value = normalizeDateInput(student.renewalDueDate);
        studentFolderForm.reset();
        renderConnectedFolder(student.driveFolder);
        setStatus(studentAccessStatus, '');
        setStatus(studentRenewalStatusMessage, '');
        setStatus(studentFolderStatus, '');
    }

    function renderConnectedFolder(folder) {
        studentFolderSummary.className = folder ? 'connected-folder-active' : '';
        studentFolderSummary.textContent = folder
            ? (folder.title || 'Student Records') + ' — connected'
            : 'No Drive folder connected yet.';
    }

    function getSelectedStudent() {
        return studentRecords.find(function (student) { return student.id === selectedStudentId; }) || null;
    }

    function updateStudentTotals() {
        const activeCount = studentRecords.filter(function (student) { return student.portalActive; }).length;
        const pendingCount = studentRecords.length - activeCount;
        const deactivatedCount = studentRecords.filter(function (student) {
            return !student.portalActive && Boolean(student.portalDeactivatedAt);
        }).length;
        const waitingCount = pendingCount - deactivatedCount;
        studentCount.textContent = String(studentRecords.length);
        activeStudentCount.textContent = String(activeCount);
        pendingStudentCount.textContent = String(waitingCount);
        deactivatedStudentCount.textContent = String(deactivatedCount);
        updatePendingBadge(waitingCount);
    }

    async function handleStudentAccessUpdate() {
        const student = getSelectedStudent();
        if (!student) return;
        const portalActive = !student.portalActive;
        if (!portalActive && !window.confirm(
            'Deactivate portal access for ' + (student.fullName || 'this student')
            + '? Their student record and Drive files will be blocked immediately.'
        )) return;
        setStatus(studentAccessStatus, '');
        setButtonBusy(studentAccessButton, true, portalActive ? 'Activating…' : 'Deactivating…');

        try {
            const response = await fetch('/api/admin-student', {
                method: 'PATCH',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({ studentId: student.id, portalActive }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                setStatus(studentAccessStatus, result.error || 'Unable to update portal access.', 'error');
                if (response.status === 401) showLogin();
                return;
            }

            student.portalActive = portalActive;
            student.portalDeactivatedAt = result.student?.portalDeactivatedAt || null;
            renderStudentRows(studentRecords);
            renderStudentInspector(student);
            updateStudentTotals();
            setStatus(studentAccessStatus, portalActive ? 'Portal access activated.' : 'Portal access deactivated immediately.', 'success');
        } catch {
            setStatus(studentAccessStatus, 'Unable to update portal access.', 'error');
        } finally {
            setButtonBusy(
                studentAccessButton,
                false,
                student.portalActive ? 'Deactivate portal access' : 'Activate portal access'
            );
        }
    }

    async function handleStudentRenewalUpdate(event) {
        event.preventDefault();
        const student = getSelectedStudent();
        if (!student || !studentRenewalForm.reportValidity()) return;

        const renewalDate = studentRenewalDate.value || null;
        const renewalDueDate = studentRenewalDueDate.value || null;
        if (renewalDate && renewalDueDate && renewalDueDate < renewalDate) {
            setStatus(studentRenewalStatusMessage, 'The expiration date cannot be before the renewal date.', 'error');
            return;
        }

        setStatus(studentRenewalStatusMessage, '');
        setButtonBusy(studentRenewalButton, true, 'Saving…');
        try {
            const response = await fetch('/api/admin-student', {
                method: 'PATCH',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({
                    studentId: student.id,
                    renewalStatus: studentRenewalStatus.value,
                    renewalDate,
                    renewalDueDate,
                }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                setStatus(studentRenewalStatusMessage, result.error || 'Unable to save renewal information.', 'error');
                if (response.status === 401) showLogin();
                return;
            }

            student.renewalStatus = result.student.renewalStatus;
            student.renewalDate = result.student.renewalDate;
            student.renewalDueDate = result.student.renewalDueDate;
            renderStudentRows(studentRecords);
            setStatus(studentRenewalStatusMessage, 'Renewal and expiration information saved.', 'success');
        } catch {
            setStatus(studentRenewalStatusMessage, 'Unable to save renewal information.', 'error');
        } finally {
            setButtonBusy(studentRenewalButton, false, 'Save renewal');
        }
    }

    async function handleStudentFolderConnect(event) {
        event.preventDefault();
        const student = getSelectedStudent();
        if (!student || !studentFolderForm.reportValidity()) return;

        const formData = new FormData(studentFolderForm);
        const payload = {
            studentId: student.id,
            title: String(formData.get('title') || '').trim(),
            driveFolder: String(formData.get('driveFolder') || '').trim(),
        };
        setStatus(studentFolderStatus, '');
        setButtonBusy(studentFolderButton, true, 'Checking folder…');

        try {
            const response = await fetch('/api/admin-student-folder', {
                method: 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify(payload),
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                setStatus(studentFolderStatus, result.error || 'Unable to connect the Drive folder.', 'error');
                if (response.status === 401) showLogin();
                return;
            }

            student.driveFolder = result.folder;
            renderStudentInspector(student);
            document.getElementById('studentDriveFolder').value = '';
            const itemCount = Number(result.folder?.itemCount) || 0;
            setStatus(
                studentFolderStatus,
                'Drive folder connected. ' + itemCount + ' item' + (itemCount === 1 ? '' : 's') + ' found.',
                'success'
            );
        } catch {
            setStatus(studentFolderStatus, 'Unable to connect the Drive folder.', 'error');
        } finally {
            setButtonBusy(studentFolderButton, false, 'Connect folder');
        }
    }

    function createRosterCell(value) {
        const cell = document.createElement('td');
        cell.textContent = value;
        return cell;
    }

    function createStatusCell(status) {
        const cell = document.createElement('td');
        cell.appendChild(createStatusPill(status));
        return cell;
    }

    function createStatusPill(status) {
        const normalized = String(status || 'pending').toLowerCase().replace(/[^a-z_]/g, '');
        const pill = document.createElement('span');
        pill.className = 'roster-status roster-status-' + normalized;
        pill.textContent = normalized.replace(/_/g, ' ');
        return pill;
    }

    function getStudentAccessState(student) {
        if (student && student.portalActive) return 'active';
        return student && student.portalDeactivatedAt ? 'disabled' : 'pending';
    }

    function normalizeDateInput(value) {
        const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : '';
    }

    function formatDate(value) {
        const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) return String(value || '');
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
        }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
    }

    function renderDatesPage() {
        const groups = getDateGroups();

        pageTitle.textContent = 'Class Dates & Locations';
        pageDescription.textContent = 'Edit each student-facing date bubble. Every bubble can have its own date, schedule note, and location.';

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
        addButton.textContent = 'Add date & location';
        addButton.addEventListener('click', function () {
            if (!Array.isArray(group.dates)) group.dates = [];
            group.dates.push({
                id: nextDateId(group),
                label: 'New date',
                note: 'Schedule details',
                location: '',
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

        const entryHead = document.createElement('div');
        entryHead.className = 'date-entry-heading';

        const entryTitle = document.createElement('strong');
        entryTitle.textContent = 'Student bubble ' + (index + 1);

        const preview = document.createElement('div');
        preview.className = 'date-bubble-preview';
        preview.setAttribute('aria-live', 'polite');

        const previewDate = document.createElement('strong');
        const previewNote = document.createElement('span');
        const previewLocation = document.createElement('span');
        previewLocation.className = 'date-bubble-preview-location';
        preview.append(previewDate, previewNote, previewLocation);
        entryHead.append(entryTitle, preview);

        function updatePreview() {
            previewDate.textContent = String(date.label || '').trim() || 'Date not entered';
            previewNote.textContent = String(date.note || '').trim() || 'No schedule note';
            previewLocation.textContent = String(date.location || '').trim()
                ? 'Location: ' + String(date.location).trim()
                : 'Location not confirmed';
            previewLocation.dataset.empty = String(!String(date.location || '').trim());
        }

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
            onInput: function (value) {
                date.label = value;
                updatePreview();
            },
        });

        const noteField = createDateInput({
            label: 'Small note',
            value: date.note || '',
            maxLength: 120,
            required: false,
            fieldName: 'note',
            help: 'Optional line under the date, such as Monday-Wednesday.',
            onInput: function (value) {
                date.note = value;
                updatePreview();
            },
        });

        const locationField = createDateInput({
            label: 'Location shown in this bubble',
            value: date.location || '',
            maxLength: 180,
            required: false,
            fieldName: 'location',
            className: 'date-location-field',
            placeholder: 'Example: 7802 E Telecom Pkwy, Tampa, FL 33637',
            help: 'This location belongs only to this date. Leave it blank when the location is not confirmed.',
            onInput: function (value) {
                date.location = value;
                updatePreview();
            },
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

        updatePreview();
        row.append(entryHead, codeField, labelField, noteField, locationField, removeWrap);
        return row;
    }

    function createDateInput(options) {
        const label = document.createElement('label');
        label.textContent = options.label;
        if (options.className) label.classList.add(options.className);

        const input = document.createElement('input');
        input.type = 'text';
        input.value = options.value || '';
        input.maxLength = options.maxLength;
        input.required = Boolean(options.required);
        input.dataset.dateField = options.fieldName;
        if (options.placeholder) input.placeholder = options.placeholder;

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
        setStatus(editorStatus, 'Saving website changes...');

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
            label: 'Class Dates & Locations',
            description: 'Edit every class and recertification date bubble and its location.',
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

    function setButtonBusy(button, busy, label) {
        button.disabled = busy;
        button.textContent = label;
        button.setAttribute('aria-busy', String(busy));
    }

    function showLogin() {
        loginView.hidden = false;
        editorView.hidden = true;
    }

    function showEditor() {
        loginView.hidden = true;
        editorView.hidden = false;
        updateWorkspaceTabs();
    }

    function setStatus(element, message, type) {
        element.textContent = message || '';
        element.className = 'status-msg';
        if (type) element.classList.add(type);
    }
})();
