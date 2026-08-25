-- DARPA Solutions student portal.
-- Auth users are provisioned in Supabase Auth, then linked to one student row.

create table public.portal_admins (
    user_id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

create table public.students (
    id uuid primary key default gen_random_uuid(),
    auth_user_id uuid not null unique references auth.users(id) on delete cascade,
    student_number text not null unique check (char_length(student_number) between 2 and 40),
    full_name text not null check (char_length(full_name) between 2 and 120),
    email text not null check (
        email = lower(email)
        and char_length(email) between 3 and 254
        and position('@' in email) > 1
    ),
    phone text check (phone is null or char_length(phone) between 7 and 30),
    certification_number text check (
        certification_number is null
        or char_length(certification_number) between 2 and 80
    ),
    renewal_status text not null default 'pending' check (
        renewal_status in ('active', 'due_soon', 'expired', 'pending')
    ),
    renewal_due_date date,
    portal_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.student_enrollments (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.students(id) on delete cascade,
    course_code text not null check (char_length(course_code) between 2 and 40),
    course_name text not null check (char_length(course_name) between 2 and 160),
    class_session text not null check (char_length(class_session) between 2 and 160),
    enrollment_status text not null default 'enrolled' check (
        enrollment_status in ('enrolled', 'completed', 'cancelled', 'pending')
    ),
    enrolled_at timestamptz not null default now(),
    unique (student_id, course_code, class_session)
);

create table public.student_documents (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.students(id) on delete cascade,
    title text not null check (char_length(title) between 2 and 120),
    google_drive_file_id text not null unique check (
        google_drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$'
    ),
    mime_type text not null check (
        mime_type in ('image/jpeg', 'image/png', 'image/webp')
    ),
    display_order integer not null default 0 check (display_order between 0 and 10000),
    created_at timestamptz not null default now()
);

create index students_auth_user_id_idx on public.students (auth_user_id);
create index students_email_idx on public.students (email);
create index student_enrollments_student_id_idx on public.student_enrollments (student_id);
create index student_enrollments_course_code_idx on public.student_enrollments (course_code);
create index student_documents_student_id_idx on public.student_documents (student_id);

alter table public.portal_admins enable row level security;
alter table public.students enable row level security;
alter table public.student_enrollments enable row level security;
alter table public.student_documents enable row level security;

revoke all on table public.portal_admins from anon, authenticated;
revoke all on table public.students from anon, authenticated;
revoke all on table public.student_enrollments from anon, authenticated;
revoke all on table public.student_documents from anon, authenticated;

grant select on table public.portal_admins to authenticated;
grant select on table public.students to authenticated;
grant select on table public.student_enrollments to authenticated;
grant select (
    id,
    student_id,
    title,
    mime_type,
    display_order,
    created_at
) on table public.student_documents to authenticated;

create policy "Admins can read their portal assignment"
on public.portal_admins
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Students read their own profile and admins read all profiles"
on public.students
for select
to authenticated
using (
    (portal_active and auth_user_id = (select auth.uid()))
    or exists (
        select 1
        from public.portal_admins as admin
        where admin.user_id = (select auth.uid())
    )
);

create policy "Students read their own enrollments and admins read all enrollments"
on public.student_enrollments
for select
to authenticated
using (
    exists (
        select 1
        from public.students as student
        where student.id = student_enrollments.student_id
    )
);

create policy "Students read only their own document metadata"
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
);
