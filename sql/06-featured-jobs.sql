-- =====================================================================
-- NaijaJobs  |  Step 6: Paid featured jobs (database part)
-- Run in the Supabase dashboard: SQL Editor > New query > paste > Run
-- Then follow SETUP.md, section "Featured jobs", to deploy the payment check.
-- =====================================================================

-- A job is "featured" while this date is in the future.
alter table public.jobs add column if not exists featured_until timestamptz;

create index if not exists jobs_featured_idx
    on public.jobs (featured_until)
    where featured_until is not null;

-- Record of every successful payment. "reference" is unique, so the same
-- payment can never be used to feature a job twice.
create table if not exists public.payments (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    job_id      text not null,
    reference   text not null unique,
    amount_kobo integer not null,
    plan_days   integer not null,
    created_at  timestamptz not null default now()
);

alter table public.payments enable row level security;

drop policy if exists "Read own payments" on public.payments;
create policy "Read own payments"
    on public.payments for select
    to authenticated
    using (user_id = auth.uid());

-- No insert/update policies: only the payment-check function (which uses the
-- secret service key) can write here.
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

-- Stop people from giving themselves a free feature by editing the column
-- directly. Requests from the website run as "authenticated" or "anon" and
-- the value is forced back; the payment-check function runs as service_role
-- and is allowed to set it.
create or replace function public.protect_featured_until()
returns trigger
language plpgsql
as $$
begin
    if current_user in ('authenticated', 'anon') then
        if tg_op = 'INSERT' then
            new.featured_until := null;
        else
            new.featured_until := old.featured_until;
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_protect_featured_until on public.jobs;
create trigger trg_protect_featured_until
    before insert or update on public.jobs
    for each row execute function public.protect_featured_until();
