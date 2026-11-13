
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const allowedOrigins = new Set([
  "https://danielfidelis1.github.io",
  "https://naijajobs.netlify.app",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "capacitor://localhost",
  "https://localhost",
  "http://localhost",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

function validStoragePath(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;

  const path = value.trim();
  const segments = path.split("/");

  return (
    !path.startsWith("/") &&
    !path.includes("\\") &&
    segments.length >= 2 &&
    segments.every(
      (segment) =>
        segment.length > 0 &&
        segment !== "." &&
        segment !== "..",
    )
  );
}

function validAttachment(
  item: unknown,
): item is {
  path: string;
  uploader_id: string;
  application_id: string;
} {
  if (!item || typeof item !== "object") return false;

  const attachment = item as {
    path?: unknown;
    uploader_id?: unknown;
    application_id?: unknown;
  };

  if (
    !validStoragePath(attachment.path) ||
    typeof attachment.uploader_id !== "string" ||
    !UUID_PATTERN.test(attachment.uploader_id) ||
    typeof attachment.application_id !== "string" ||
    !UUID_PATTERN.test(attachment.application_id)
  ) {
    return false;
  }

  const segments = attachment.path.split("/");

  // Storage policy convention:
  // folder 1 = uploader UUID
  // folder 2 = actual application UUID
  return (
    segments[0] === attachment.uploader_id &&
    segments[1] === attachment.application_id
  );
}

function isUserNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const authError = error as {
    code?: string;
    status?: number;
  };

  return (
    authError.code === "user_not_found" ||
    (authError.status === 404 &&
      authError.code === "user_not_found")
  );
}

async function completeDeletionJob(
  serviceClient: ReturnType<typeof createClient>,
  jobId: string,
  leaseToken: string,
) {
  let lastError: unknown = null;

  // Retry the final database update if Supabase temporarily fails.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { data, error } = await serviceClient
      .from("user_account_deletion_jobs")
      .update({
        status: "completed",
        auth_deleted_at: new Date().toISOString(),
        lease_token: null,
        lease_expires_at: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("lease_token", leaseToken)
      .eq("status", "storage_cleaned")
      .select("id")
      .maybeSingle();

    if (!error && data) return;

    lastError = error ?? new Error(
      "Deletion job could not be marked completed.",
    );

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  throw lastError;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse(
      { error: "Origin not allowed" },
      403,
      headers,
    );
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      405,
      headers,
    );
  }

  let jobId: string | null = null;
  let leaseToken: string | null = null;
  let userId: string | null = null;
  let authAccountDeleted = false;

  const serviceClient = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  try {
    // Require an authenticated session.
    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse(
        { error: "Please sign in again to continue." },
        401,
        headers,
      );
    }

    
    // Require explicit confirmation and password from Settings.
    let requestBody: {
      confirmation?: unknown;
      password?: unknown;
    };

    try {
      requestBody = await req.json();
    } catch {
      return jsonResponse(
        { error: "A valid confirmation request is required." },
        400,
        headers,
      );
    }

    if (requestBody?.confirmation !== "DELETE") {
      return jsonResponse(
        { error: "Please confirm account deletion before continuing." },
        400,
        headers,
      );
    }

    if (
      typeof requestBody.password !== "string" ||
      requestBody.password.length === 0
    ) {
      return jsonResponse(
        { error: "Please enter your password to verify your identity." },
        400,
        headers,
      );
    }

    const userClient = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: { Authorization: authorization },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse(
        { error: "Your session is invalid. Please sign in again." },
        401,
        headers,
      );
    }

    // Verify the password independently with Supabase Auth.
    const passwordClient = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const {
      data: passwordData,
      error: passwordError,
    } = await passwordClient.auth.signInWithPassword({
      email: user.email!,
      password: requestBody.password,
    });

    if (
      passwordError ||
      !passwordData.user ||
      passwordData.user.id !== user.id
    ) {
      return jsonResponse(
        { error: "Your password is incorrect. Please check it and try again." },
        401,
        headers,
      );
    }

    // Only the authenticated user's account can be deleted.
    userId = user.id;

    // Protect administrator accounts.
    const { data: adminRecord, error: adminError } =
      await serviceClient
        .from("admin_users")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

    if (adminError) throw adminError;

    if (adminRecord) {
      return jsonResponse(
        {
          error:
            "Administrator accounts cannot use self-service deletion.",
        },
        403,
        headers,
      );
    }

    // Find an unfinished deletion job.
    let { data: job, error: jobError } = await serviceClient
      .from("user_account_deletion_jobs")
      .select("*")
      .eq("target_user_id", userId)
      .eq("requested_by", userId)
      .in("status", [
        "pending",
        "database_cleaned",
        "storage_cleaned",
      ])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (jobError) throw jobError;

    // Create a new job if necessary.
    if (!job) {
      const { data: newJob, error: insertError } =
        await serviceClient
          .from("user_account_deletion_jobs")
          .insert({
            target_user_id: userId,
            requested_by: userId,
            status: "pending",
          })
          .select("*")
          .single();

      if (insertError) {
        const { data: existingJob, error: retryError } =
          await serviceClient
            .from("user_account_deletion_jobs")
            .select("*")
            .eq("target_user_id", userId)
            .eq("requested_by", userId)
            .in("status", [
              "pending",
              "database_cleaned",
              "storage_cleaned",
            ])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (retryError || !existingJob) throw insertError;

        job = existingJob;
      } else {
        job = newJob;
      }
    }

    jobId = job.id;

    // Claim the job with a temporary lease.
    leaseToken = crypto.randomUUID();

    const now = new Date();
    const leaseExpiry = new Date(
      now.getTime() + 10 * 60 * 1000,
    ).toISOString();

    const { data: claimedJob, error: claimError } =
      await serviceClient
        .from("user_account_deletion_jobs")
        .update({
          lease_token: leaseToken,
          lease_expires_at: leaseExpiry,
          error_message: null,
          updated_at: now.toISOString(),
        })
        .eq("id", jobId)
        .or(
          `lease_token.is.null,lease_expires_at.lt.${now.toISOString()}`,
        )
        .select("*")
        .maybeSingle();

    if (claimError) throw claimError;

    if (!claimedJob) {
      return jsonResponse(
        {
          error:
            "Your account deletion is already being processed. Please try again shortly.",
        },
        409,
        headers,
      );
    }

    job = claimedJob;

    // STAGE 1: Clean database records.
    if (job.status === "pending") {
      const { error: cleanupError } = await serviceClient.rpc(
        "delete_my_account_cleanup",
        {
          p_target_user_id: userId,
          p_deletion_job_id: jobId,
        },
      );

      if (cleanupError) throw cleanupError;

      const { data: refreshedJob, error: refreshError } =
        await serviceClient
          .from("user_account_deletion_jobs")
          .select("*")
          .eq("id", jobId)
          .single();

      if (refreshError) throw refreshError;

      job = refreshedJob;
    }

    // STAGE 2: Delete recorded Storage files.
    if (job.status === "database_cleaned") {
      const profilePath = job.profile_picture_path;
      if (!Array.isArray(job.attachment_paths)) {
  throw new Error(
    "The account's attachment records could not be verified. Storage cleanup has been stopped.",
  );
}

const attachmentRecords = job.attachment_paths;

      // Validate the profile picture belongs to this account.
      if (profilePath) {
        if (
          !validStoragePath(profilePath) ||
          profilePath.split("/")[0] !== userId
        ) {
          throw new Error(
            "The profile picture path failed ownership validation.",
          );
        }

        const { error: profileStorageError } =
          await serviceClient.storage
            .from("profile-pictures")
            .remove([profilePath]);

        if (profileStorageError) throw profileStorageError;
      }

      // Validate every attachment before deleting any attachment.
      const validatedAttachments: {
        path: string;
        uploader_id: string;
        application_id: string;
    }[] = [];

      const seenPaths = new Map<string, string>();

      for (const item of attachmentRecords) {
        if (!validAttachment(item)) {
          throw new Error(
            "An application attachment failed ownership validation.",
          );
        }

        const existingUploader = seenPaths.get(item.path);

        if (
          existingUploader &&
          existingUploader !== item.uploader_id
        ) {
          throw new Error(
            "An attachment has conflicting uploader records.",
          );
        }

        if (!existingUploader) {
          seenPaths.set(item.path, item.uploader_id);
          validatedAttachments.push(item);
        }
      }

      // Delete only validated attachment paths, in batches.
      const attachmentPaths = validatedAttachments.map(
        (item) => item.path,
      );

      for (let i = 0; i < attachmentPaths.length; i += 100) {
        const batch = attachmentPaths.slice(i, i + 100);

        const { error: attachmentError } =
          await serviceClient.storage
            .from("application-attachments")
            .remove(batch);

        if (attachmentError) throw attachmentError;
      }

      const storageTime = new Date().toISOString();

      const { data: storageUpdatedJob, error: storageUpdateError } =
        await serviceClient
          .from("user_account_deletion_jobs")
          .update({
            status: "storage_cleaned",
            storage_cleaned_at: storageTime,
            updated_at: storageTime,
          })
          .eq("id", jobId)
          .eq("lease_token", leaseToken)
          .eq("status", "database_cleaned")
          .select("id")
          .maybeSingle();

      if (storageUpdateError) throw storageUpdateError;

      if (!storageUpdatedJob) {
        throw new Error(
          "Could not confirm completion of Storage cleanup.",
        );
      }

      job.status = "storage_cleaned";
    }

    // STAGE 3: Delete Auth account last.
    if (job.status === "storage_cleaned") {
      // Check whether Auth deletion already happened during an
      // earlier attempt whose final database update failed.
      const { data: authUser, error: lookupError } =
        await serviceClient.auth.admin.getUserById(userId);

      if (lookupError && !isUserNotFound(lookupError)) {
        throw lookupError;
      }

      if (!authUser?.user) {
        if (!isUserNotFound(lookupError)) {
          throw new Error(
            "Could not verify the account's Auth status.",
          );
        }

        authAccountDeleted = true;
      } else {
        const { error: authDeleteError } =
          await serviceClient.auth.admin.deleteUser(userId);

        if (authDeleteError) throw authDeleteError;

        authAccountDeleted = true;
      }

      // Verify Auth account absence before marking the job complete.
      const { data: verification, error: verificationError } =
        await serviceClient.auth.admin.getUserById(userId);

      if (verification?.user) {
        throw new Error(
          "The Auth account still exists after deletion was requested.",
        );
      }

      if (
        verificationError &&
        !isUserNotFound(verificationError)
      ) {
        throw verificationError;
      }

      if (!verificationError && !verification?.user) {
        throw new Error(
          "Could not conclusively verify Auth account deletion.",
        );
      }

      // Retry the final database update if necessary.
      await completeDeletionJob(
        serviceClient,
        jobId,
        leaseToken,
      );
    }

    return jsonResponse(
      {
        success: true,
        message:
          "Your account and associated personal data have been deleted.",
      },
      200,
      headers,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Account deletion could not be completed.";

    // If Auth deletion has already happened, do not pretend that
    // the user can simply retry through their deleted account.
    if (jobId && leaseToken && !authAccountDeleted) {
      await serviceClient
        .from("user_account_deletion_jobs")
        .update({
          error_message: message.slice(0, 1000),
          lease_token: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .eq("lease_token", leaseToken);
    }

    console.error(
      "Self-service account deletion failed:",
      {
        userId,
        jobId,
        authAccountDeleted,
        error: message,
      },
    );

    return jsonResponse(
      {
        error: authAccountDeleted
          ? "Your account deletion is almost complete, but the final confirmation needs administrative reconciliation. Please contact support."
          : "Account deletion could not be completed. Please contact support before trying again.",
      },
      500,
      headers,
    );
  }
});
