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
the API/UI. This adds DELETE permission and an admin-only RLS policy solely for
`student_drive_folders`. It has not been applied as part of code preparation.
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
