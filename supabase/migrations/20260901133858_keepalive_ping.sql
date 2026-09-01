-- Free plan projects pause after about a week without activity.
-- A scheduled job reads this table so the database keeps answering queries.
-- The table holds one meaningless row, so a public read exposes nothing.

create table public.keepalive (
    id smallint primary key default 1 check (id = 1),
    created_at timestamptz not null default now()
);

insert into public.keepalive (id) values (1) on conflict (id) do nothing;

alter table public.keepalive enable row level security;

grant select on table public.keepalive to anon;
grant select on table public.keepalive to authenticated;

create policy "Anyone may read the keepalive row"
on public.keepalive
for select
to anon, authenticated
using (true);
