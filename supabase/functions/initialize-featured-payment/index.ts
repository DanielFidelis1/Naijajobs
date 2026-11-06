
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");

    if (!supabaseUrl || !anonKey || !serviceKey || !paystackKey) {
      console.error("A required server configuration is missing.");
      return respond(
        { error: "Payment service is not configured." },
        500,
      );
    }

    // Authenticate the signed-in user using their access token.
    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return respond({ error: "Please sign in first." }, 401);
    }

    const token = authorization.slice(7);

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: authData, error: authError } =
      await authClient.auth.getUser(token);

    if (authError || !authData.user) {
      return respond({ error: "Your session is invalid or expired." }, 401);
    }

    const user = authData.user;

    // Only accept the job ID from the request.
    const body = await req.json();
    const jobId = body?.job_id;

    if (
      typeof jobId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        .test(jobId)
    ) {
      return respond({ error: "A valid job ID is required." }, 400);
    }

    // This client is server-side only. Never expose its key in the browser.
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("account_type, employer_status, is_suspended")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Could not check employer profile.");
      return respond({ error: "Could not verify your account." }, 500);
    }

    const { data: adminRecord, error: adminError } = await admin
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminError) {
      console.error("Could not check administrator status.");
      return respond({ error: "Could not verify your account." }, 500);
    }

    const isAdmin = Boolean(adminRecord);

    if (
      !profile ||
      profile.is_suspended ||
      (!isAdmin &&
        (
          profile.account_type !== "client" ||
          profile.employer_status !== "approved"
        ))
    ) {
      return respond({
        error: "Only approved, active employers can feature jobs.",
      }, 403);
    }

    // Confirm that this user owns the job and that it is still open.
    const { data: job, error: jobError } = await admin
      .from("jobs")
      .select("id, user_id, title, status")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (jobError) {
      console.error("Could not check job ownership.");
      return respond({ error: "Could not verify the job." }, 500);
    }

    if (!job) {
      return respond({
        error: "Job not found or you do not own this job.",
      }, 404);
    }

    if (job.status !== "open") {
      return respond({
        error: "Only open jobs can be featured.",
      }, 400);
    }

    if (!user.email) {
      return respond({
        error: "Your account needs an email address for checkout.",
      }, 400);
    }

    // The server controls the price and duration.
    const amountKobo = 150000;
    const durationDays = 7;
    const reference = `njf_${crypto.randomUUID()}`;

    // Create a pending record before requesting checkout.
    const { error: insertError } = await admin
      .from("featured_job_payments")
      .insert({
        user_id: user.id,
        job_id: job.id,
        reference,
        amount_kobo: amountKobo,
        currency: "NGN",
        duration_days: durationDays,
        status: "pending",
        payment_provider: "paystack",
      });

    if (insertError) {
      console.error("Could not create pending payment record.");
      return respond({ error: "Could not start your payment." }, 500);
    }

    // Ask Paystack to initialize checkout.
    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          amount: amountKobo,
          currency: "NGN",
          reference,
          callback_url: "http://127.0.0.1:5500/my-jobs.html",
          metadata: {
            user_id: user.id,
            job_id: job.id,
            purpose: "featured_job",
            duration_days: durationDays,
          },
        }),
      },
    );

    const result = await paystackResponse.json();

    if (
      !paystackResponse.ok ||
      !result.status ||
      !result.data?.authorization_url ||
      result.data.reference !== reference
    ) {
      console.error("Paystack checkout initialization failed.");

      // Keep the record for auditing; it has not been paid.
      await admin
        .from("featured_job_payments")
        .update({ status: "failed" })
        .eq("reference", reference)
        .eq("status", "pending");

      return respond({ error: "Could not initialize Paystack checkout." }, 502);
    }

    return respond({
      authorization_url: result.data.authorization_url,
      reference,
      amount_kobo: amountKobo,
      duration_days: durationDays,
    });
  } catch (error) {
    console.error(
      "Featured payment initialization error:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return respond({ error: "An unexpected payment error occurred." }, 500);
  }
});
