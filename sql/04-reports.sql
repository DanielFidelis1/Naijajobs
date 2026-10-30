-- =====================================================================
-- NaijaJobs  |  Step 4: Report a job or a person
-- Run in the Supabase dashboard: SQL Editor > New query > paste > Run
-- Needs your existing "admin_users" table (the one your admin page uses).
-- =====================================================================

-- Small helper: "is the person making this request an admin?"
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.reports (
    id          uuid primary key default gen_random_uuid(),
    reporter_id uuid not null references auth.users(id) on delete cascade,
    target_type text not null check (target_type in ('job', 'user')),
    target_id   text not null,
    reason      text not null check (reason in ('payment', 'fake', 'inappropriate', 'spam', 'other')),
    details     text check (details is null or char_length(details) <= 1000),
    status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
    created_at  timestamptz not null default now(),
    resolved_at timestamptz,

    -- the same person cannot report the same thing twice
    constraint one_report_per_target unique (reporter_id, target_type, target_id)
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;

-- Anyone signed in can file a report, as themselves, and it always starts "open".
drop policy if exists "File a report" on public.reports;
create policy "File a report"
    on public.reports for insert
    to authenticated
    with check (reporter_id = auth.uid() and status = 'open');

-- You can see your own reports; admins can see all of them.
drop policy if exists "Read reports" on public.reports;
create policy "Read reports"
    on public.reports for select
    to authenticated
    using (reporter_id = auth.uid() or public.is_admin());

-- Only admins can resolve or dismiss.
drop policy if exists "Admins update reports" on public.reports;
create policy "Admins update reports"
    on public.reports for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

revoke all on public.reports from anon;
grant select, insert, update on public.reports to authenticated;
