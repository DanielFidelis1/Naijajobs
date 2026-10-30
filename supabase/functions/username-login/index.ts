// Supabase Edge Function: username-login
// Looks up a username server-side, then delegates password verification to Supabase Auth.
// Never return whether a username exists; use the same message for all login failures.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Use POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    console.error("Username login is missing required Supabase environment variables.");
    return reply({ error: "Login is temporarily unavailable. Please use your email or try again later." }, 500);
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Invalid username or password." }, 400);
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username) || !password || password.length > 256) {
    return reply({ error: "Invalid username or password." }, 400);
  }

  try {
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("email")
      .eq("username", username)
      .maybeSingle();

    if (profileError || !profile?.email) {
      // Do not disclose whether a username exists.
      return reply({ error: "Invalid username or password." }, 401);
    }

    const auth = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await auth.auth.signInWithPassword({
      email: profile.email,
      password,
    });

    if (error || !data.session) {
      return reply({ error: "Invalid username or password." }, 401);
    }

    return reply({ session: data.session });
  } catch (error) {
    console.error("Username login failed:", error);
    return reply({ error: "Login is temporarily unavailable. Please try again." }, 500);
  }
});
