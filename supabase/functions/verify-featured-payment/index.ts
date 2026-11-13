
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return reply({ success: false, error: "Use POST." }, 405);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");

    if (!url || !serviceKey || !paystackSecret) {
      return reply({ success: false, error: "Payments are not configured." }, 500);
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return reply({ success: false, error: "Please log in again." }, 401);
    }

    const admin = createClient(url, serviceKey);

    const { data: userData, error: authError } =
      await admin.auth.getUser(authorization.slice(7));

    const user = userData?.user;

    if (authError || !user) {
      return reply({ success: false, error: "Please log in again." }, 401);
    }

    let body: { reference?: string };

    try {
      body = await req.json();
    } catch {
      return reply({ success: false, error: "Invalid request." }, 400);
    }

    const reference = String(body.reference ?? "");

    if (!/^njf_[0-9a-f-]{36}$/i.test(reference)) {
      return reply({ success: false, error: "Invalid payment reference." }, 400);
    }

    // Retrieve the original pending payment. Never trust the browser
    // to supply the job ID, amount or promotion duration.
    const { data: payment, error: paymentError } = await admin
      .from("featured_job_payments")
      .select("id, user_id, job_id, reference, amount_kobo, currency, duration_days, status")
      .eq("reference", reference)
      .eq("user_id", user.id)
      .maybeSingle();

    if (paymentError) {
      console.error("Payment lookup failed:", paymentError);
      return reply({ success: false, error: "Could not check your payment." }, 500);
    }

    if (!payment) {
      return reply({ success: false, error: "Payment record not found." }, 404);
    }

    if (payment.status === "paid") {
      return reply({ success: true, already_processed: true });
    }

    if (payment.status !== "pending") {
      return reply({ success: false, error: "This payment is not pending." }, 400);
    }
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("is_suspended")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || profile.is_suspended) {
      return reply({
        success: false,
        error: "Your account cannot complete this payment. Please contact support.",
      }, 403);
    }

    if (
      payment.currency !== "NGN" ||
      payment.amount_kobo !== 150000 ||
      payment.duration_days !== 7 ||
      !payment.job_id
    ) {
      return reply({ success: false, error: "Payment details do not match the featured-job plan." }, 400);
    }

    // Confirm the original job and payer metadata with Paystack.
    const verifyResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${paystackSecret}` },
      },
    );

    const paystack = await verifyResponse.json().catch(() => null);
    const transaction = paystack?.data;
    const metadata = transaction?.metadata ?? {};

    if (
      !verifyResponse.ok ||
      paystack?.status !== true ||
      transaction?.status !== "success" ||
      transaction?.reference !== reference ||
      transaction?.amount !== payment.amount_kobo ||
      transaction?.currency !== "NGN" ||
      String(metadata.user_id) !== user.id ||
      String(metadata.job_id) !== payment.job_id ||
      metadata.purpose !== "featured_job" ||
      Number(metadata.duration_days) !== payment.duration_days
    ) {
      return reply({ success: false, error: "Paystack could not confirm this payment." }, 402);
    }

    // Activate payment and feature the job atomically in PostgreSQL.
    const { data: activation, error: activationError } = await admin.rpc(
      "activate_featured_job_payment",
      {
        p_reference: reference,
        p_verified_amount_kobo: transaction.amount,
        p_verified_currency: transaction.currency,
        p_verified_status: transaction.status,
      },
    );

    if (activationError) {
      console.error("Featured payment activation failed:", activationError);
      return reply({
        success: false,
        error: "Payment was received but the job could not yet be featured. Please contact support with reference: " + reference,
      }, 500);
    }

    return reply({
      success: true,
      already_processed: activation?.already_processed === true,
    });
  } catch (error) {
    console.error("Featured payment verification error:", error);
    return reply({ success: false, error: "An unexpected verification error occurred." }, 500);
  }
});
