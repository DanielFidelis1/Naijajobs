
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: unknown, status = 200) {
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
    return respond({ error: "Method not allowed." }, 405);
  }

  const expectedSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  const suppliedSecret = req.headers.get("x-webhook-secret");

  if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
    return respond({ error: "Unauthorized." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !vapidPublicKey ||
    !vapidPrivateKey ||
    !vapidSubject
  ) {
    return respond({ error: "Server configuration is incomplete." }, 500);
  }

  let payload: any;

  try {
    payload = await req.json();
  } catch {
    return respond({ error: "Invalid JSON." }, 400);
  }

  const record = payload?.record;

  if (
    payload?.type !== "INSERT" ||
    payload?.table !== "notifications" ||
    payload?.schema !== "public" ||
    typeof record?.id !== "string" ||
    typeof record?.user_id !== "string" ||
    typeof record?.title !== "string" ||
    typeof record?.body !== "string"
  ) {
    return respond({ error: "Invalid notification event." }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh_key, auth_key")
      .eq("user_id", record.user_id);

    if (error) {
      console.error("Subscription lookup failed:", error.message);
      return respond({ error: "Could not load subscriptions." }, 500);
    }

    let sent = 0;
    let failed = 0;
    const expiredIds: string[] = [];

    for (const subscription of subscriptions ?? []) {
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
            title: record.title,
            body: record.body,
            url: record.link || "/dashboard.html",
            tag: `notification-${record.id}`,
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

        console.error("Push delivery failed:", statusCode);
      }
    }

    if (expiredIds.length) {
      const { error: cleanupError } = await supabase
        .from("push_subscriptions")
        .delete()
        .in("id", expiredIds);

      if (cleanupError) {
        console.error("Expired subscription cleanup failed.");
      }
    }

    return respond({ success: true, sent, failed });
  } catch (error) {
    console.error("Push sender error:", error);
    return respond({ error: "Push delivery failed." }, 500);
  }
});
