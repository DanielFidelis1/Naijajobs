
-- NaijaJobs | Step 8: Safe public profile lookup

CREATE OR REPLACE FUNCTION public.get_public_profile(p_profile_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
    SELECT jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'account_type', p.account_type,
        'location', p.location,
        'skills', p.skills,
        'bio', p.bio,
        'jobs_done_as_worker', (
            SELECT count(*)::int
            FROM public.applications AS a
            JOIN public.jobs AS j
                ON j.id = a.job_id
            WHERE a.user_id = p.id
              AND a.status = 'accepted'
              AND a.completed_at IS NOT NULL
              AND j.status = 'completed'
        ),
        'jobs_done_as_client', (
            SELECT count(*)::int
            FROM public.jobs AS j
            WHERE j.user_id = p.id
              AND j.status = 'completed'
        )
    )
    FROM public.profiles AS p
    WHERE p.id = p_profile_id
      AND p.account_type IN ('worker', 'job_seeker', 'client')
      AND COALESCE(p.is_suspended, false) = false;
$function$;

-- Prevent general PUBLIC access, then grant only the intended roles.
REVOKE ALL ON FUNCTION public.get_public_profile(uuid)
FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_public_profile(uuid)
FROM anon;

GRANT EXECUTE ON FUNCTION public.get_public_profile(uuid)
TO anon, authenticated;
