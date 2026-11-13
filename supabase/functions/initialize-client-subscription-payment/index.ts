
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });

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

    // Validate the signed-in user.
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

    if (userError || !user || !user.email) {
      return json({
        error: "Your session is invalid. Please sign in again.",
      }, 401);
    }

    const body = await req.json().catch(() => null);
    const plan: unknown = body?.plan;

    const plans = {
      starter: {
        amount: 500000,
        monthlyPostLimit: 20,
        featuredCredits: 2,
      },
      business: {
        amount: 1500000,
        monthlyPostLimit: null,
        featuredCredits: 5,
      },
    } as const;

    if (plan !== "starter" && plan !== "business") {
      return json({ error: "Choose a valid paid client plan." }, 400);
    }

    const selectedPlan = plans[plan];

    // Use service role only after validating the signed-in user.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("account_type, is_suspended")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("Client profile lookup failed:", profileError);
      return json({ error: "Could not verify your account." }, 500);
    }

    if (profile.account_type !== "client" || profile.is_suspended) {
      return json(
        { error: "Only active client accounts can purchase these plans." },
        403,
      );
    }
    // Check whether this user already has a pending payment.
    const { data: pendingPayment, error: pendingError } = await adminClient
      .from("client_subscriptions")
      .select("id, plan_type, payment_reference")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingError) {
      console.error("Pending payment lookup failed:", pendingError);
      return json({
        error: "Could not check your previous payment. Please try again.",
      }, 500);
    }

    if (pendingPayment) {
      // Verify the existing transaction before allowing another checkout.
      const previousPaymentResponse = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(
          pendingPayment.payment_reference
        )}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${paystackSecret}`,
            "Content-Type": "application/json",
          },
        },
      );

      const previousPaymentResult = await previousPaymentResponse.json();

      const previousMessage =
  typeof previousPaymentResult?.message === "string"
    ? previousPaymentResult.message
    : "";

const referenceNotFound =
  previousPaymentResponse.status === 404 &&
  /reference.*not found|not found.*reference/i.test(previousMessage);

  if (referenceNotFound) {
  const { error: missingPaymentError } = await adminClient
    .from("client_subscriptions")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", pendingPayment.id)
    .eq("user_id", user.id)
    .eq("status", "pending");

  if (missingPaymentError) {
    console.error(
      "Could not close missing Paystack transaction:",
      missingPaymentError
    );

    return json({
      error: "Your previous payment could not be closed safely. Please contact support.",
    }, 500);
  }
  return json({
  error: "Your previous checkout could not be found and has been safely closed. Please try again to start a new payment.",
  previousPaymentClosed: true,
}, 409);
}


      if (
        !previousPaymentResponse.ok ||
        !previousPaymentResult.status ||
        !previousPaymentResult.data
      ) {
        console.error("Previous Paystack payment lookup failed:", {
          status: previousPaymentResponse.status,
          message: previousPaymentResult.message,
        });

        return json({
          error: "We could not confirm your previous payment. Please try again later.",
        }, 502);
      }

      const previousStatus = previousPaymentResult.data.status;

      const previousTransaction = previousPaymentResult.data;

const expectedPreviousAmount =
  pendingPayment.plan_type === "starter"
    ? 500000
    : pendingPayment.plan_type === "business"
      ? 1500000
      : null;

if (
  previousTransaction.reference !== pendingPayment.payment_reference ||
  previousTransaction.currency !== "NGN" ||
  expectedPreviousAmount === null ||
  previousTransaction.amount !== expectedPreviousAmount
) {
  console.error("Previous Paystack transaction details do not match:", {
    referenceMatches:
      previousTransaction.reference === pendingPayment.payment_reference,
    currency: previousTransaction.currency,
    amount: previousTransaction.amount,
    expectedAmount: expectedPreviousAmount,
  });

  return json({
    error: "Your previous payment details could not be verified safely. Please contact support before trying again.",
  }, 409);
}

      if (previousStatus === "success") {
    const recoveryResponse = await fetch(
        `${supabaseUrl}/functions/v1/verify-client-subscription-payment`,
        {
            method: "POST",
            headers: {
                Authorization: authorization,
                apikey: anonKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                reference: pendingPayment.payment_reference,
            }),
        },
    );

    const recoveryResult = await recoveryResponse.json();

    if (!recoveryResponse.ok || recoveryResult.success !== true) {
        console.error("Previous payment recovery failed:", {
            status: recoveryResponse.status,
            error: recoveryResult.error,
        });

        return json({
            error: "Your previous payment was successful, but activation could not be confirmed. Please contact support before paying again.",
        }, 409);
    }

    return json({
        error: "Your previous payment has been verified and your membership updated. Refresh your dashboard before continuing.",
        recovered: true,
        plan: recoveryResult.plan,
    }, 409);
}

      if (
        previousStatus !== "failed" &&
        previousStatus !== "abandoned" &&
        previousStatus !== "reversed"
      ) {
        return json({
          error: "You already have a payment in progress. Please complete it before starting another checkout.",
        }, 409);
      }

      // Only confirmed failed, abandoned, or reversed payments can be cancelled.
      const { error: cancelError } = await adminClient
        .from("client_subscriptions")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", pendingPayment.id)
        .eq("user_id", user.id)
        .eq("status", "pending");

      if (cancelError) {
        console.error("Could not cancel previous payment:", cancelError);
        return json({
          error: "Your previous payment could not be closed safely. Please contact support.",
        }, 500);
      }
    }

    // Find the current active, unexpired subscription.
    const { data: activeSubscription, error: activeError } = await adminClient
      .from("client_subscriptions")
      .select("id, plan_type, expires_at, featured_credits_remaining")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (activeError) {
      console.error("Active subscription lookup failed:", activeError);
      return json({
        error: "Could not check your current subscription.",
      }, 500);
    }

    // Enforce the Client upgrade rules.
    if (activeSubscription) {
      if (activeSubscription.plan_type === "business") {
        return json({
          error: "You already have an active Business subscription. You cannot purchase another Business plan or downgrade while it is active.",
        }, 409);
      }

      if (activeSubscription.plan_type === "starter" && plan === "starter") {
        return json({
          error: "You already have an active Starter subscription. You can upgrade to Business instead.",
        }, 409);
      }

      if (
        activeSubscription.plan_type !== "starter" &&
        activeSubscription.plan_type !== "business"
      ) {
        return json({
          error: "Your current subscription could not be recognised. Please contact support.",
        }, 409);
      }

      // The only permitted active-plan purchase is Starter -> Business.
      if (
        activeSubscription.plan_type === "starter" &&
        plan !== "business"
      ) {
        return json({
          error: "Only an upgrade from Starter to Business is allowed while your subscription is active.",
        }, 409);
      }
    }
    
    const requestOrigin = req.headers.get("Origin");

    const allowedOrigins = [
      "https://danielfidelis1.github.io",
      "http://127.0.0.1:5500",
      "http://localhost:5500",
    ];

    if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) {
      return json({ error: "Unrecognized website address." }, 403);
    }

    const callbackUrl =
      requestOrigin === "https://danielfidelis1.github.io"
        ? `${requestOrigin}/Naijajobs/dashboard.html?client_subscription=verify`
        : `${requestOrigin}/dashboard.html?client_subscription=verify`;

    const reference = `client_${crypto.randomUUID().replaceAll("-", "")}`;

    // Create the pending record before initializing Paystack.
// The database index prevents duplicate pending records.
const { error: insertError } = await adminClient
  .from("client_subscriptions")
  .insert({
    user_id: user.id,
    plan_type: plan,
    status: "pending",
    started_at: null,
    expires_at: null,
    monthly_post_limit: selectedPlan.monthlyPostLimit,
    featured_credits_remaining: selectedPlan.featuredCredits,
    payment_reference: reference,
  });

if (insertError) {
  console.error("Pending subscription insert failed:", insertError);

  if (insertError.code === "23505") {
    return json({
      error: "Another payment is already pending. Please resolve it before starting another checkout.",
    }, 409);
  }

  return json({
    error: "Could not prepare your payment. Please try again.",
  }, 500);
}

    // Initialize the transaction with Paystack.
    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          amount: selectedPlan.amount,
          currency: "NGN",
          reference,
          callback_url: callbackUrl,
          metadata: {
            user_id: user.id,
            plan_type: plan,
            payment_type: "client_subscription",
          },
        }),
      },
    );

    const paystackResult = await paystackResponse.json();

    
    
    if (
      !paystackResponse.ok ||
      !paystackResult.status ||
      !paystackResult.data?.authorization_url
    ) {
      // Cancel only when Paystack explicitly rejects the request.
      if (
        paystackResponse.status >= 400 &&
        paystackResponse.status < 500 &&
        ![408, 409, 429].includes(paystackResponse.status)
      ) {
        const { error: cancelError } = await adminClient
          .from("client_subscriptions")
          .update({
            status: "cancelled",
            updated_at: new Date().toISOString(),
          })
          .eq("payment_reference", reference)
          .eq("user_id", user.id)
          .eq("status", "pending");

        if (cancelError) {
          console.error("Could not cancel rejected checkout:", cancelError);
        }
      } else {
        console.error(
          "Paystack initialization outcome is uncertain. Pending record retained.",
          { status: paystackResponse.status }
        );
      }

      console.error("Paystack initialization failed:", {
        status: paystackResponse.status,
        message: paystackResult.message,
      });

      return json({
        error: "Paystack could not confirm checkout initialization. Please try again shortly.",
      }, 502);
    }

    return json({
      authorization_url: paystackResult.data.authorization_url,
      reference,
    });
  } catch (error) {
    console.error("Client subscription initialization error:", error);

    return json({
      error: "An unexpected payment error occurred.",
    }, 500);
  }
});
