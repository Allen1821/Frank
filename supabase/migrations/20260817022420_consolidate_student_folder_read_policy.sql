-- Keep one SELECT policy so Postgres evaluates one ownership-or-admin check
-- for each student Drive folder row.

drop policy if exists "Admins read student folder metadata"
on public.student_drive_folders;

drop policy if exists "Students read their own Drive folder"
on public.student_drive_folders;

create policy "Authorized users read student Drive folder"
on public.student_drive_folders
for select
to authenticated
using (
    exists (
        select 1
        from public.students as student
        where student.id = student_drive_folders.student_id
          and student.portal_active
          and student.auth_user_id = (select auth.uid())
    )
    or exists (
        select 1
        from public.portal_admins as admin
        where admin.user_id = (select auth.uid())
    )
);
