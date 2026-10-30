// Supabase Edge Function: send-notification-email
// A Database Webhook calls this every time a row is added to "notifications".
// It emails the person (unless they switched email alerts off) using Resend.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildEmail } from "./email.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });

  // Only our own webhook knows this secret.
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload || payload.type !== "INSERT" || payload.table !== "notifications" || !payload.record) {
    return new Response("Ignored", { status: 200 });
  }
  const record = payload.record;

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const siteUrl = Deno.env.get("SITE_URL");
  const fromEmail = Deno.env.get("FROM_EMAIL");
  if (!resendKey || !siteUrl || !fromEmail) {
    console.error("Missing RESEND_API_KEY, SITE_URL or FROM_EMAIL");
    return new Response("Not configured", { status: 500 });
  }

  const admin = createClient(url, serviceKey);

  // Respect the profile switch.
  const { data: profile } = await admin
    .from("profiles")
    .select("email_alerts")
    .eq("id", record.user_id)
    .maybeSingle();
  if (profile && profile.email_alerts === false) {
    return new Response("Skipped: alerts off", { status: 200 });
  }

  const { data: userData } = await admin.auth.admin.getUserById(record.user_id);
  const to = userData?.user?.email;
  if (!to) return new Response("Skipped: no email", { status: 200 });

  const email = buildEmail(record, siteUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromEmail, to: [to], subject: email.subject, html: email.html, text: email.text }),
  });
  if (!response.ok) {
    console.error("Resend error:", response.status, await response.text());
    return new Response("Email failed", { status: 502 });
  }
  return new Response("Sent", { status: 200 });
});
