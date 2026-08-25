-- Let the server query a signed-in student's own private Drive mapping through
-- RLS. The server strips the Drive identifiers before returning portal data.

grant select (google_drive_folder_id)
on table public.student_drive_folders
to authenticated;

grant select (google_drive_file_id)
on table public.student_documents
to authenticated;

create policy "Students read their own Drive folder"
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
);
