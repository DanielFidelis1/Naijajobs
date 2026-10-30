-- NaijaJobs | Step 7: Enforce application eligibility in Supabase RLS
-- Run only after checking that your account_type values use "worker" for job seekers.
-- This does not alter existing application rows or status/completion functions.

DROP POLICY IF EXISTS "Users can submit applications" ON public.applications;

CREATE POLICY "Users can submit applications"
    ON public.applications
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1
            FROM public.profiles AS p
            WHERE p.id = auth.uid()
              AND p.account_type IN ('worker', 'job_seeker')
              AND COALESCE(p.is_suspended, false) = false
        )
        AND EXISTS (
            SELECT 1
            FROM public.jobs AS j
            WHERE j.id = applications.job_id
              AND j.status = 'open'
              AND j.user_id <> auth.uid()
        )
    );

-- Verify the policy definition after running:
-- SELECT policyname, cmd, roles, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename = 'applications'
--   AND policyname = 'Users can submit applications';
