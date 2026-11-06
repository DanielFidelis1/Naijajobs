
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
    const reference = body?.reference;

    if (
      typeof reference !== "string" ||
      !/^njwp_[0-9a-f-]{36}$/i.test(reference)
    ) {
      return jsonResponse({ error: "Invalid payment reference." }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: payment, error: paymentError } = await adminClient
      .from("worker_premium_payments")
      .select("id, user_id, reference, plan_type, amount_kobo, currency, status")
      .eq("reference", reference)
      .maybeSingle();

    if (paymentError) {
      console.error("Could not retrieve the Premium payment.");
      return jsonResponse({ error: "Could not check your payment." }, 500);
    }

    if (!payment || payment.user_id !== user.id) {
      return jsonResponse({ error: "Payment not found for this account." }, 404);
    }

    if (payment.status === "paid") {
      return jsonResponse({
        success: true,
        already_activated: true,
        message: "Worker Premium is already activated.",
      });
    }

    if (payment.status !== "pending") {
      return jsonResponse({ error: "This payment is no longer pending." }, 400);
    }

    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${paystackSecret}` },
      },
    );

    const paystackResult = await paystackResponse.json().catch(() => null);
    const transaction = paystackResult?.data;

    if (!paystackResponse.ok || paystackResult?.status !== true || !transaction) {
      console.error("Paystack verification request failed.");
      return jsonResponse({ error: "Could not verify payment with Paystack. Please try again." }, 502);
    }

    if (
      transaction.reference !== reference ||
      transaction.status !== "success" ||
      transaction.amount !== payment.amount_kobo ||
      transaction.currency !== payment.currency ||
      transaction.metadata?.payment_type !== "worker_premium" ||
      transaction.metadata?.user_id !== user.id ||
      transaction.metadata?.plan_type !== payment.plan_type
    ) {
      if (transaction.reference === reference && transaction.status === "abandoned") {
        await adminClient
          .from("worker_premium_payments")
          .update({ status: "abandoned", updated_at: new Date().toISOString() })
          .eq("reference", reference)
          .eq("status", "pending");
      }

      return jsonResponse({
        error: "Payment is not confirmed as successful. No Premium subscription was activated.",
      }, 400);
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("account_type, is_suspended")
      .eq("id", user.id)
      .maybeSingle();

    if (
      profileError ||
      !profile ||
      !["worker", "job_seeker"].includes(profile.account_type) ||
      profile.is_suspended
    ) {
      return jsonResponse({
        error: "Your account is not eligible for Worker Premium activation.",
      }, 403);
    }

    const { data: activationResult, error: activationError } = await adminClient.rpc(
      "activate_worker_premium_payment",
      {
        p_reference: reference,
        p_verified_amount_kobo: transaction.amount,
        p_verified_currency: transaction.currency,
        p_verified_status: transaction.status,
      },
    );

    if (activationError || !activationResult?.success) {
      console.error("Premium activation failed after verification.");
      return jsonResponse({
        error: "Payment was verified, but Premium activation needs attention. Contact support with your payment reference.",
        reference,
      }, 500);
    }

    return jsonResponse({
      success: true,
      plan_type: payment.plan_type,
      expires_at: activationResult.expires_at ?? null,
      message: "Your Worker Premium payment was verified and activated.",
    });
  } catch (error) {
    console.error("Worker Premium verification failed:", error);
    return jsonResponse({ error: "An unexpected error occurred. Please try again." }, 500);
  }
});
