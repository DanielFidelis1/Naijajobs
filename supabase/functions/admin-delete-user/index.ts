
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://naijajobs.netlify.app",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
]);

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";

  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://naijajobs.netlify.app",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

type DeletionJob = {
  id: string;
  target_user_id: string;
  requested_by: string;
  status: string;
  error_message: string | null;
  profile_picture_path: string | null;
  attachment_paths: string[];
  database_cleaned_at: string | null;
  storage_cleaned_at: string | null;
  auth_deleted_at: string | null;
  lease_token: string | null;
  lease_expires_at: string | null;
};

function respond(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(value);
}

function isUserNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const value = error as { code?: string };

  return value.code === "user_not_found";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return respond(req, { error: "Method not allowed" }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization");

  if (!url || !anonKey || !serviceKey) {
    return respond(req, { error: "Server configuration is incomplete" }, 500);
  }

  if (!authorization?.startsWith("Bearer ")) {
    return respond(req, { error: "Authentication required" }, 401);
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const serviceClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let jobId: string | null = null;
  let leaseToken: string | null = null;
  let adminId: string | null = null;

  async function getJob(targetId: string): Promise<DeletionJob | null> {
    const { data, error } = await serviceClient
      .from("admin_account_deletion_jobs")
      .select("*")
      .eq("target_user_id", targetId)
      .neq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error("Could not inspect deletion history");
    }

    return data as DeletionJob | null;
  }

  async function renewLease(): Promise<void> {
    if (!jobId || !leaseToken) {
      throw new Error("Deletion job lease is not initialized");
    }

    const { data, error } = await userClient.rpc(
      "admin_renew_account_deletion_lease",
      {
        p_job_id: jobId,
        p_lease_token: leaseToken,
      },
    );

    if (error || data !== true) {
      throw new Error("Deletion job lease was lost or expired");
    }
  }

  async function saveProgress(
    values: Record<string, unknown>,
  ): Promise<void> {
    if (!jobId || !leaseToken || !adminId) {
      throw new Error("Cannot save progress without a claimed job");
    }

    const allowedFields = new Set([
      "status",
      "database_cleaned_at",
      "storage_cleaned_at",
      "auth_deleted_at",
      "error_message",
    ]);

    for (const key of Object.keys(values)) {
      if (!allowedFields.has(key)) {
        throw new Error(`Unsupported deletion progress field: ${key}`);
      }
    }

    await renewLease();

    const { data, error } = await serviceClient
      .from("admin_account_deletion_jobs")
      .update({
        ...values,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("requested_by", adminId)
      .eq("lease_token", leaseToken)
      .gt("lease_expires_at", new Date().toISOString())
      .neq("status", "completed")
      .select("id")
      .maybeSingle();

    if (error || !data) {
      throw new Error(
        "Progress update rejected; lease ownership could not be confirmed",
      );
    }
  }

  async function getVerifiedJob(): Promise<DeletionJob> {
    if (!jobId || !leaseToken || !adminId) {
      throw new Error("Deletion job is not initialized");
    }

    const { data, error } = await serviceClient
      .from("admin_account_deletion_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("requested_by", adminId)
      .eq("lease_token", leaseToken)
      .maybeSingle();

    if (error || !data) {
      throw new Error("Could not verify deletion job ownership");
    }

    return data as DeletionJob;
  }
async function releaseCompletedLease(): Promise<void> {
  if (!jobId || !leaseToken || !adminId) {
    throw new Error("Cannot release an uninitialized lease");
  }

  const { data, error } = await serviceClient
    .from("admin_account_deletion_jobs")
    .update({
      lease_token: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("requested_by", adminId)
    .eq("lease_token", leaseToken)
    .eq("status", "completed")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error(
      "Could not release completed deletion lease:",
      error?.message ?? "No matching completed job was updated",
    );
  }
}

  try {
    // 1. Verify the signed-in administrator.
    const {
      data: { user: adminUser },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !adminUser) {
      return respond(req, { error: "Invalid administrator session" }, 401);
    }

    adminId = adminUser.id;

    const { data: adminRecord, error: adminCheckError } =
      await serviceClient
        .from("admin_users")
        .select("user_id")
        .eq("user_id", adminId)
        .maybeSingle();

    if (adminCheckError) {
      return respond(req, { error: "Could not verify administrator" }, 500);
    }

    if (!adminRecord) {
      return respond(req, { error: "Administrators only" }, 403);
    }

    // 2. Validate the target account.
    const body = await req.json().catch(() => null);
    const targetId = body?.target_user_id;

    if (!isUuid(targetId)) {
      return respond(req, { error: "A valid target_user_id is required" }, 400);
    }

    if (targetId === adminId) {
      return respond(req, { error: "You cannot delete your own account" }, 400);
    }

    const { data: targetAdmin, error: targetAdminError } =
      await serviceClient
        .from("admin_users")
        .select("user_id")
        .eq("user_id", targetId)
        .maybeSingle();

    if (targetAdminError) {
      return respond(req, { error: "Could not verify target account" }, 500);
    }

    if (targetAdmin) {
      return respond(req, { error: "Administrator accounts are protected" }, 403);
    }

    // 3. Find an unfinished job or create its recovery record.
    let job = await getJob(targetId);
if (!job) {
  const { data: completedJob, error: completedJobError } =
    await serviceClient
      .from("admin_account_deletion_jobs")
      .select("id, requested_by, status")
      .eq("target_user_id", targetId)
      .eq("status", "completed")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (completedJobError) {
    return respond(req, {
      error: "Could not verify previous deletion history",
    }, 500);
  }

  if (completedJob) {
    return respond(req, {
      success: true,
      message: "Account deletion was already completed",
      deletion_job_id: completedJob.id,
    });
  }
}
    if (!job) {
      const { data: profile, error: profileError } = await serviceClient
        .from("profiles")
        .select("id, account_type, profile_picture_path")
        .eq("id", targetId)
        .maybeSingle();

      if (profileError) {
        return respond(req, { error: "Could not load target profile" }, 500);
      }

      if (!profile) {
        return respond(req, { error: "Target profile not found" }, 404);
      }

      if (!["client", "worker", "job_seeker"].includes(profile.account_type)) {
        return respond(req, { error: "Unsupported account type" }, 400);
      }

      const { data: ownedJobs, error: jobsError } = await serviceClient
        .from("jobs")
        .select("id")
        .eq("user_id", targetId);

      if (jobsError) {
        return respond(req, { error: "Could not inspect owned jobs" }, 500);
      }

      const { data: ownApplications, error: ownApplicationsError } =
        await serviceClient
          .from("applications")
          .select("id")
          .eq("user_id", targetId);

      if (ownApplicationsError) {
        return respond(req, { error: "Could not inspect applications" }, 500);
      }

      const applicationIds = new Set<string>(
        (ownApplications ?? []).map((item) => item.id),
      );

      const ownedJobIds = (ownedJobs ?? []).map((item) => item.id);

      if (ownedJobIds.length > 0) {
        const { data: jobApplications, error } = await serviceClient
          .from("applications")
          .select("id")
          .in("job_id", ownedJobIds);

        if (error) {
          return respond(req, { error: "Could not inspect job applications" }, 500);
        }

        for (const item of jobApplications ?? []) {
          applicationIds.add(item.id);
        }
      }

      const { data: uploadedAttachments, error: uploadedError } =
        await serviceClient
          .from("application_attachments")
          .select("storage_path")
          .eq("uploader_id", targetId);

      if (uploadedError) {
        return respond(req, { error: "Could not inspect uploaded attachments" }, 500);
      }

      let relatedAttachments: { storage_path: string }[] = [];

      if (applicationIds.size > 0) {
        const { data, error } = await serviceClient
          .from("application_attachments")
          .select("storage_path")
          .in("application_id", [...applicationIds]);

        if (error) {
          return respond(req, { error: "Could not inspect related attachments" }, 500);
        }

        relatedAttachments = data ?? [];
      }

      const attachmentPaths = [...new Set([
        ...(uploadedAttachments ?? []).map((item) => item.storage_path),
        ...relatedAttachments.map((item) => item.storage_path),
      ].filter((path): path is string => Boolean(path)))];

      const { data: newJob, error: insertError } = await serviceClient
        .from("admin_account_deletion_jobs")
        .insert({
          target_user_id: targetId,
          requested_by: adminId,
          status: "pending",
          profile_picture_path: profile.profile_picture_path,
          attachment_paths: attachmentPaths,
        })
        .select("*")
        .single();

      if (insertError || !newJob) {
        const existing = await getJob(targetId);

        if (!existing) {
          console.error("Could not create deletion record:", insertError?.message);
          return respond(req, {
            error: "Could not create deletion record; no deletion was started",
          }, 409);
        }

        job = existing;
      } else {
        job = newJob as DeletionJob;
      }
    }

    jobId = job.id;

    if (job.requested_by !== adminId) {
      return respond(req, {
        error: "Only the administrator who requested this deletion can resume it",
        deletion_job_id: job.id,
      }, 403);
    }

    if (job.status === "completed") {
      return respond(req, {
        success: true,
        message: "Account deletion was already completed",
        deletion_job_id: job.id,
      });
    }

    // Claim the job with a fresh token. The database rejects a live lease.
    leaseToken = crypto.randomUUID();

    const { data: claimResult, error: claimError } = await userClient.rpc(
      "admin_claim_account_deletion_job",
      {
        p_job_id: job.id,
        p_lease_token: leaseToken,
      },
    );

    if (
      claimError ||
      !Array.isArray(claimResult) ||
      claimResult.length !== 1
    ) {
      leaseToken = null;

      return respond(req, {
        error: "Could not claim deletion job. It may already be processing or require manual review.",
        deletion_job_id: job.id,
      }, 409);
    }

    job = await getVerifiedJob();

    // 4. Clean the database. A missing profile without confirmation is
    // ambiguous and must be paused for manual review.
    if (!job.database_cleaned_at) {
      const { data: profile, error: profileError } = await serviceClient
        .from("profiles")
        .select("id")
        .eq("id", targetId)
        .maybeSingle();

      if (profileError) {
        throw new Error("Could not verify target profile");
      }

      if (!profile) {
        await saveProgress({
          error_message:
            "Profile is missing but database cleanup is unconfirmed. Manual review is required.",
        });

        return respond(req, {
          error: "Deletion paused because database cleanup cannot be confirmed.",
          deletion_job_id: job.id,
        }, 409);
      }

      await renewLease();

      const { error: cleanupError } = await userClient.rpc(
        "admin_cleanup_user_records",
        {
          p_target_user_id: targetId,
          p_deletion_job_id: job.id,
          p_lease_token: leaseToken,
        },
      );

      if (cleanupError) {
        console.error("Database cleanup failed:", cleanupError.message);

        await saveProgress({
          error_message:
            "Database cleanup failed; inspect the recorded stage before retrying.",
        });

        return respond(req, {
          error: "Database cleanup failed. Auth deletion was not attempted.",
          deletion_job_id: job.id,
        }, 500);
      }

      job = await getVerifiedJob();

      if (!job.database_cleaned_at) {
        throw new Error("Database cleanup confirmation is missing");
      }
    }

    // 5. Remove saved Storage paths. If a prior attempt removed files but
    // did not save its timestamp, retrying removal is intentional.
    job = await getVerifiedJob();

    if (!job.storage_cleaned_at) {
      await renewLease();

      const attachmentPaths = Array.isArray(job.attachment_paths)
        ? job.attachment_paths
        : [];

      if (attachmentPaths.length > 0) {
        const { error } = await serviceClient.storage
          .from("application-attachments")
          .remove(attachmentPaths);

        if (error) {
          await saveProgress({
            error_message: "Attachment cleanup failed; retry is possible.",
          });

          return respond(req, {
            error: "Database cleanup succeeded, but attachment cleanup failed.",
            deletion_job_id: job.id,
          }, 500);
        }
      }

      await renewLease();

      if (job.profile_picture_path) {
        const { error } = await serviceClient.storage
          .from("profile-pictures")
          .remove([job.profile_picture_path]);

        if (error) {
          await saveProgress({
            error_message: "Profile-picture cleanup failed; retry is possible.",
          });

          return respond(req, {
            error: "Database cleanup succeeded, but profile-picture cleanup failed.",
            deletion_job_id: job.id,
          }, 500);
        }
      }

      await saveProgress({
        status: "storage_cleaned",
        storage_cleaned_at: new Date().toISOString(),
        error_message: null,
      });

      job = await getVerifiedJob();

      if (!job.storage_cleaned_at) {
        throw new Error("Storage cleanup confirmation is missing");
      }
    }

    // 6. Delete Auth last, after confirming the earlier stages.
    job = await getVerifiedJob();

    if (!job.database_cleaned_at || !job.storage_cleaned_at) {
      throw new Error("A required database or Storage stage is unconfirmed");
    }

    if (!job.auth_deleted_at) {
      await renewLease();

      const { data: authLookup, error: lookupError } =
        await serviceClient.auth.admin.getUserById(targetId);

      if (lookupError && !isUserNotFound(lookupError)) {
        await saveProgress({
          error_message: "Could not verify Auth account; retry is possible.",
        });

        return respond(req, {
          error: "Could not verify the Auth account. No further action was taken.",
          deletion_job_id: job.id,
        }, 500);
      }

      if (!lookupError && authLookup?.user) {
        await renewLease();

        const { error: authDeleteError } =
          await serviceClient.auth.admin.deleteUser(targetId);

        if (authDeleteError) {
          const { data: verifyResult, error: verifyError } =
            await serviceClient.auth.admin.getUserById(targetId);

          if (verifyError && !isUserNotFound(verifyError)) {
            await saveProgress({
              error_message: "Auth deletion outcome is uncertain; manual review required.",
            });

            return respond(req, {
              error: "Auth deletion outcome is uncertain. Inspect the deletion job before retrying.",
              deletion_job_id: job.id,
            }, 500);
          }

          if (verifyResult?.user) {
            await saveProgress({
              error_message: "Auth deletion failed; retry is possible.",
            });

            return respond(req, {
              error: "Storage cleanup succeeded, but Auth deletion failed.",
              deletion_job_id: job.id,
            }, 500);
          }
        }
      }

      // Verify Auth absence before recording the completion timestamp.
      await renewLease();

      const { data: finalLookup, error: finalLookupError } =
        await serviceClient.auth.admin.getUserById(targetId);

      if (finalLookupError && !isUserNotFound(finalLookupError)) {
        await saveProgress({
          error_message: "Could not confirm Auth deletion; manual review required.",
        });

        return respond(req, {
          error: "Could not confirm Auth deletion. Inspect the deletion job.",
          deletion_job_id: job.id,
        }, 500);
      }

      if (finalLookup?.user) {
        await saveProgress({
          error_message: "Auth account still exists; deletion is not complete.",
        });

        return respond(req, {
          error: "Auth account still exists. Deletion is not complete.",
          deletion_job_id: job.id,
        }, 500);
      }

      // Confirm lease ownership and all stages before marking complete.
      job = await getVerifiedJob();

      if (!job.database_cleaned_at || !job.storage_cleaned_at) {
        throw new Error("A required deletion stage is not confirmed");
      }

      await saveProgress({
        status: "completed",
        auth_deleted_at: new Date().toISOString(),
        error_message: null,
      });

      const { data: completedJob, error: completedVerifyError } =
        await serviceClient
          .from("admin_account_deletion_jobs")
          .select("*")
          .eq("id", job.id)
          .eq("requested_by", adminId)
          .eq("lease_token", leaseToken)
          .maybeSingle();

      if (
        completedVerifyError ||
        !completedJob ||
        completedJob.status !== "completed" ||
        !completedJob.database_cleaned_at ||
        !completedJob.storage_cleaned_at ||
        !completedJob.auth_deleted_at
      ) {
        return respond(req, {
          error: "Completion could not be verified. Inspect the deletion job before retrying.",
          deletion_job_id: job.id,
        }, 500);
      }

      job = completedJob as DeletionJob;

      // Release only after the completed status and timestamps are verified.
      await releaseCompletedLease();

      return respond(req, {
        success: true,
        message: "Account deletion completed",
        deletion_job_id: job.id,
        financial_records_preserved: true,
        payment_user_ids_cleared_on_auth_deletion: true,
      });
    }

    // Recovery for an unusual job with an Auth deletion timestamp already
    // recorded. Verify all stages and confirm the Auth user remains absent.
    if (
      !job.database_cleaned_at ||
      !job.storage_cleaned_at ||
      !job.auth_deleted_at
    ) {
      throw new Error(
        "A required deletion stage is not confirmed; manual review is required",
      );
    }

    await renewLease();

    const { data: finalAuth, error: finalAuthError } =
      await serviceClient.auth.admin.getUserById(targetId);

    if (finalAuthError && !isUserNotFound(finalAuthError)) {
      throw new Error("Could not verify previously recorded Auth deletion");
    }

    if (finalAuth?.user) {
      throw new Error("Auth user exists despite a recorded deletion timestamp");
    }

    await saveProgress({
      status: "completed",
      error_message: null,
    });

    const { data: finalJob, error: finalJobError } =
      await serviceClient
        .from("admin_account_deletion_jobs")
        .select("*")
        .eq("id", job.id)
        .eq("requested_by", adminId)
        .eq("lease_token", leaseToken)
        .maybeSingle();

    if (
      finalJobError ||
      !finalJob ||
      finalJob.status !== "completed" ||
      !finalJob.database_cleaned_at ||
      !finalJob.storage_cleaned_at ||
      !finalJob.auth_deleted_at
    ) {
      return respond(req, {
        error: "Completion could not be verified. Inspect the deletion job.",
        deletion_job_id: job.id,
      }, 500);
    }

    job = finalJob as DeletionJob;
    await releaseCompletedLease();

    return respond(req, {
      success: true,
      message: "Account deletion completed",
      deletion_job_id: job.id,
      financial_records_preserved: true,
      payment_user_ids_cleared_on_auth_deletion: true,
    });
  } catch (error) {
    console.error(
      "Deletion workflow error:",
      error instanceof Error ? error.message : "Unknown error",
    );

    // Only record an error if this request still owns the lease.
    if (jobId && leaseToken && adminId) {
      try {
        const { data: currentJob } = await serviceClient
          .from("admin_account_deletion_jobs")
          .select("id, status, lease_token")
          .eq("id", jobId)
          .eq("requested_by", adminId)
          .eq("lease_token", leaseToken)
          .maybeSingle();

        if (currentJob && currentJob.status !== "completed") {
          await saveProgress({
            error_message:
              "Workflow stopped unexpectedly. Inspect recorded timestamps before retrying.",
          });
        }
      } catch {
        // The lease may have expired or been taken over. Do not force an update.
      }
    }

    return respond(req, {
      error: "Deletion workflow stopped unexpectedly. Inspect the deletion job before retrying.",
      deletion_job_id: jobId,
    }, 500);
  }
});
