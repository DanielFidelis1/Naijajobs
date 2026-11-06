
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Sign in to continue." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ error: "Server configuration error." }, 500);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } =
    await supabase.auth.getUser();

  if (userError || !userData.user) {
    return jsonResponse({ error: "Your session is invalid. Please sign in again." }, 401);
  }

  try {
    const body = await req.json();
    const subscription = body?.subscription;

    if (
      !subscription ||
      typeof subscription.endpoint !== "string" ||
      typeof subscription.keys?.p256dh !== "string" ||
      typeof subscription.keys?.auth !== "string"
    ) {
      return jsonResponse({ error: "Invalid browser subscription." }, 400);
    }

    if (
      !subscription.endpoint.startsWith("https://") ||
      subscription.endpoint.length > 4096 ||
      subscription.keys.p256dh.length > 512 ||
      subscription.keys.auth.length > 512
    ) {
      return jsonResponse({ error: "Invalid subscription details." }, 400);
    }

    const { error: saveError } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userData.user.id,
          endpoint: subscription.endpoint,
          p256dh_key: subscription.keys.p256dh,
          auth_key: subscription.keys.auth,
          user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );

    if (saveError) {
      console.error("Could not save push subscription:", saveError.message);
      return jsonResponse({ error: "Could not save your notification subscription." }, 500);
    }

    return jsonResponse({ success: true });
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }
});
