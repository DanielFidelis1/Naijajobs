-- =====================================================================
-- NaijaJobs  |  Step 2: Notifications
-- Run in the Supabase dashboard: SQL Editor > New query > paste > Run
-- Run 01-reviews.sql FIRST (the review notification depends on it).
-- =====================================================================
--
-- How it works: when something happens (someone applies, you are accepted,
-- a job is completed, you get a message or a review) a database trigger
-- writes a row in "notifications" for the right person. The browser can only
-- READ its own notifications and mark them as read. It can never create one,
-- so nobody can send fake alerts to other users.
--
-- ---------------------------------------------------------------------

create table if not exists public.notifications (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references auth.users(id) on delete cascade,
    type       text not null,
    title      text not null,
    body       text not null,
    link       text,
    is_read    boolean not null default false,
    created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
    on public.notifications (user_id, is_read, created_at desc);

-- ---------------------------------------------------------------------
-- Security: people see and manage only their own notifications.
-- ---------------------------------------------------------------------
alter table public.notifications enable row level security;

drop policy if exists "Read own notifications" on public.notifications;
create policy "Read own notifications"
    on public.notifications for select to authenticated
    using (user_id = auth.uid());

drop policy if exists "Update own notifications" on public.notifications;
create policy "Update own notifications"
    on public.notifications for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists "Delete own notifications" on public.notifications;
create policy "Delete own notifications"
    on public.notifications for delete to authenticated
    using (user_id = auth.uid());

-- No INSERT policy on purpose. Only the triggers below can create rows.
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (is_read) on public.notifications to authenticated;   -- can ONLY change is_read

-- ---------------------------------------------------------------------
-- Helper that writes a notification. Not callable from the browser.
-- ---------------------------------------------------------------------
create or replace function public.notify(
    p_user uuid, p_type text, p_title text, p_body text, p_link text
) returns void
language sql
security definer
set search_path = public
as $$
    insert into public.notifications (user_id, type, title, body, link)
    values (p_user, p_type, p_title, p_body, p_link);
$$;

revoke all on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. Someone applied for your job  ->  tell the job owner
-- ---------------------------------------------------------------------
create or replace function public.notify_new_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    j record;
    applicant text;
begin
    select user_id, title into j from public.jobs where id = new.job_id;
    if j.user_id is null or j.user_id = new.user_id then
        return new;
    end if;
    select full_name into applicant from public.profiles where id = new.user_id;
    perform public.notify(
        j.user_id, 'application', 'New applicant',
        coalesce(applicant, 'Someone') || ' applied for "' || coalesce(j.title, 'your job') || '".',
        'applicants.html?id=' || new.job_id::text
    );
    return new;
end;
$$;

drop trigger if exists trg_notify_new_application on public.applications;
create trigger trg_notify_new_application
    after insert on public.applications
    for each row execute function public.notify_new_application();

-- ---------------------------------------------------------------------
-- 2. Your application was accepted or rejected  ->  tell the applicant
-- ---------------------------------------------------------------------
create or replace function public.notify_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    job_title text;
begin
    if new.status is distinct from old.status and new.status in ('accepted', 'rejected') then
        select title into job_title from public.jobs where id = new.job_id;
        perform public.notify(
            new.user_id,
            'application_' || new.status,
            case new.status when 'accepted' then 'You were accepted' else 'Application update' end,
            case new.status
                when 'accepted' then 'Good news! You were accepted for "' || coalesce(job_title, 'a job') || '".'
                else 'Your application for "' || coalesce(job_title, 'a job') || '" was not successful this time.'
            end,
            'job.html?id=' || new.job_id::text
        );
    end if;
    return new;
end;
$$;

drop trigger if exists trg_notify_application_status on public.applications;
create trigger trg_notify_application_status
    after update of status on public.applications
    for each row execute function public.notify_application_status();

-- ---------------------------------------------------------------------
-- 3. A job was marked completed  ->  tell the accepted worker(s)
-- ---------------------------------------------------------------------
create or replace function public.notify_job_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    r record;
begin
    if new.status = 'completed' and old.status is distinct from 'completed' then
        for r in
            select user_id from public.applications
            where job_id = new.id and status = 'accepted'
        loop
            perform public.notify(
                r.user_id, 'job_completed', 'Job completed',
                '"' || coalesce(new.title, 'Your job') || '" was marked as completed. Leave a review for the client.',
                'job.html?id=' || new.id::text
            );
        end loop;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_notify_job_completed on public.jobs;
create trigger trg_notify_job_completed
    after update of status on public.jobs
    for each row execute function public.notify_job_completed();

-- ---------------------------------------------------------------------
-- 4. New chat message  ->  tell the other person
--    While an earlier message from the same chat is still unread, that
--    notification is refreshed instead of creating a new one each time.
-- ---------------------------------------------------------------------
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    c record;
    recipient uuid;
    sender text;
    chat_link text;
    body_text text;
begin
    select participant_one, participant_two into c
    from public.conversations where id = new.conversation_id;
    if c.participant_one is null then
        return new;
    end if;

    recipient := case when c.participant_one = new.sender_id then c.participant_two else c.participant_one end;
    if recipient is null or recipient = new.sender_id then
        return new;
    end if;

    select full_name into sender from public.profiles where id = new.sender_id;
    chat_link := 'message.html?conversation=' || new.conversation_id::text;
    body_text := left(coalesce(new.content, ''), 120);

    update public.notifications
       set body = body_text, created_at = now(), title = 'New message from ' || coalesce(sender, 'someone')
     where user_id = recipient and type = 'message' and link = chat_link and is_read = false;

    if not found then
        perform public.notify(
            recipient, 'message', 'New message from ' || coalesce(sender, 'someone'),
            body_text, chat_link
        );
    end if;
    return new;
end;
$$;

drop trigger if exists trg_notify_new_message on public.messages;
create trigger trg_notify_new_message
    after insert on public.messages
    for each row execute function public.notify_new_message();

-- ---------------------------------------------------------------------
-- 5. Someone reviewed you  ->  tell the reviewee
-- ---------------------------------------------------------------------
create or replace function public.notify_new_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    reviewer text;
begin
    select full_name into reviewer from public.profiles where id = new.reviewer_id;
    perform public.notify(
        new.reviewee_id, 'review', 'New review',
        coalesce(reviewer, 'Someone') || ' left you a ' || new.rating::text || '-star review.',
        'profile.html'
    );
    return new;
end;
$$;

drop trigger if exists trg_notify_new_review on public.reviews;
create trigger trg_notify_new_review
    after insert on public.reviews
    for each row execute function public.notify_new_review();

-- ---------------------------------------------------------------------
-- Live updates: lets the unread badge change without refreshing the page.
-- (Skips quietly if it is already switched on.)
-- ---------------------------------------------------------------------
do $$
begin
    alter publication supabase_realtime add table public.notifications;
exception
    when duplicate_object then null;
end
$$;
