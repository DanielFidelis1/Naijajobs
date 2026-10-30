-- =====================================================================
-- NaijaJobs  |  Step 1: Ratings and reviews
-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run
-- =====================================================================
--
-- BEFORE YOU RUN IT: check what type your jobs.id column is.
--
--   select data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'jobs' and column_name = 'id';
--
-- If the answer is "uuid", run this file exactly as it is.
-- If the answer is "bigint", change the line  job_id uuid  below to  job_id bigint.
--
-- ---------------------------------------------------------------------

create table if not exists public.reviews (
    id          uuid primary key default gen_random_uuid(),
    job_id      uuid not null references public.jobs(id) on delete cascade,
    reviewer_id uuid not null references auth.users(id) on delete cascade,
    reviewee_id uuid not null references auth.users(id) on delete cascade,
    rating      smallint not null check (rating between 1 and 5),
    comment     text check (comment is null or char_length(comment) <= 500),
    created_at  timestamptz not null default now(),

    -- one review per person per job
    constraint one_review_per_job unique (job_id, reviewer_id),
    -- you cannot review yourself
    constraint no_self_review check (reviewer_id <> reviewee_id)
);

create index if not exists reviews_reviewee_idx on public.reviews (reviewee_id);

-- ---------------------------------------------------------------------
-- Row Level Security: this is what makes fake reviews impossible.
-- ---------------------------------------------------------------------
alter table public.reviews enable row level security;

-- Anyone signed in can read reviews (reputation is public).
drop policy if exists "Signed-in users can read reviews" on public.reviews;
create policy "Signed-in users can read reviews"
    on public.reviews for select
    to authenticated
    using (true);

-- You can only write a review as yourself, for a COMPLETED job, and only
-- between the two people involved: the employer and the accepted worker.
drop policy if exists "Parties to a completed job can review each other" on public.reviews;
create policy "Parties to a completed job can review each other"
    on public.reviews for insert
    to authenticated
    with check (
        reviewer_id = auth.uid()
        and reviewer_id <> reviewee_id
        and exists (
            select 1
            from public.jobs j
            where j.id = reviews.job_id
              and j.status = 'completed'
              and (
                    -- employer reviewing the accepted worker
                    (j.user_id = auth.uid()
                     and exists (
                         select 1 from public.applications a
                         where a.job_id = j.id
                           and a.user_id = reviews.reviewee_id
                           and a.status = 'accepted'))
                 or
                    -- accepted worker reviewing the employer
                    (j.user_id = reviews.reviewee_id
                     and exists (
                         select 1 from public.applications a
                         where a.job_id = j.id
                           and a.user_id = auth.uid()
                           and a.status = 'accepted'))
              )
        )
    );

-- There are deliberately NO update or delete policies:
-- a review cannot be edited or removed once it is posted.
-- (Remove abusive reviews yourself from the Supabase table editor.)

grant select, insert on public.reviews to authenticated;

-- ---------------------------------------------------------------------
-- Average rating per person (used for the "4.8 (12 reviews)" labels)
-- ---------------------------------------------------------------------
create or replace view public.profile_ratings
with (security_invoker = true) as
select
    reviewee_id                       as user_id,
    round(avg(rating)::numeric, 1)    as average_rating,
    count(*)::int                     as review_count
from public.reviews
group by reviewee_id;

grant select on public.profile_ratings to authenticated;
