-- Track when a certification was renewed and distinguish deactivated portal
-- accounts from new accounts that are still waiting for review.

alter table public.students
add column renewal_date date,
add column portal_deactivated_at timestamptz,
add constraint students_renewal_date_order
check (
    renewal_date is null
    or renewal_due_date is null
    or renewal_due_date >= renewal_date
);

grant update (
    renewal_status,
    renewal_date,
    renewal_due_date,
    portal_deactivated_at
) on table public.students to authenticated;
