-- Create a pending student profile whenever the public student signup flow
-- creates a Supabase Auth user. Access remains inactive until an admin approves it.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.create_pending_student_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    full_name_value text;
    course_code_value text;
    course_name_value text;
    student_id_value uuid;
begin
    if coalesce(new.raw_user_meta_data ->> 'account_type', '') <> 'student' then
        return new;
    end if;

    full_name_value := left(
        btrim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'full_name', ''), '\s+', ' ', 'g')),
        120
    );
    if char_length(full_name_value) < 2 or new.email is null then
        raise exception 'Student signup profile is incomplete.';
    end if;

    course_code_value := coalesce(new.raw_user_meta_data ->> 'requested_course_code', '');
    course_name_value := case course_code_value
        when '6010' then 'Medical Gas Installer/Brazer Piping Installers'
        when '6020' then 'Medical Gas Inspectors'
        when '6040' then 'Medical Gas Maintenance Personnel'
        when 'recertification-6010' then 'ASSE 6010 Recertification'
        when 'recertification-6020' then 'ASSE 6020 Recertification'
        when 'recertification-6040' then 'ASSE 6040 Recertification'
        else null
    end;

    insert into public.students (
        auth_user_id,
        student_number,
        full_name,
        email,
        renewal_status,
        portal_active
    )
    values (
        new.id,
        'PENDING-' || upper(substr(replace(new.id::text, '-', ''), 1, 12)),
        full_name_value,
        lower(new.email),
        'pending',
        false
    )
    on conflict (auth_user_id) do nothing
    returning id into student_id_value;

    if student_id_value is null then
        select student.id
        into student_id_value
        from public.students as student
        where student.auth_user_id = new.id;
    end if;

    if course_name_value is not null and student_id_value is not null then
        insert into public.student_enrollments (
            student_id,
            course_code,
            course_name,
            class_session,
            enrollment_status
        )
        values (
            student_id_value,
            course_code_value,
            course_name_value,
            'Schedule pending',
            'pending'
        )
        on conflict (student_id, course_code, class_session) do nothing;
    end if;

    return new;
end;
$$;

revoke all on function private.create_pending_student_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_student_profile on auth.users;
create trigger on_auth_user_created_student_profile
after insert on auth.users
for each row execute function private.create_pending_student_profile();

grant update (portal_active, updated_at) on table public.students to authenticated;

drop policy if exists "Admins update student portal access" on public.students;
create policy "Admins update student portal access"
on public.students
for update
to authenticated
using (
    exists (
        select 1
        from public.portal_admins as admin
        where admin.user_id = (select auth.uid())
    )
)
with check (
    exists (
        select 1
        from public.portal_admins as admin
        where admin.user_id = (select auth.uid())
    )
);

grant insert (
    student_id,
    title,
    google_drive_file_id,
    mime_type,
    display_order
) on table public.student_documents to authenticated;

drop policy if exists "Admins add student documents" on public.student_documents;
create policy "Admins add student documents"
on public.student_documents
for insert
to authenticated
with check (
    exists (
        select 1
        from public.portal_admins as admin
        where admin.user_id = (select auth.uid())
    )
);

drop policy if exists "Admins read all student document metadata" on public.student_documents;
create policy "Admins read all student document metadata"
on public.student_documents
for select
to authenticated
using (
    exists (
        select 1
        from public.portal_admins as admin
        where admin.user_id = (select auth.uid())
    )
);

-- Keep a single SELECT policy for authenticated users. This lets active
-- students read only their own metadata while admins can read the roster.
drop policy if exists "Students read only their own document metadata" on public.student_documents;
drop policy if exists "Admins read all student document metadata" on public.student_documents;
drop policy if exists "Authorized users read student document metadata" on public.student_documents;

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
