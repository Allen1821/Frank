-- One restricted Google Drive folder may be connected to each student.
-- The folder identifier is deliberately excluded from authenticated SELECT
-- privileges so it can only be used by trusted server-side code.

create table public.student_drive_folders (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null unique references public.students(id) on delete cascade,
    title text not null default 'Student Records' check (char_length(title) between 2 and 120),
    google_drive_folder_id text not null unique check (
        google_drive_folder_id ~ '^[A-Za-z0-9_-]{10,200}$'
    ),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.student_drive_folders enable row level security;

revoke all on table public.student_drive_folders from anon, authenticated;
grant select (
    id,
    student_id,
    title,
    created_at,
    updated_at
) on table public.student_drive_folders to authenticated;
grant insert (
    student_id,
    title,
    google_drive_folder_id,
    updated_at
) on table public.student_drive_folders to authenticated;
grant update (
    title,
    google_drive_folder_id,
    updated_at
) on table public.student_drive_folders to authenticated;

-- New Supabase projects no longer expose public tables automatically. The
-- server-only secret key maps to service_role and needs an explicit grant.
grant select, insert, update, delete on table public.student_drive_folders to service_role;

create policy "Admins read student folder metadata"
on public.student_drive_folders
for select
to authenticated
using (
    exists (
        select 1
        from public.portal_admins as admin
        where admin.user_id = (select auth.uid())
    )
);

create policy "Admins connect student folders"
on public.student_drive_folders
for insert
to authenticated
with check (
    exists (
        select 1
        from public.portal_admins as admin
        where admin.user_id = (select auth.uid())
    )
);

create policy "Admins update student folders"
on public.student_drive_folders
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
