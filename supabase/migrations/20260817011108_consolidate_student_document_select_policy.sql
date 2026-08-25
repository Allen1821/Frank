drop policy if exists "Students read only their own document metadata" on public.student_documents;
drop policy if exists "Admins read all student document metadata" on public.student_documents;

create policy "Authorized users read student document metadata"
on public.student_documents
for select
to authenticated
using (
    exists (
        select 1
        from public.students as student
        where student.id = student_documents.student_id
          and student.portal_active
          and student.auth_user_id = (select auth.uid())
    )
    or exists (
        select 1
        from public.portal_admins as admin
        where admin.user_id = (select auth.uid())
    )
);
