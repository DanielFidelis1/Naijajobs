
// Supabase Edge Function: send-notification-email
// Emails notification recipients through Resend.
// Respects both the master email switch and individual preferences.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildEmail } from "./email.ts";

const preferenceMap: Record<string, string> = {
  application: "applications",
  application_accepted: "application_updates",
  application_rejected: "application_updates",
  message: "messages",
  job_completed: "job_completed",
  review: "reviews",
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Use POST", { status: 405 });
  }

  // Verify webhook secret.
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = await req.json().catch(() => null);

  if (
    !payload ||
    payload.type !== "INSERT" ||
    payload.table !== "notifications" ||
    !payload.record
  ) {
    return new Response("Ignored", { status: 200 });
  }

  const record = payload.record;

  if (!record.user_id || !record.type) {
    return new Response("Invalid notification record", { status: 400 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const siteUrl = Deno.env.get("SITE_URL");
  const fromEmail = Deno.env.get("FROM_EMAIL");

  if (!url || !serviceKey || !resendKey || !siteUrl || !fromEmail) {
    console.error("Missing required email configuration");
    return new Response("Not configured", { status: 500 });
  }

  const admin = createClient(url, serviceKey);

  // 1. Check the existing master email preference.
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("email_alerts")
    .eq("id", record.user_id)
    .maybeSingle();

  if (profileError) {
    console.error("Profile preference lookup failed:", profileError);
    return new Response("Preference lookup failed", { status: 500 });
  }

  if (!profile || profile.email_alerts === false) {
    return new Response("Skipped: master email alerts off", {
      status: 200,
    });
  }

  // 2. Check the individual notification preference.
  const preferenceColumn = preferenceMap[record.type];

  if (preferenceColumn) {
    const { data: preferences, error: preferenceError } = await admin
      .from("user_notification_preferences")
      .select(preferenceColumn)
      .eq("user_id", record.user_id)
      .maybeSingle();

    if (preferenceError) {
      console.error("Notification preference lookup failed:", preferenceError);
      return new Response("Preference lookup failed", { status: 500 });
    }

    // If a preference record is missing, do not unexpectedly send email.
    if (!preferences) {
      return new Response("Skipped: preferences not found", {
        status: 200,
      });
    }

    if (preferences[preferenceColumn] === false) {
      return new Response("Skipped: notification category disabled", {
        status: 200,
      });
    }
  }

  // 3. Find the recipient's email address.
  const { data: userData, error: userError } =
    await admin.auth.admin.getUserById(record.user_id);

  if (userError) {
    console.error("Recipient lookup failed:", userError);
    return new Response("Recipient lookup failed", { status: 500 });
  }

  const to = userData?.user?.email;

  if (!to) {
    return new Response("Skipped: no email", { status: 200 });
  }

  // 4. Build and send the email.
  const email = buildEmail(record, siteUrl);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });

  if (!response.ok) {
    console.error("Resend error:", response.status, await response.text());
    return new Response("Email failed", { status: 502 });
  }

  return new Response("Sent", { status: 200 });
});
