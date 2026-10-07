# Unlink a student folder

The admin inspector offers **Unlink folder** only when a folder is connected.
Confirmation removes only that student's `student_drive_folders` mapping. It
does not delete Drive files, change Drive sharing permissions, deactivate the
student, remove enrollments, or remove individually connected documents.

The DELETE endpoint uses the admin's authenticated session and requires a
same-origin JSON request with CSRF protection. The request includes the mapping
ID and exact `updatedAt` value shown to the admin. The database DELETE filters on
student ID, mapping ID, and timestamp together, preventing a stale confirmation
from deleting a subsequently replaced mapping. An already-absent mapping succeeds;
a changed mapping returns 409 and asks the admin to refresh.

## Release prerequisite

Review and separately authorize applying
`supabase/migrations/20261007172456_student_folder_unlink.sql` before releasing
the API/UI. This adds DELETE permission solely for `student_drive_folders`, copying its
existing authenticated UPDATE authorization predicate into the DELETE policy.
Production currently uses portal-admin membership. Staging additionally requires
owner/student_manager roles and MFA (aal2); those restrictions are preserved.
The migration fails closed if RLS is off, write policies are ambiguous, USING
and WITH CHECK differ, or DELETE authorization already exists. It does not
change the existing roles/MFA model or any other table permissions. It has not been applied as part of code preparation.
Verify the policy in an isolated Supabase environment: admins may unlink;
ordinary students and anonymous callers may not. No service-role bypass is used.

New requests for old folder-document URLs are denied once the mapping is gone.
Already downloaded files and streams authorized before unlink cannot be recalled.
Direct Google Drive sharing and separately connected documents retain their
independent access rules.

## Verification

`npm run check` includes fetch-mocked API/security tests and VM-based UI tests.
These do not replace a real-browser smoke test or live RLS verification. Before
release, confirm cancel/retry, switching students during a request, refresh,
logout, and browser Back/Forward in a staging account with synthetic records.

## Mobile confirmation and duplicate-folder warnings

Unlink opens an in-page confirmation with explicit Confirm unlink and Cancel
buttons, including full-width touch targets on small screens. It does not use
a browser-native confirmation popup. Cancel and Escape make no request; changing
the student, workspace, session, or mapping invalidates an open confirmation.

An authenticated admin whose connect attempt conflicts with another student's
folder sees that student's name and unique student number. Legacy records with
no student number use the account ID. This lookup uses the admin session and
existing row-level access, with no service-role bypass. Non-admin callers are
rejected before any owner lookup. Failed or ambiguous lookups keep a generic
conflict warning. The API never automatically unlinks or reassigns the owner.

`check-folder-conflict.js` covers these responses with mocked upstream reads.
UI tests verify owner text is rendered without HTML and late warnings are ignored
after navigation/session changes. No database migration is added by these fixes.
