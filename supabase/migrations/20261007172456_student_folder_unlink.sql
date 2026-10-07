-- Removes only portal-to-folder mappings. No student or Drive data is changed.
-- Preserve each environment's existing folder-write authorization exactly:
-- production currently uses admin membership; staging additionally uses roles/MFA.
begin;

do $migration$
declare
    write_policy record;
    write_policy_count integer;
begin
    if not exists (
        select 1 from pg_class
        where oid = 'public.student_drive_folders'::regclass and relrowsecurity
    ) then
        raise exception 'Folder RLS must be enabled before granting unlink permission';
    end if;

    select count(*) into write_policy_count
    from pg_policies
    where schemaname = 'public' and tablename = 'student_drive_folders'
      and cmd in ('UPDATE', 'ALL');

    if write_policy_count <> 1 then
        raise exception 'Expected exactly one folder UPDATE policy; review authorization before unlink migration';
    end if;

    select * into write_policy
    from pg_policies
    where schemaname = 'public' and tablename = 'student_drive_folders'
      and cmd in ('UPDATE', 'ALL');

    -- Do not guess how multiple, restrictive, ALL, or differing old/new-row
    -- policies should compose. Stop for review rather than broadening access.
    if write_policy.cmd <> 'UPDATE'
       or write_policy.permissive <> 'PERMISSIVE'
       or write_policy.roles <> array['authenticated']::name[]
       or write_policy.qual is null
       or write_policy.with_check is distinct from write_policy.qual then
        raise exception 'Unexpected folder write policy; review authorization before unlink migration';
    end if;

    if exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'student_drive_folders'
          and cmd in ('DELETE', 'ALL')
    ) then
        raise exception 'Folder DELETE policy already exists; review before changing permissions';
    end if;

    -- This expression comes from the trusted Postgres policy catalog, not a
    -- request or user-supplied value. Copying it retains existing role/MFA checks.
    execute format(
        'create policy %I on public.student_drive_folders for delete to authenticated using (%s)',
        'Admins unlink student folders', write_policy.qual
    );
end
$migration$;

grant delete on table public.student_drive_folders to authenticated;
commit;
