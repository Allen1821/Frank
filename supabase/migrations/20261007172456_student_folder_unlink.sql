-- Removes only the portal-to-folder mapping. No Drive files, sharing settings,
-- student accounts, enrollments, or individually connected documents change.
-- Review and apply separately before releasing the unlink UI/API.
begin;

grant delete on table public.student_drive_folders to authenticated;

create policy "Admins unlink student folders"
on public.student_drive_folders
for delete
to authenticated
using (
    exists (
        select 1
        from public.portal_admins as admin
        where admin.user_id = (select auth.uid())
    )
);

commit;
