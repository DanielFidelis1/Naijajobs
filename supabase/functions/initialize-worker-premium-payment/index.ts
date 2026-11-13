
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !paystackSecret) {
      console.error("A required environment variable is missing.");
      return jsonResponse({ error: "Payment service is not configured." }, 500);
    }

    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Please sign in first." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authHeader.slice("Bearer ".length);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: "Your session is invalid. Please sign in again." }, 401);
    }

    const body = await req.json().catch(() => null);
    const planType = body?.plan_type;

    if (!["monthly", "yearly", "lifetime"].includes(planType)) {
      return jsonResponse({ error: "Please select a valid Premium plan." }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("account_type, is_suspended, email")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Could not check the user's profile.");
      return jsonResponse({ error: "Could not verify your account." }, 500);
    }

    if (!profile || !["worker", "job_seeker"].includes(profile.account_type)) {
      return jsonResponse(
        { error: "Worker Premium is available only to workers and job seekers." },
        403,
      );
    }

    if (profile.is_suspended) {
      return jsonResponse(
        { error: "Your account is suspended and cannot purchase Premium." },
        403,
      );
    }
    // Prevent users with active Lifetime Premium from paying again.
    const { data: existingSubscription, error: subscriptionError } =
      await adminClient
        .from("worker_premium_subscriptions")
        .select("plan_type, status, expires_at")
        .eq("user_id", user.id)
        .maybeSingle();

    if (subscriptionError) {
      console.error("Could not check existing Premium subscription.");
      return jsonResponse(
        { error: "Could not verify your Premium status. Please try again." },
        500,
      );
    }

    if (
      existingSubscription?.status === "active" &&
      existingSubscription.plan_type === "lifetime" &&
      existingSubscription.expires_at === null
    ) {
      return jsonResponse(
        { error: "You already have Lifetime Premium. No additional payment is needed." },
        409,
      );
    }
    const email = user.email || profile.email;

    if (!email) {
      return jsonResponse({ error: "Your account needs an email address to pay." }, 400);
    }

    const { data: plan, error: planError } = await adminClient
      .from("worker_premium_plans")
      .select("plan_type, name, amount_kobo, duration_months")
      .eq("plan_type", planType)
      .eq("is_active", true)
      .maybeSingle();

    if (planError || !plan) {
      return jsonResponse({ error: "This Premium plan is unavailable." }, 400);
    }

    const requestOrigin = req.headers.get("Origin");

    const allowedOrigins = [
      "https://danielfidelis1.github.io",
      "http://127.0.0.1:5500",
      "http://localhost:5500",
    ];

    if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) {
      return jsonResponse({ error: "Unrecognized website address." }, 403);
    }

    const callbackUrl =
      requestOrigin === "https://danielfidelis1.github.io"
        ? `${requestOrigin}/Naijajobs/dashboard.html`
        : `${requestOrigin}/dashboard.html`;
        
    const reference = `njwp_${crypto.randomUUID()}`;

    const { error: insertError } = await adminClient
      .from("worker_premium_payments")
      .insert({
        user_id: user.id,
        reference,
        plan_type: plan.plan_type,
        amount_kobo: plan.amount_kobo,
        currency: "NGN",
        status: "pending",
        payment_provider: "paystack",
      });

    if (insertError) {
      console.error("Could not create the pending Premium payment.");
      return jsonResponse({ error: "Could not start your payment. Please try again." }, 500);
    }

    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          amount: plan.amount_kobo,
          currency: "NGN",
          reference,
          callback_url: callbackUrl,
          metadata: {
            user_id: user.id,
            plan_type: plan.plan_type,
            payment_type: "worker_premium",
          },
        }),
      },
    );

    const paystackResult = await paystackResponse.json().catch(() => null);

    if (
      !paystackResponse.ok ||
      paystackResult?.status !== true ||
      !paystackResult?.data?.authorization_url
    ) {
      await adminClient
        .from("worker_premium_payments")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("reference", reference)
        .eq("status", "pending");

      console.error("Paystack initialization failed.");
      return jsonResponse({ error: "Paystack could not start checkout. Please try again." }, 502);
    }

    return jsonResponse({
      success: true,
      reference,
      authorization_url: paystackResult.data.authorization_url,
      plan_type: plan.plan_type,
      amount_kobo: plan.amount_kobo,
    });
  } catch (error) {
    console.error("Worker Premium initialization failed:", error);
    return jsonResponse({ error: "An unexpected error occurred. Please try again." }, 500);
  }
});
