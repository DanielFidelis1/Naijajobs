
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
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Sign in to continue." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Missing Supabase server configuration.");
    return jsonResponse({ error: "Server configuration error." }, 500);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: userData, error: userError } =
    await authClient.auth.getUser();

  if (userError || !userData.user) {
    return jsonResponse({
      error: "Your session is invalid. Please sign in again.",
    }, 401);
  }
    const { data: isActive, error: activeError } =
    await authClient.rpc("is_active_user");

  if (activeError) {
    console.error("Could not verify account status:", activeError.message);
    return jsonResponse({
      error: "Could not verify your account status.",
    }, 500);
  }

  if (isActive !== true) {
    return jsonResponse({
      error: "Your account is suspended or inactive.",
    }, 403);
  }

  try {
    const body = await req.json();

    const token = body?.token;
    const platform = body?.platform;

    if (
      typeof token !== "string" ||
      token.trim().length < 10 ||
      token.length > 4096
    ) {
      return jsonResponse({ error: "Invalid device token." }, 400);
    }

    if (platform !== "android" && platform !== "ios") {
      return jsonResponse({ error: "Invalid device platform." }, 400);
    }

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { error: saveError } = await adminClient
      .from("device_push_tokens")
      .upsert(
        {
          user_id: userData.user.id,
          token: token.trim(),
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "token" }
      );

    if (saveError) {
      console.error("Device token save failed:", saveError.message);
      return jsonResponse({
        error: "Could not register this device.",
      }, 500);
    }

    return jsonResponse({ success: true });

  } catch (error) {
    console.error("Device registration error:", error);
    return jsonResponse({ error: "Invalid request body." }, 400);
  }
});
