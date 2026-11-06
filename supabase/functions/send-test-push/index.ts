
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
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
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authorization = req.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Please sign in first." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");

  if (
    !supabaseUrl ||
    !anonKey ||
    !vapidPublicKey ||
    !vapidPrivateKey ||
    !vapidSubject
  ) {
    return jsonResponse({ error: "Push sender configuration is incomplete." }, 500);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return jsonResponse({ error: "Your session is invalid. Please sign in again." }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_suspended")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.is_suspended) {
    return jsonResponse({ error: "Your account cannot send a test notification." }, 403);
  }

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh_key, auth_key")
      .eq("user_id", userData.user.id);

    if (subscriptionError) {
      return jsonResponse({ error: "Could not load your push subscriptions." }, 500);
    }

    if (!subscriptions?.length) {
      return jsonResponse({ error: "No saved subscriptions found. Enable notifications first." }, 404);
    }

    let sent = 0;
    let failed = 0;
    const expiredIds: string[] = [];

    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh_key,
              auth: subscription.auth_key,
            },
          },
          JSON.stringify({
            title: "NaijaJobs test notification",
            body: "Success! Browser push notifications are working.",
            url: "/dashboard.html",
            tag: "naijajobs-test",
          }),
        );
        sent++;
      } catch (error) {
        failed++;
        const statusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? Number(error.statusCode)
            : 0;

        if (statusCode === 404 || statusCode === 410) {
          expiredIds.push(subscription.id);
        }

        console.error("Push delivery failed with status:", statusCode);
      }
    }

    if (expiredIds.length) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("id", expiredIds);
    }

    return jsonResponse({
      success: sent > 0,
      sent,
      failed,
      message: sent > 0
        ? "Test push notification sent."
        : "No notification could be delivered. Check the function logs.",
    });
  } catch (error) {
    console.error("Push sender error:", error);
    return jsonResponse({ error: "Push notification sending failed." }, 500);
  }
});
