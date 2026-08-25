# Student Portal Setup

The website now uses Supabase Auth for student email/password login, Postgres RLS for record isolation, and a Google service account for private student files. Students do not need Google accounts.

## 1. Apply the database migration

The migrations in `supabase/migrations/` were applied to the connected Frank Supabase project on August 16–17, 2026. They create the student tables, row-level security, self-registration trigger, admin approval rules, and private-document mapping rules. Apply them in filename order only when setting up another Supabase project.

Every table has RLS enabled. anon receives no access. Authenticated users receive only the minimum required access, and policies limit a student to their own active account. The website uses the student JWT only on the server and removes Drive identifiers before responding to the browser.

## 2. Configure server-only environment variables

Add the values from .env.example to the Vercel project. Do not paste any of them into HTML, CSS, browser JavaScript, GitHub, or screenshots.

Use a current Supabase publishable key (sb_publishable_...). The application temporarily supports the legacy SUPABASE_ANON_KEY for user-scoped calls. The Drive folder proxy uses the signed-in student's server-held session with RLS, so it does not require a Supabase secret key.

Set APP_ORIGIN to the production site origin, for example https://example.com, with no trailing path.

## 3. Authorize the existing admin

The admin must exist in Supabase Auth and in the server-side ADMIN_EMAILS allowlist. Run this once in the Supabase SQL editor, replacing the placeholder:

    insert into public.portal_admins (user_id)
    select id
    from auth.users
    where lower(email) = lower('admin@example.com')
    on conflict (user_id) do nothing;

This second database allowlist lets /api/admin-students read all profiles and enrollments through RLS.

## 4. Student self-registration and admin review

The standalone `/student-portal/` page includes Create account. A student provides a name, email, password, and class. Supabase Auth creates the login, while the database trigger in `20260817011207_student_self_registration_and_admin_documents.sql` creates an inactive student profile and a pending class enrollment.

Frank opens `/admin/` and selects the Students tab. New accounts appear under Waiting for review. Frank selects Manage, verifies the request, and chooses Activate portal access. Until that approval, login returns a pending-access message and no private student record is returned.

Supabase's default email service has a low sending limit intended for testing. Configure custom SMTP and the production Site URL before opening registration publicly. A rate-limited signup returns HTTP 429 and does not create a partial student record.

### Secure password reset

The sign-in screen includes **Forgot your password?**. The reset request always returns the same message whether or not the email exists, which prevents account discovery. Supabase sends the recovery email; the portal verifies the recovery token, removes it from the browser address immediately, and stores it only in a short-lived HttpOnly cookie. The recovery session expires after 10 minutes and uses a separate CSRF token. After a successful password change, the portal requests a global Supabase sign-out and clears all local student cookies.

In Supabase Dashboard → Authentication → URL Configuration:

1. Set the production Site URL.
2. Add `https://your-production-domain/student-portal/**` to Redirect URLs.
3. Add `http://localhost:3000/student-portal/**` only while testing locally.

Set `APP_ORIGIN` to the production origin. Production password-recovery email requires custom SMTP (or a Supabase Auth send-email hook); Supabase's default mail service is restricted and intended only for testing.

### Admin student notifications

Admin → Students includes a notification composer for one active student or all active students. Pending and deactivated accounts are excluded. The server reads recipients through the signed-in admin's RLS-authorized Supabase session, validates and deduplicates addresses, and uses Resend Batch in groups of at most 100. Every recipient gets a separate message, so student email addresses are never exposed to one another.

Configure these server-only variables:

- `RESEND_API_KEY`
- `STUDENT_NOTIFICATION_FROM` using a verified Resend domain, for example `DARPA SOLUTIONS LLC <contact@darpasolutionsllc.net>`
- `STUDENT_NOTIFICATION_REPLY_TO`, normally Frank's monitored business email

The composer is for operational student notices, not marketing campaigns. Resend account sending limits still apply.

### Create a student manually for testing

If Frank wants to provision a test account instead of using the registration form, create the student in Supabase Dashboard → Authentication → Users with an email and temporary password.

