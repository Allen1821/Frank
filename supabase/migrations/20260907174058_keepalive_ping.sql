-- A scheduled GitHub Action reads this single, non-sensitive row to generate
-- regular user database activity for the Supabase Free Plan project.

create table public.keepalive (
    id smallint primary key check (id = 1)
);

insert into public.keepalive (id) values (1);

alter table public.keepalive enable row level security;

-- Explicit grants are required because new projects may not expose tables to
-- the Data API automatically. Keep the public role strictly read-only.
revoke all on table public.keepalive from anon, authenticated;
grant select on table public.keepalive to anon, authenticated;

create policy "Read the keepalive row"
on public.keepalive
for select
to anon, authenticated
using (id = 1);
