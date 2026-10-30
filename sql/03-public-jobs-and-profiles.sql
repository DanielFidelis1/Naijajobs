-- =====================================================================
-- NaijaJobs  |  Step 3: Public job pages + public profile stats
-- Run in the Supabase dashboard: SQL Editor > New query > paste > Run
-- Run 01-reviews.sql first.
-- =====================================================================

-- 1) People who are not logged in can see OPEN jobs (so a shared WhatsApp
--    link works for everyone). In-progress and completed jobs stay private.
drop policy if exists "Anyone can view open jobs" on public.jobs;
create policy "Anyone can view open jobs"
    on public.jobs for select
    to anon
    using (status = 'open');

grant select on public.jobs to anon;

-- 2) Ratings are only for signed-in people. Without this line a visitor
--    would see a misleading "No reviews yet" on every client.
revoke all on public.profile_ratings from anon;

-- 3) "Jobs completed" shown on public profiles. This view only exposes two
--    counts per person (never any private details), so it is safe to read.
create or replace view public.profile_stats as
select
    p.id as user_id,
    (select count(*)
       from public.applications a
       join public.jobs j on j.id = a.job_id
      where a.user_id = p.id
        and a.status = 'accepted'
        and j.status = 'completed')::int as jobs_done_as_worker,
    (select count(*)
       from public.jobs j
      where j.user_id = p.id
        and j.status = 'completed')::int as jobs_done_as_client
from public.profiles p;

revoke all on public.profile_stats from anon;
grant select on public.profile_stats to authenticated;