Then link that Auth user to a portal record:

    with new_student as (
      insert into public.students (
        auth_user_id,
        student_number,
        full_name,
        email,
        phone,
        certification_number,
        renewal_status,
        renewal_due_date
      )
      select
        id,
        'STU-1001',
        'Test Student',
        lower(email),
        '(555) 555-0100',
        'ASSE-6010-1001',
        'active',
        date '2027-08-01'
      from auth.users
      where lower(email) = lower('student@example.com')
      returning id
    )
    insert into public.student_enrollments (
      student_id,
      course_code,
      course_name,
      class_session,
      enrollment_status
    )
    select
      id,
      'ASSE 6010',
      'Medical Gas Systems Installer',
      'August 3–5, 2026',
      'enrolled'
    from new_student;

The student can now log in at the standalone `/student-portal/` page. The public Students page links there, while the admin Students view shows total students, distinct students per class session, renewal and expiration dates, and portal-access state. Frank can edit renewal information and deactivate or restore portal access. Deactivation blocks account and file requests immediately, and an open student portal checks access every 15 seconds.

## 5. Connect a private Google Drive folder

The current implementation maps one restricted folder to one student. The portal shows the folder, nested subfolders, and file names as a read-only hierarchy. Files can be viewed or downloaded through the authorized website proxy.

### A. Create the website's private Drive identity

1. In Google Cloud Console, create or select the DARPA website project.
2. Enable the Google Drive API for that project.
3. Open IAM & Admin → Service Accounts and create a service account such as `student-records`.
4. Open that service account → Keys → Add key → Create new key → JSON. Google offers this JSON download only once.
5. Read `client_email` from the downloaded JSON and set it as `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
6. Read `private_key` and set it as `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. Keep its `\n` newlines exactly as shown in `.env.example`.

For local testing, keep the downloaded JSON outside the repository and set `GOOGLE_SERVICE_ACCOUNT_JSON_PATH` in `.env.local` to its absolute path. This avoids copying the private key. Restart `npm run dev` after changing the environment. For the deployed website, Vercel cannot read a file from your computer, so add `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` as encrypted Vercel environment variables and redeploy. Never paste the JSON key into a webpage, browser JavaScript, Supabase, GitHub, chat, or a screenshot.

### B. Share one student's folder

1. In Frank's Google Drive, create a folder such as `Students / STU-DEMO-001 - Demo Student`.
2. Open Share and add the exact service-account email from `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
3. Give it **Viewer** access.
4. Keep General access set to **Restricted**. Never select “Anyone with the link.” The student is not added to Drive and does not need a Google account.
5. Add the student's files and subfolders. All file names are shown in the folder browser. Browser-supported files can be opened, approved files can be downloaded, and JPEG, PNG, and WebP files under 12 MB also receive an inline preview. Google Docs, Sheets, Slides, and Drawings are exported to standard Office or PDF formats when opened or downloaded.

### C. Connect the folder to one student

Open the restricted folder in Drive and copy its folder URL. Open Admin → Students, choose Manage for the student, paste the URL under Connect a private Drive folder, and submit. The server verifies that the service account can read the folder before storing the private mapping.

After the folder is connected, the secure folder hierarchy appears in the portal automatically, including an empty-folder state. While the portal is open, it rechecks Google Drive every minute and also refreshes when the student returns to the tab. The server rechecks the signed-in student's ownership for every view or download, reads a bounded folder tree, and returns only names, file types, hierarchy, and opaque session-bound tokens. The browser never receives a Google credential, Drive file ID, folder ID, or public share URL.

Files are streamed through the authorized endpoint and limited to 25 MB per view or download. Streaming avoids Vercel's ordinary buffered-response limit without exposing a public Drive URL. Unsupported Google-native file types remain listed without an action.

## 6. Verification checklist

- A logged-out request to /api/student-account returns 401 and no student data.
- Student A cannot query Student B's profile, enrollment, document metadata, or image UUID.
- An Auth user without an active students row cannot enter the portal.
- An admin absent from portal_admins cannot load the roster.
- Logout clears access, refresh, and CSRF cookies.
- Password reset gives the same response for known and unknown email addresses.
- Recovery tokens never appear in localStorage, sessionStorage, logs, or committed files.
- A deactivated or pending student is excluded from admin bulk notifications.
- Bulk notifications send one private email per recipient rather than exposing a recipient list.
- Google files are private and shared only to the service account.
- No private key, access token, refresh token, or Google credential appears in static files or Git history.
- Enable Supabase Auth leaked-password protection before production launch.
