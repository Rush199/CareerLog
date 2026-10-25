create table public.applications (
id uuid primary key default gen_random_uuid(),
user_id uuid not null references auth.users(id) on delete cascade,
company text not null check(length(trim(company)) between 1 and 120),
role text not null check(length(trim(role)) between 1 and 160),
status text not null default 'Applied' check(status in ('Applied','Interview','Offer','Rejected')),
applied_on date not null default current_date,
follow_up date,
notes text not null default '' check(length(notes)<=4000),
created_at timestamptz not null default now()
);
create index applications_owner_created on public.applications(user_id,created_at desc);
alter table public.applications enable row level security;
revoke all on public.applications from anon;
grant select,insert,update,delete on public.applications to authenticated;
create policy own_select on public.applications for select to authenticated using ((select auth.uid())=user_id);
create policy own_insert on public.applications for insert to authenticated with check ((select auth.uid())=user_id);
create policy own_update on public.applications for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy own_delete on public.applications for delete to authenticated using ((select auth.uid())=user_id);
