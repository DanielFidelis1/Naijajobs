-- =====================================================================
-- NaijaJobs  |  Step 5: Email alerts (database part)
-- Run in the Supabase dashboard: SQL Editor > New query > paste > Run
-- Then follow SETUP.md, section "Email alerts", to deploy the email sender.
-- =====================================================================

-- Each person can switch email alerts off on their Profile page.
alter table public.profiles
    add column if not exists email_alerts boolean not null default true;
