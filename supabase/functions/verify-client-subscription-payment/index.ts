
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !paystackSecret) {
      console.error("A required server environment variable is missing.");
      return json({ error: "Payment service is not configured." }, 500);
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "Please sign in first." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "Please sign in again." }, 401);
    }

    const body = await req.json().catch(() => null);
    const reference = body?.reference;

    if (
      typeof reference !== "string" ||
      !/^client_[0-9a-f]{32}$/i.test(reference)
    ) {
      return json({ error: "Invalid payment reference." }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Find only the subscription belonging to the signed-in user.
    const { data: subscription, error: subscriptionError } =
      await adminClient
        .from("client_subscriptions")
        .select(
          "id, user_id, plan_type, status, payment_reference, monthly_post_limit, featured_credits_remaining, started_at, expires_at",
        )
        .eq("payment_reference", reference)
        .eq("user_id", user.id)
        .maybeSingle();

    if (subscriptionError) {
      console.error("Subscription lookup failed:", subscriptionError);
      return json({ error: "Could not find your subscription." }, 500);
    }

    if (!subscription) {
      return json({ error: "Subscription not found." }, 404);
    }

    // Make retries safe without activating or crediting twice.
    if (subscription.status === "active") {
      if (
        subscription.expires_at &&
        new Date(subscription.expires_at).getTime() > Date.now()
      ) {
        return json({
          success: true,
          already_verified: true,
          plan: subscription.plan_type,
          expires_at: subscription.expires_at,
          featured_credits_remaining:
            subscription.featured_credits_remaining,
        });
      }

      return json({
        error: "This subscription is no longer active. Contact support if you believe this is incorrect.",
      }, 409);
    }

    // Cancelled payments must never be activated.
if (subscription.status === "cancelled") {
    return json({
        error: "This payment has been cancelled or refunded and cannot activate a subscription.",
    }, 409);
}

// Only pending payments may proceed to verification.
if (subscription.status !== "pending") {
    return json({
        error: "This subscription is not awaiting payment verification.",
    }, 409);
}

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("account_type, is_suspended")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("Profile lookup failed:", profileError);
      return json({ error: "Could not verify your account." }, 500);
    }

    if (profile.account_type !== "client" || profile.is_suspended) {
      return json({
        error: "This account is not eligible to activate a client subscription.",
      }, 403);
    }

    const expectedPlans = {
      starter: { amount: 500000 },
      business: { amount: 1500000 },
    } as const;

    if (
      subscription.plan_type !== "starter" &&
      subscription.plan_type !== "business"
    ) {
      return json({ error: "Invalid subscription plan." }, 400);
    }

    const plan = expectedPlans[subscription.plan_type];

    // Verify the transaction directly against Paystack.
    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          "Content-Type": "application/json",
        },
      },
    );

    const result = await paystackResponse.json();

    if (!paystackResponse.ok || !result.status || !result.data) {
      console.error("Paystack verification request failed:", {
        status: paystackResponse.status,
        message: result.message,
      });

      return json({
        error: "Unable to verify payment right now. Please try again.",
      }, 502);
    }

    const transaction = result.data;

    if (transaction.status !== "success") {
      return json({
        success: false,
        error: "Payment has not been confirmed as successful.",
      }, 402);
    }

    if (
      transaction.reference !== reference ||
      transaction.amount !== plan.amount ||
      transaction.currency !== "NGN"
    ) {
      console.error("Client subscription payment details did not match.");

      return json({
        error: "Payment details did not match this subscription. Please contact support.",
      }, 400);
    }

    // Activate through the secure database transaction.
    // This handles upgrades, credit preservation and duplicate retries.
    const { data: activation, error: activationError } =
      await adminClient.rpc(
        "activate_client_subscription_payment",
        {
          p_user_id: user.id,
          p_payment_reference: reference,
          p_amount: transaction.amount,
          p_currency: transaction.currency,
        },
      );

    if (activationError) {
      console.error("Client subscription activation failed:", {
        message: activationError.message,
        code: activationError.code,
      });

      return json({
        error: "Payment was verified, but subscription activation failed. Please contact support before paying again.",
      }, 500);
    }

    if (!activation || activation.success !== true) {
      console.error("Unexpected subscription activation response:", activation);

      return json({
        error: "Payment was verified, but activation could not be confirmed. Please contact support.",
      }, 500);
    }

    return json({
      success: true,
      already_verified: activation.already_verified === true,
      is_upgrade: activation.is_upgrade === true,
      plan: activation.plan,
      started_at: activation.started_at,
      expires_at: activation.expires_at,
      featured_credits_remaining:
        activation.featured_credits_remaining,
    });
  } catch (error) {
    console.error("Client subscription verification error:", error);

    return json({
      error: "An unexpected verification error occurred.",
    }, 500);
  }
});
