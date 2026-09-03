(function () {
    'use strict';

    const portalShell = document.getElementById('studentPortalShell');
    if (!portalShell) return;

    const loadingView = document.getElementById('studentPortalLoading');
    const loadingMessage = loadingView.querySelector('p');
    const loginView = document.getElementById('studentLoginView');
    const loginForm = document.getElementById('studentLoginForm');
    const loginTitle = document.getElementById('studentLoginTitle');
    const loginEmail = document.getElementById('studentLoginEmail');
    const loginPassword = document.getElementById('studentLoginPassword');
    const loginPasswordToggle = document.getElementById('studentLoginPasswordToggle');
    const loginButton = document.getElementById('studentLoginButton');
    const loginStatus = document.getElementById('studentLoginStatus');
    const showResetButton = document.getElementById('showStudentResetButton');
    const resetRequestView = document.getElementById('studentResetRequestView');
    const resetRequestForm = document.getElementById('studentResetRequestForm');
    const resetRequestTitle = document.getElementById('studentResetRequestTitle');
    const resetEmail = document.getElementById('studentResetEmail');
    const resetRequestButton = document.getElementById('studentResetRequestButton');
    const resetRequestStatus = document.getElementById('studentResetRequestStatus');
    const backFromResetButton = document.getElementById('backFromStudentResetButton');
    const passwordUpdateView = document.getElementById('studentPasswordUpdateView');
    const passwordUpdateForm = document.getElementById('studentPasswordUpdateForm');
    const passwordUpdateTitle = document.getElementById('studentPasswordUpdateTitle');
    const recoveryEmail = document.getElementById('studentRecoveryEmail');
    const passwordUpdateButton = document.getElementById('studentPasswordUpdateButton');
    const passwordUpdateStatus = document.getElementById('studentPasswordUpdateStatus');
    const showRegistrationButton = document.getElementById('showStudentRegistrationButton');
    const registrationView = document.getElementById('studentRegistrationView');
    const registrationForm = document.getElementById('studentRegistrationForm');
    const registrationTitle = document.getElementById('studentRegistrationTitle');
    const registrationButton = document.getElementById('studentRegistrationButton');
    const registrationStatus = document.getElementById('studentRegistrationStatus');
    const backToLoginButton = document.getElementById('backToStudentLoginButton');
    const accountView = document.getElementById('studentAccountView');
    const accountTitle = document.getElementById('studentAccountTitle');
    const accountStatus = document.getElementById('studentAccountStatus');
    const sessionEmail = document.getElementById('studentSessionEmail');
    const logoutButton = document.getElementById('studentLogoutButton');
    const enrollmentList = document.getElementById('studentEnrollmentList');
    const enrollmentCount = document.getElementById('studentEnrollmentCount');
    const enrollmentEmpty = document.getElementById('studentEnrollmentEmpty');
    const documentNav = document.getElementById('studentDocumentNav');
    const documentWorkspace = document.getElementById('studentDocumentWorkspace');
    const documentViewer = document.getElementById('studentDocumentViewer');
    const documentImage = document.getElementById('studentDocumentImage');
    const documentPlaceholder = document.getElementById('studentDocumentPlaceholder');
    const documentStatus = document.getElementById('studentDocumentStatus');
    const documentSync = document.getElementById('studentDocumentSync');
    const documentEmpty = document.getElementById('studentDocumentEmpty');

    const studentFields = {
        fullName: document.getElementById('studentFullName'),
        studentNumber: document.getElementById('studentNumber'),
        email: document.getElementById('studentEmail'),
        phone: document.getElementById('studentPhone'),
        certificationNumber: document.getElementById('studentCertificationNumber'),
        renewalStatus: document.getElementById('studentRenewalStatus'),
        renewalDate: document.getElementById('studentRenewalDate'),
        renewalDueDate: document.getElementById('studentRenewalDueDate'),
    };

    const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const FOLDER_DOCUMENT_PATTERN = /^folder_[A-Za-z0-9_-]{43}$/;
    const ACCOUNT_REFRESH_INTERVAL_MS = 60 * 1000;
    const ACCESS_CHECK_INTERVAL_MS = 15 * 1000;
    const dateFormatter = new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    const driveCheckTimeFormatter = new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
    });
    const documentsById = new Map();
    let currentSessionEmail = '';
    let csrfToken = '';
    let recoveryCsrfToken = '';
    let activeDocumentId = '';
    let documentRequestNumber = 0;
    let accountRefreshInFlight = false;
    let lastAccountRefreshAt = 0;
    let accessCheckInFlight = false;

    loginForm.addEventListener('submit', handleLogin);
    loginPasswordToggle.addEventListener('click', toggleLoginPassword);
    showResetButton.addEventListener('click', function () { showResetRequest(true); });
    resetRequestForm.addEventListener('submit', handleResetRequest);
    backFromResetButton.addEventListener('click', function () { showLogin('', true); });
    passwordUpdateForm.addEventListener('submit', handlePasswordUpdate);
    showRegistrationButton.addEventListener('click', function () { showRegistration(true); });
    backToLoginButton.addEventListener('click', function () { showLogin('', true); });
    registrationForm.addEventListener('submit', handleRegistration);
    logoutButton.addEventListener('click', handleLogout);
    documentNav.addEventListener('click', handleDocumentSelection);
    window.setInterval(refreshVisibleAccount, ACCOUNT_REFRESH_INTERVAL_MS);
    window.setInterval(verifyVisibleAccess, ACCESS_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') refreshVisibleAccount();
    });
    initializePortal();

    async function initializePortal() {
        const recoveryParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const recoveryToken = recoveryParams.get('access_token') || '';
        const recoveryType = recoveryParams.get('type') || '';

        if (recoveryToken || recoveryType) {
            window.history.replaceState(null, '', window.location.pathname);
            showLoading('Verifying your secure reset link…');
            try {
                const result = await requestJson('/api/student-password-recovery', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accessToken: recoveryToken, type: recoveryType }),
                });
                if (!result.response.ok || !result.data.success) {
                    showLogin(
                        cleanText(result.data.error) || 'This password reset link is invalid or expired. Request a new one.',
                        true,
                        'error'
                    );
                    return;
                }
                recoveryCsrfToken = cleanText(result.data.csrfToken);
                recoveryEmail.value = cleanText(result.data.email);
                showPasswordUpdate(true);
                return;
            } catch {
                showLogin('We could not verify the reset link. Request a new one and try again.', true, 'error');
                return;
            }
        }

        if (new URLSearchParams(window.location.search).get('mode') === 'recovery') {
            window.history.replaceState(null, '', window.location.pathname);
            showLogin('This password reset link is incomplete or expired. Request a new one.', true, 'error');
            return;
        }

        restoreSession();
    }

    function refreshVisibleAccount() {
        if (
            !currentSessionEmail
            || accountView.hidden
            || Date.now() - lastAccountRefreshAt < 10000
        ) return;
        loadAccount(false, { silent: true });
    }

    async function verifyVisibleAccess() {
        if (
            accessCheckInFlight
            || !currentSessionEmail
            || accountView.hidden
            || document.visibilityState !== 'visible'
        ) return;

        accessCheckInFlight = true;
        try {
            const result = await requestJson('/api/student-session', { method: 'GET' });
            if (result.response.status === 401 || result.response.status === 403) {
                currentSessionEmail = '';
                csrfToken = '';
                lastAccountRefreshAt = 0;
                clearAccountData();
                showLogin(
                    result.response.status === 403
                        ? 'Frank has deactivated portal access for this account. Contact DARPA SOLUTIONS LLC if you need help.'
                        : 'Your session has expired. Please sign in again.',
                    true,
                    'error'
                );
            } else if (result.response.ok && result.data.success) {
                csrfToken = cleanText(result.data.csrfToken) || csrfToken;
            }
        } catch {
            // A later access check or account refresh will retry.
        } finally {
            accessCheckInFlight = false;
        }
    }

    async function restoreSession() {
        showLoading('Checking your sign-in status…');

        try {
            const result = await requestJson('/api/student-session', {
                method: 'GET',
            });

            if (!result.response.ok || !result.data.success) {
                showLogin('', false);
                return;
            }

            currentSessionEmail = cleanText(result.data.user && result.data.user.email);
            csrfToken = cleanText(result.data.csrfToken);
            await loadAccount(false);
        } catch (error) {
            showLogin('We could not check your account right now. You can still try signing in.', false, 'error');
        }
    }

    async function handleLogin(event) {
        event.preventDefault();
        setStatus(loginStatus, '');

        if (!loginForm.reportValidity()) return;

        const email = loginEmail.value.trim();
        const password = loginPassword.value;
        setButtonBusy(loginButton, true, 'Signing in…');
        portalShell.setAttribute('aria-busy', 'true');

        try {
            const result = await requestJson('/api/student-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            if (!result.response.ok || !result.data.success) {
                let message = 'The email or password is incorrect.';
                if (result.response.status === 429) {
                    message = 'Too many sign-in attempts. Please wait and try again.';
                } else if (result.response.status === 403) {
                    message = 'Your account is waiting for Frank to activate portal access.';
                } else if (result.response.status >= 500) {
                    message = 'The student portal is temporarily unavailable. Please try again later.';
                }
                setStatus(loginStatus, message, 'error');
                return;
            }

            currentSessionEmail = cleanText(result.data.user && result.data.user.email) || email;
            csrfToken = cleanText(result.data.csrfToken);
            loginForm.reset();
            await loadAccount(true);
        } catch (error) {
            setStatus(loginStatus, 'A network error prevented sign-in. Please try again.', 'error');
        } finally {
            setButtonBusy(loginButton, false, 'Sign in securely →');
            portalShell.setAttribute('aria-busy', 'false');
        }
    }

    async function handleRegistration(event) {
        event.preventDefault();
        setStatus(registrationStatus, '');
        if (!registrationForm.reportValidity()) return;

        const formData = new FormData(registrationForm);
        const payload = {
            fullName: String(formData.get('fullName') || '').trim(),
            email: String(formData.get('email') || '').trim(),
            courseCode: String(formData.get('courseCode') || ''),
            password: String(formData.get('password') || ''),
            confirmPassword: String(formData.get('confirmPassword') || ''),
        };
        setButtonBusy(registrationButton, true, 'Creating account…');
        portalShell.setAttribute('aria-busy', 'true');

        try {
            const result = await requestJson('/api/student-register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!result.response.ok || !result.data.success) {
                setStatus(
                    registrationStatus,
                    cleanText(result.data.error) || 'We could not create the account. Please try again.',
                    'error'
                );
                return;
            }

            registrationForm.reset();
            setStatus(
                registrationStatus,
                cleanText(result.data.message) || 'Account request received. Frank will review your portal access.',
                'success'
            );
        } catch (error) {
            setStatus(registrationStatus, 'A network error prevented registration. Please try again.', 'error');
        } finally {
            setButtonBusy(registrationButton, false, 'Create account');
            portalShell.setAttribute('aria-busy', 'false');
        }
    }

    async function handleResetRequest(event) {
        event.preventDefault();
        setStatus(resetRequestStatus, '');
        if (!resetRequestForm.reportValidity()) return;

        setButtonBusy(resetRequestButton, true, 'Sending secure link…');
        portalShell.setAttribute('aria-busy', 'true');
        try {
            const result = await requestJson('/api/student-password-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: resetEmail.value.trim() }),
            });
            if (!result.response.ok || !result.data.success) {
                setStatus(
                    resetRequestStatus,
                    cleanText(result.data.error) || 'The reset link could not be requested. Please try again.',
                    'error'
                );
                return;
            }
            resetRequestForm.reset();
            setStatus(
                resetRequestStatus,
                cleanText(result.data.message) || 'If a student account exists for that email, a secure reset link has been sent.',
                'success'
            );
        } catch {
            setStatus(resetRequestStatus, 'A network error prevented the reset request. Please try again.', 'error');
        } finally {
            setButtonBusy(resetRequestButton, false, 'Send reset link');
            portalShell.setAttribute('aria-busy', 'false');
        }
    }

    async function handlePasswordUpdate(event) {
        event.preventDefault();
        setStatus(passwordUpdateStatus, '');
        if (!passwordUpdateForm.reportValidity()) return;

        const formData = new FormData(passwordUpdateForm);
        const password = String(formData.get('password') || '');
        const confirmPassword = String(formData.get('confirmPassword') || '');
        if (password !== confirmPassword) {
            setStatus(passwordUpdateStatus, 'Passwords do not match.', 'error');
            return;
        }
        if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
            setStatus(passwordUpdateStatus, 'Use at least 12 characters with at least one letter and one number.', 'error');
            return;
        }

        setButtonBusy(passwordUpdateButton, true, 'Updating password…');
        portalShell.setAttribute('aria-busy', 'true');
        try {
            const result = await requestJson('/api/student-password-update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': recoveryCsrfToken,
                },
                body: JSON.stringify({ password, confirmPassword }),
            });
            if (!result.response.ok || !result.data.success) {
                setStatus(
                    passwordUpdateStatus,
                    cleanText(result.data.error) || 'The password could not be updated. Request a new reset link.',
                    'error'
                );
                return;
            }

            passwordUpdateForm.reset();
            recoveryCsrfToken = '';
            recoveryEmail.value = '';
            showLogin(
                cleanText(result.data.message) || 'Password updated. Sign in with your new password.',
                true,
                'success'
            );
        } catch {
            setStatus(passwordUpdateStatus, 'A network error prevented the password update. Please try again.', 'error');
        } finally {
            setButtonBusy(passwordUpdateButton, false, 'Update password');
            portalShell.setAttribute('aria-busy', 'false');
        }
    }

    async function handleLogout() {
        setButtonBusy(logoutButton, true, 'Signing out…');
        portalShell.setAttribute('aria-busy', 'true');

        try {
            const result = await requestJson('/api/student-auth', {
                method: 'DELETE',
                headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
            });
            if (!result.response.ok || !result.data.success) {
                setStatus(accountStatus, 'We could not sign you out. Please try again.', 'error');
                return;
            }
        } catch (error) {
            setStatus(accountStatus, 'A network error prevented sign-out. Please try again.', 'error');
            return;
        } finally {
            setButtonBusy(logoutButton, false, 'Sign out');
            portalShell.setAttribute('aria-busy', 'false');
        }

        currentSessionEmail = '';
        csrfToken = '';
        lastAccountRefreshAt = 0;
        clearAccountData();
        loginForm.reset();
        showLogin('You have been signed out.', true, 'success');
    }

    async function loadAccount(shouldFocus, options) {
        if (accountRefreshInFlight) return;
        accountRefreshInFlight = true;
        const silent = Boolean(options && options.silent);
        if (!silent) showLoading('Loading your student record…');

        try {
            const result = await requestJson('/api/student-account', {
                method: 'GET',
            });

            if (result.response.status === 401) {
                currentSessionEmail = '';
                csrfToken = '';
                clearAccountData();
                showLogin('Your session has expired. Please sign in again.', true, 'error');
                return;
            }

            if (result.response.status === 403) {
                await clearRevokedSession();
                clearAccountData();
                showLogin('Frank has deactivated portal access for this account. Contact DARPA SOLUTIONS LLC if you need help.', true, 'error');
                return;
            }

            if (!result.response.ok || !result.data.success) {
                if (silent) {
                    setStatus(accountStatus, 'Automatic refresh was delayed. Your last loaded record is still shown.', 'error');
                    return;
                }
                clearAccountData();
                showAccount(shouldFocus);
                setStatus(accountStatus, 'We could not load your student record. Please try again later or sign out and contact DARPA SOLUTIONS LLC.', 'error');
                return;
            }

            const student = isPlainObject(result.data.student) ? result.data.student : {};
            const enrollments = Array.isArray(result.data.enrollments) ? result.data.enrollments : [];
            const documents = Array.isArray(result.data.documents) ? result.data.documents : [];
            const driveFolder = isPlainObject(result.data.driveFolder) ? result.data.driveFolder : null;
            const documentNotice = cleanText(result.data.documentNotice);

            renderStudent(student);
            renderEnrollments(enrollments);
            renderDocuments(documents, driveFolder, documentNotice);
            currentSessionEmail = cleanText(student.email) || currentSessionEmail;
            lastAccountRefreshAt = Date.now();
            if (!silent) showAccount(shouldFocus);
            setStatus(accountStatus, '');
        } catch (error) {
            if (silent) {
                setStatus(accountStatus, 'Automatic refresh was delayed. Your last loaded record is still shown.', 'error');
                return;
            }
            clearAccountData();
            showAccount(shouldFocus);
            setStatus(accountStatus, 'A network error prevented your student record from loading. Please try again later.', 'error');
        } finally {
            accountRefreshInFlight = false;
        }
    }

    function renderStudent(student) {
        const fullName = cleanText(student.fullName);
        const firstName = fullName.split(/\s+/)[0];
        accountTitle.textContent = firstName ? 'Welcome, ' + firstName : 'Your training record';
        setFieldValue(studentFields.fullName, student.fullName);
        setFieldValue(studentFields.studentNumber, student.studentNumber);
        setFieldValue(studentFields.email, student.email || currentSessionEmail);
        setFieldValue(studentFields.phone, student.phone);
        setFieldValue(studentFields.certificationNumber, student.certificationNumber);

        const renewalKey = normaliseState(student.renewalStatus);
        const renewalLabel = formatStatus(student.renewalStatus, 'Not available');
        studentFields.renewalStatus.textContent = renewalLabel;
        studentFields.renewalStatus.dataset.state = getRenewalState(renewalKey);
        studentFields.renewalDate.textContent = formatDate(student.renewalDate, 'Not recorded');
        studentFields.renewalDueDate.textContent = formatDate(student.renewalDueDate, 'Not scheduled');
    }

    function renderEnrollments(enrollments) {
        enrollmentList.replaceChildren();

        const validEnrollments = enrollments.filter(isPlainObject);
        const count = validEnrollments.length;
        enrollmentCount.textContent = String(count);
        enrollmentCount.setAttribute('aria-label', count + (count === 1 ? ' class enrollment' : ' class enrollments'));
        enrollmentEmpty.hidden = count > 0;

        validEnrollments.forEach(function (enrollment) {
            const item = document.createElement('li');
            item.className = 'student-enrollment-item';

            const course = document.createElement('div');
            course.className = 'student-enrollment-course';
            const courseName = document.createElement('h5');
            const courseCode = cleanText(enrollment.courseCode);
            courseName.textContent = cleanText(enrollment.courseName) || (courseCode ? 'Course ' + courseCode : 'Course enrollment');
            course.appendChild(courseName);

            if (courseCode) {
                const code = document.createElement('p');
                code.textContent = courseCode;
                course.appendChild(code);
            }

            const session = document.createElement('div');
            session.className = 'student-enrollment-session';
            const sessionLabel = document.createElement('strong');
            sessionLabel.textContent = cleanText(enrollment.classSession) || 'Session not scheduled';
            session.appendChild(sessionLabel);

            const enrolledAt = cleanText(enrollment.enrolledAt);
            if (enrolledAt) {
                const enrolledDate = document.createElement('p');
                enrolledDate.textContent = 'Enrolled ' + formatDate(enrolledAt, 'date unavailable');
                session.appendChild(enrolledDate);
            }

            const statusKey = normaliseState(enrollment.enrollmentStatus);
            const status = document.createElement('span');
            status.className = 'student-enrollment-status';
            status.dataset.state = getEnrollmentState(statusKey);
            status.textContent = formatStatus(enrollment.enrollmentStatus, 'Status unavailable');

            item.append(course, session, status);
            enrollmentList.appendChild(item);
        });
    }

    function renderDocuments(documents, driveFolder, notice) {
        clearDocuments();

        const validDocuments = documents
            .filter(function (documentRecord) {
                return isPlainObject(documentRecord)
                    && (
                        UUID_PATTERN.test(cleanText(documentRecord.id))
                        || FOLDER_DOCUMENT_PATTERN.test(cleanText(documentRecord.id))
                    )
                    && cleanText(documentRecord.title);
            });

        const safeFolder = normaliseDriveFolder(driveFolder);
        if (safeFolder) {
            renderDriveFolder(safeFolder);
            const checkedAt = new Date();
            documentSync.textContent = 'Google Drive checked at ' + driveCheckTimeFormatter.format(checkedAt) + '.';
            documentSync.dataset.checkedAt = checkedAt.toISOString();
            documentSync.hidden = false;
        }

        if (validDocuments.length) {
            const legacyGroup = document.createElement('div');
            legacyGroup.className = 'student-approved-document-group';
            const heading = document.createElement('p');
            heading.textContent = safeFolder ? 'Other approved records' : 'Approved records';
            legacyGroup.appendChild(heading);
            validDocuments.forEach(function (documentRecord) {
                legacyGroup.appendChild(createFileRow({
                    id: cleanText(documentRecord.id),
                    title: cleanText(documentRecord.title),
                    mimeType: cleanText(documentRecord.mimeType),
                    previewable: true,
                    viewable: true,
                    downloadable: true,
                }));
            });
            documentNav.appendChild(legacyGroup);
        }

        if (notice && safeFolder) {
            const folderNotice = document.createElement('p');
            folderNotice.className = 'student-folder-notice';
            folderNotice.textContent = notice;
            documentNav.appendChild(folderNotice);
        }

        const availableDocuments = Array.from(documentsById.values());
        documentEmpty.textContent = notice || 'No private documents are connected to this account yet.';
        const hasFolderOrDocuments = Boolean(safeFolder) || validDocuments.length > 0;
        documentEmpty.hidden = hasFolderOrDocuments;
        documentWorkspace.hidden = !hasFolderOrDocuments;
        documentNav.hidden = !hasFolderOrDocuments;
        documentViewer.hidden = availableDocuments.length === 0;
        documentWorkspace.classList.toggle('folder-only', availableDocuments.length === 0);

        if (availableDocuments.length > 0) {
            selectDocument(availableDocuments[0]);
        }
    }

    function normaliseDriveFolder(folder) {
        if (!isPlainObject(folder) || !cleanText(folder.title)) return null;
        return {
            title: cleanText(folder.title),
            itemCount: Math.max(0, Math.min(Number(folder.itemCount) || 0, 500)),
            items: Array.isArray(folder.items) ? folder.items : [],
        };
    }

    function renderDriveFolder(folder) {
        const root = document.createElement('section');
        root.className = 'student-folder-root';

        const heading = document.createElement('div');
        heading.className = 'student-folder-root-heading';
        const title = document.createElement('strong');
        const count = document.createElement('span');
        title.textContent = folder.title;
        count.textContent = folder.itemCount + (folder.itemCount === 1 ? ' item' : ' items');
        heading.append(title, count);
        root.appendChild(heading);

        const tree = renderDriveTree(folder.items, 0);
        if (tree.childElementCount) {
            root.appendChild(tree);
        } else {
            const empty = document.createElement('p');
            empty.className = 'student-folder-empty';
            empty.textContent = 'This private folder is currently empty.';
            root.appendChild(empty);
        }
        documentNav.appendChild(root);
    }

    function renderDriveTree(items, depth) {
        const list = document.createElement('ul');
        list.className = 'student-folder-tree';
        if (depth > 0) list.classList.add('student-folder-tree-nested');
        if (depth > 5) return list;

        (Array.isArray(items) ? items : []).filter(isPlainObject).forEach(function (item) {
            const name = cleanText(item.name) || 'Private folder item';
            const row = document.createElement('li');

            if (item.type === 'folder') {
                const details = document.createElement('details');
                details.className = 'student-folder-group';
                details.open = depth === 0;
                const summary = document.createElement('summary');
                const label = document.createElement('span');
                const type = document.createElement('span');
                label.textContent = name;
                type.textContent = 'Folder';
                summary.append(label, type);
                details.appendChild(summary);

                const children = renderDriveTree(item.children, depth + 1);
                if (children.childElementCount) {
                    details.appendChild(children);
                } else {
                    const empty = document.createElement('p');
                    empty.className = 'student-folder-empty student-folder-empty-nested';
                    empty.textContent = item.truncated ? 'More items are not shown.' : 'Folder is empty.';
                    details.appendChild(empty);
                }
                row.appendChild(details);
            } else {
                const id = cleanText(item.id);
                row.appendChild(createFileRow({
                    id,
                    title: name,
                    mimeType: cleanText(item.mimeType),
                    previewable: Boolean(item.previewable) && FOLDER_DOCUMENT_PATTERN.test(id),
                    viewable: Boolean(item.viewable) && FOLDER_DOCUMENT_PATTERN.test(id),
                    downloadable: Boolean(item.downloadable) && FOLDER_DOCUMENT_PATTERN.test(id),
                }));
            }
            list.appendChild(row);
        });
        return list;
    }

    function createDocumentButton(documentRecord) {
        documentsById.set(documentRecord.id, documentRecord);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'student-document-button student-file-action';
        button.dataset.documentId = documentRecord.id;
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-controls', 'studentDocumentViewer');
        button.setAttribute('aria-label', 'View ' + documentRecord.title);
        button.textContent = 'View';
        return button;
    }

    function createFileRow(documentRecord) {
        const file = document.createElement('div');
        file.className = 'student-folder-file';

        const information = document.createElement('div');
        information.className = 'student-folder-file-information';
        const label = document.createElement('span');
        const type = document.createElement('span');
        label.textContent = documentRecord.title;
        type.textContent = formatMimeType(documentRecord.mimeType);
        information.append(label, type);

        const actions = document.createElement('div');
        actions.className = 'student-folder-file-actions';
        if (documentRecord.previewable) {
            actions.appendChild(createDocumentButton(documentRecord));
        } else if (documentRecord.viewable) {
            actions.appendChild(createFileLink(documentRecord, 'view'));
        }
        if (documentRecord.downloadable) {
            actions.appendChild(createFileLink(documentRecord, 'download'));
        }
        if (!actions.childElementCount) {
            const unavailable = document.createElement('span');
            unavailable.className = 'student-file-unavailable';
            unavailable.textContent = 'Unavailable';
            actions.appendChild(unavailable);
        }

        file.append(information, actions);
        return file;
    }

    function createFileLink(documentRecord, mode) {
        const link = document.createElement('a');
        link.className = 'student-file-action';
        link.href = '/api/student-document?id=' + encodeURIComponent(documentRecord.id) + '&mode=' + mode;
        link.textContent = mode === 'download' ? 'Download' : 'View';
        link.setAttribute('aria-label', link.textContent + ' ' + documentRecord.title);
        if (mode === 'view') {
            link.target = '_blank';
            link.rel = 'noopener';
        } else {
            link.setAttribute('download', '');
        }
        return link;
    }

    function handleDocumentSelection(event) {
        const button = event.target.closest('.student-document-button');
        if (!button || !documentNav.contains(button)) return;

        const selectedDocument = documentsById.get(button.dataset.documentId || '');
        if (selectedDocument) selectDocument(selectedDocument);
    }

    function selectDocument(documentRecord) {
        activeDocumentId = documentRecord.id;
        documentRequestNumber += 1;
        const requestNumber = documentRequestNumber;

        documentNav.querySelectorAll('.student-document-button').forEach(function (button) {
            button.setAttribute('aria-pressed', String(button.dataset.documentId === activeDocumentId));
        });

        documentViewer.setAttribute('aria-busy', 'true');
        documentImage.hidden = true;
        documentImage.alt = '';
        documentImage.onload = null;
        documentImage.onerror = null;
        documentImage.removeAttribute('src');
        documentPlaceholder.hidden = false;
        documentPlaceholder.textContent = 'Loading “' + documentRecord.title + '”…';
        setDocumentStatus('', '');

        documentImage.onload = function () {
            if (requestNumber !== documentRequestNumber || activeDocumentId !== documentRecord.id) return;
            documentImage.alt = documentRecord.title + '. Private student document.';
            documentImage.hidden = false;
            documentPlaceholder.hidden = true;
            documentViewer.setAttribute('aria-busy', 'false');
            setDocumentStatus(documentRecord.title + ' is ready to view.', '');
        };

        documentImage.onerror = function () {
            if (requestNumber !== documentRequestNumber || activeDocumentId !== documentRecord.id) return;
            documentImage.hidden = true;
            documentImage.removeAttribute('src');
            documentPlaceholder.hidden = true;
            documentViewer.setAttribute('aria-busy', 'false');
            setDocumentStatus('This document could not be displayed. Please try again later.', 'error');
        };

        documentImage.draggable = false;
        documentImage.src = '/api/student-document?id=' + encodeURIComponent(documentRecord.id) + '&mode=view';
    }

    async function clearRevokedSession() {
        try {
            await requestJson('/api/student-auth', {
                method: 'DELETE',
                headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
            });
        } catch {
            // The account and document APIs still deny inactive students.
        }
        currentSessionEmail = '';
        csrfToken = '';
        lastAccountRefreshAt = 0;
    }

    function clearAccountData() {
        Object.keys(studentFields).forEach(function (key) {
            if (key === 'renewalStatus') {
                studentFields[key].textContent = 'Not available';
                studentFields[key].dataset.state = 'unknown';
            } else if (key === 'renewalDueDate') {
                studentFields[key].textContent = 'Not scheduled';
            } else if (key === 'renewalDate') {
                studentFields[key].textContent = 'Not recorded';
            } else {
                studentFields[key].textContent = 'Not available';
            }
        });

        enrollmentList.replaceChildren();
        enrollmentCount.textContent = '0';
        enrollmentCount.setAttribute('aria-label', '0 class enrollments');
        enrollmentEmpty.hidden = false;
        clearDocuments();
        documentEmpty.hidden = false;
        sessionEmail.textContent = '';
        accountTitle.textContent = 'Your training record';
        setStatus(accountStatus, '');
    }

    function toggleLoginPassword() {
        const shouldShow = loginPassword.type === 'password';
        loginPassword.type = shouldShow ? 'text' : 'password';
        loginPasswordToggle.textContent = shouldShow ? 'Hide' : 'Show';
        loginPasswordToggle.setAttribute('aria-pressed', String(shouldShow));
        loginPassword.focus();
    }

    function clearDocuments() {
        documentsById.clear();
        activeDocumentId = '';
        documentRequestNumber += 1;
        documentNav.replaceChildren();
        documentSync.textContent = '';
        documentSync.removeAttribute('data-checked-at');
        documentSync.hidden = true;
        documentWorkspace.hidden = true;
        documentWorkspace.classList.remove('folder-only');
        documentNav.hidden = false;
        documentViewer.hidden = false;
        documentImage.onload = null;
        documentImage.onerror = null;
        documentImage.hidden = true;
        documentImage.alt = '';
        documentImage.removeAttribute('src');
        documentPlaceholder.hidden = false;
        documentPlaceholder.textContent = 'Select a document to view it here.';
        documentViewer.setAttribute('aria-busy', 'false');
        setDocumentStatus('', '');
    }

    function showLoading(message) {
        loadingMessage.textContent = message;
        loadingView.hidden = false;
        loginView.hidden = true;
        resetRequestView.hidden = true;
        passwordUpdateView.hidden = true;
        registrationView.hidden = true;
        accountView.hidden = true;
        portalShell.setAttribute('aria-busy', 'true');
    }

    function showLogin(message, shouldFocus, type) {
        loadingView.hidden = true;
        accountView.hidden = true;
        resetRequestView.hidden = true;
        passwordUpdateView.hidden = true;
        registrationView.hidden = true;
        loginView.hidden = false;
        loginPassword.type = 'password';
        loginPasswordToggle.textContent = 'Show';
        loginPasswordToggle.setAttribute('aria-pressed', 'false');
        portalShell.setAttribute('aria-busy', 'false');
        setStatus(loginStatus, message, type);

        if (shouldFocus) loginTitle.focus();
    }

    function showResetRequest(shouldFocus) {
        loadingView.hidden = true;
        loginView.hidden = true;
        accountView.hidden = true;
        registrationView.hidden = true;
        passwordUpdateView.hidden = true;
        resetRequestView.hidden = false;
        portalShell.setAttribute('aria-busy', 'false');
        setStatus(resetRequestStatus, '');
        if (loginEmail.value) resetEmail.value = loginEmail.value;
        if (shouldFocus) resetRequestTitle.focus();
    }

    function showPasswordUpdate(shouldFocus) {
        loadingView.hidden = true;
        loginView.hidden = true;
        accountView.hidden = true;
        registrationView.hidden = true;
        resetRequestView.hidden = true;
        passwordUpdateView.hidden = false;
        portalShell.setAttribute('aria-busy', 'false');
        setStatus(passwordUpdateStatus, '');
        if (shouldFocus) passwordUpdateTitle.focus();
    }

    function showRegistration(shouldFocus) {
        loadingView.hidden = true;
        loginView.hidden = true;
        accountView.hidden = true;
        resetRequestView.hidden = true;
        passwordUpdateView.hidden = true;
        registrationView.hidden = false;
        portalShell.setAttribute('aria-busy', 'false');
        setStatus(registrationStatus, '');

        if (shouldFocus) registrationTitle.focus();
    }

    function showAccount(shouldFocus) {
        loadingView.hidden = true;
        loginView.hidden = true;
        registrationView.hidden = true;
        resetRequestView.hidden = true;
        passwordUpdateView.hidden = true;
        accountView.hidden = false;
        portalShell.setAttribute('aria-busy', 'false');
        sessionEmail.textContent = currentSessionEmail;

        if (shouldFocus) accountTitle.focus();
    }

    async function requestJson(url, options) {
        const response = await fetch(url, Object.assign({
            credentials: 'same-origin',
            cache: 'no-store',
        }, options || {}));
        let data = {};

        try {
            data = await response.json();
        } catch (error) {
            data = {};
        }

        return { response, data };
    }

    function setFieldValue(element, value) {
        element.textContent = cleanText(value) || 'Not available';
    }

    function setButtonBusy(button, isBusy, label) {
        button.disabled = isBusy;
        button.textContent = label;
        button.setAttribute('aria-busy', String(isBusy));
    }

    function setStatus(element, message, type) {
        element.textContent = message || '';
        element.classList.remove('error', 'success');
        if (type) element.classList.add(type);
    }

    function setDocumentStatus(message, type) {
        documentStatus.textContent = message || '';
        documentStatus.classList.remove('error');
        if (type === 'error') documentStatus.classList.add('error');
    }

    function cleanText(value) {
        return typeof value === 'string' ? value.trim() : '';
    }

    function isPlainObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    function normaliseState(value) {
        return cleanText(value)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    function formatStatus(value, fallback) {
        const state = normaliseState(value);
        if (!state) return fallback;

        return state.split('-').map(function (word) {
            return word.charAt(0).toUpperCase() + word.slice(1);
        }).join(' ');
    }

    function getRenewalState(state) {
        if (state === 'active' || state === 'current' || state === 'renewed') return 'active';
        if (state === 'due-soon' || state === 'due' || state === 'expiring-soon') return 'due-soon';
        if (state === 'pending' || state === 'under-review') return 'pending';
        if (state === 'expired' || state === 'overdue' || state === 'inactive') return 'expired';
        return 'unknown';
    }

    function getEnrollmentState(state) {
        const allowedStates = new Set(['active', 'enrolled', 'completed', 'pending', 'cancelled', 'withdrawn']);
        return allowedStates.has(state) ? state : 'unknown';
    }

    function formatDate(value, fallback) {
        const text = cleanText(value);
        if (!text) return fallback;

        let date;
        const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
        if (dateOnlyMatch) {
            date = new Date(
                Number(dateOnlyMatch[1]),
                Number(dateOnlyMatch[2]) - 1,
                Number(dateOnlyMatch[3])
            );
        } else {
            date = new Date(text);
        }

        return Number.isNaN(date.getTime()) ? fallback : dateFormatter.format(date);
    }

    function formatMimeType(value) {
        const mimeType = cleanText(value).toLowerCase();
        const labels = {
            'application/pdf': 'PDF document',
            'application/vnd.google-apps.document': 'Google document',
            'application/vnd.google-apps.spreadsheet': 'Google spreadsheet',
            'application/vnd.google-apps.presentation': 'Google presentation',
            'application/vnd.google-apps.form': 'Google form',
            'application/vnd.google-apps.shortcut': 'Drive shortcut',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel workbook',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint presentation',
            'text/plain': 'Text file',
            'application/zip': 'ZIP archive',
            'image/jpeg': 'JPEG image',
            'image/png': 'PNG image',
            'image/webp': 'WebP image',
        };
        return labels[mimeType] || 'Private file';
    }
})();
