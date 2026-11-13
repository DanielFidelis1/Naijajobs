
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";
// Firebase OAuth token cache (kept in memory while this function instance runs).
let cachedGoogleAccessToken = "";
let cachedGoogleTokenExpiry = 0;

function base64UrlEncode(value: string | Uint8Array): string {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function pemToBytes(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function getGoogleAccessToken(serviceAccount: any): Promise<string> {
  if (
    cachedGoogleAccessToken &&
    Date.now() < cachedGoogleTokenExpiry - 60_000
  ) {
    return cachedGoogleAccessToken;
  }

  if (
    typeof serviceAccount.client_email !== "string" ||
    typeof serviceAccount.private_key !== "string" ||
    typeof serviceAccount.token_uri !== "string" ||
    typeof serviceAccount.project_id !== "string"
  ) {
    throw new Error("Firebase service-account configuration is invalid.");
  }

  const now = Math.floor(Date.now() / 1000);

  const header = base64UrlEncode(JSON.stringify({
    alg: "RS256",
    typ: "JWT",
  }));

  const claims = base64UrlEncode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: serviceAccount.token_uri,
    iat: now,
    exp: now + 3600,
  }));

  const unsignedJwt = `${header}.${claims}`;

  const privateKeyBytes = pemToBytes(serviceAccount.private_key);

  const privateKeyBuffer = new ArrayBuffer(privateKeyBytes.byteLength);
  new Uint8Array(privateKeyBuffer).set(privateKeyBytes);

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBuffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(unsignedJwt),
  );

  const assertion = `${unsignedJwt}.${
    base64UrlEncode(
      new Uint8Array(signature),
    )
  }`;

  const response = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const result = await response.json();

  if (!response.ok || typeof result.access_token !== "string") {
    console.error("Firebase OAuth authentication failed:", response.status);
    throw new Error("Could not authenticate with Firebase.");
  }

  cachedGoogleAccessToken = result.access_token;
  cachedGoogleTokenExpiry = Date.now() +
    Number(result.expires_in || 3600) * 1000;

  return cachedGoogleAccessToken;
}

async function sendAndroidPush(
  accessToken: string,
  projectId: string,
  deviceToken: string,
  notification: { id: string; title: string; body: string; link: string },
) {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: {
            title: notification.title,
            body: notification.body,
          },
          data: {
            link: notification.link,
            notificationId: notification.id,
          },
        },
      }),
    },
  );

  let result: any = {};
  try {
    result = await response.json();
  } catch {
    // Keep the HTTP status as the delivery result.
  }

  const errorDetails = Array.isArray(result?.error?.details)
    ? result.error.details
    : [];

  const unregistered = errorDetails.some(
    (detail: any) => detail?.errorCode === "UNREGISTERED",
  );

  return {
    success: response.ok,
    unregistered,
    status: response.status,
  };
}
function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return respond({ error: "Method not allowed." }, 405);
  }

  const expectedSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  const suppliedSecret = req.headers.get("x-webhook-secret");

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return respond({ error: "Unauthorized." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT");
  const fcmServiceAccountJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");

  if (!supabaseUrl || !serviceRoleKey || !publicKey || !privateKey || !subject) {
    return respond({ error: "Server configuration is incomplete." }, 500);
  }

  let payload: any;

  try {
    payload = await req.json();
  } catch {
    return respond({ error: "Invalid JSON." }, 400);
  }

  const message = payload?.record;

  if (
    payload?.type !== "INSERT" ||
    payload?.table !== "messages" ||
    payload?.schema !== "public" ||
    typeof message?.id !== "string" ||
    typeof message?.conversation_id !== "string" ||
    typeof message?.sender_id !== "string"
  ) {
    return respond({ error: "Invalid message event." }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Verify the inserted message still belongs to a valid conversation.
    const { data: savedMessage, error: messageError } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id")
      .eq("id", message.id)
      .eq("conversation_id", message.conversation_id)
      .eq("sender_id", message.sender_id)
      .maybeSingle();

    if (messageError || !savedMessage) {
      return respond({ error: "Message could not be verified." }, 403);
    }

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id, participant_one, participant_two, application_id")
      .eq("id", message.conversation_id)
      .maybeSingle();

    if (conversationError || !conversation) {
      return respond({ error: "Conversation not found." }, 404);
    }

    const senderIsParticipant =
      conversation.participant_one === message.sender_id ||
      conversation.participant_two === message.sender_id;

    if (!senderIsParticipant) {
      return respond({ error: "Sender is not a conversation participant." }, 403);
    }

    // Do not send a push to the sender.
    const recipientId =
      conversation.participant_one === message.sender_id
        ? conversation.participant_two
        : conversation.participant_one;

    // Check that the recipient still has an active profile.
    const { data: recipient, error: recipientError } = await supabase
      .from("profiles")
      .select("is_suspended, push_notifications_enabled")
      .eq("id", recipientId)
      .maybeSingle();

    if (recipientError || !recipient || recipient.is_suspended) {
      return respond({ success: true, sent: 0, reason: "Recipient unavailable." });
    }

    // Respect the recipient's independent push notification preference.
    if (recipient.push_notifications_enabled !== true) {
      return respond({
        success: true,
        sent: 0,
        skipped: true,
        reason: "Recipient has disabled push notifications.",
      });
    }

    // Resolve the conversation destination without exposing message contents.
    let targetUrl = "/messages.html";

    
if (!conversation.application_id) {
  return respond({
    success: true,
    sent: 0,
    reason: "Conversation has no linked application.",
  });
}

const { data: application, error: applicationError } = await supabase
  .from("applications")
  .select("id, status, user_id, job_id")
  .eq("id", conversation.application_id)
  .maybeSingle();

if (applicationError || !application || application.status !== "accepted") {
  return respond({
    success: true,
    sent: 0,
    reason: "Chat is no longer active.",
  });
}

const { data: job, error: jobError } = await supabase
  .from("jobs")
  .select("id, user_id")
  .eq("id", application.job_id)
  .maybeSingle();

if (jobError || !job) {
  return respond({
    success: true,
    sent: 0,
    reason: "Linked job could not be verified.",
  });
}

const participants = [
  conversation.participant_one,
  conversation.participant_two,
];

const applicationMatchesConversation =
  participants.includes(application.user_id) &&
  participants.includes(job.user_id) &&
  application.user_id !== job.user_id;

if (!applicationMatchesConversation) {
  return respond({
    error: "Conversation participants do not match the accepted application.",
  }, 403);
}
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh_key, auth_key")
      .eq("user_id", recipientId);

    if (subscriptionError) {
      return respond({ error: "Could not load recipient subscriptions." }, 500);
    }

    let sent = 0;
    let failed = 0;
    const expiredIds: string[] = [];
    let mobileSent = 0;
    let mobileFailed = 0;

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
            title: "New NaijaJobs message",
            body: "You have received a new message. Open NaijaJobs to read it.",
            url: targetUrl,
            tag: `message-${message.id}`,
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

        console.error("Message push delivery failed:", statusCode);
      }
    }

    if (expiredIds.length) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("id", expiredIds);
    }

        // Send mobile push notifications to registered Android and iOS devices.
    if (!fcmServiceAccountJson) {
      console.error("FCM_SERVICE_ACCOUNT_JSON is not configured.");
      mobileFailed++;
    } else {
      try {
        const serviceAccount = JSON.parse(fcmServiceAccountJson);
        const accessToken = await getGoogleAccessToken(serviceAccount);

        const { data: mobileDevices, error: mobileDeviceError } =
          await supabase
            .from("device_push_tokens")
            .select("id, token")
            .eq("user_id", recipientId)
            .in("platform", ["android", "ios"]);

        if (mobileDeviceError) {
          console.error("Could not load mobile devices:", mobileDeviceError.message);
          mobileFailed++;
        } else {
          for (const device of mobileDevices ?? []) {
            try {
              await sendAndroidPush(
                accessToken,
                serviceAccount.project_id,
                device.token,
                {
                  id: message.id,
                  title: "New NaijaJobs message",
                  body: "You have received a new message. Open NaijaJobs to read it.",
                  link: targetUrl,
                },
              );

              mobileSent++;
            } catch (error) {
              mobileFailed++;
              console.error("Mobile message push failed:", error);

              const errorMessage = String(error);

              if (
                errorMessage.includes("UNREGISTERED") ||
                errorMessage.includes("registration-token-not-registered")
              ) {
                await supabase
                  .from("device_push_tokens")
                  .delete()
                  .eq("id", device.id);
              }
            }
          }
        }
      } catch (error) {
        mobileFailed++;
        console.error("Mobile push setup failed:", error);
      }
    }

    return respond({
      success: true,
      sent,
      failed,
      mobileSent,
      mobileFailed,
    });
  } catch (error) {
    console.error("Message push sender error:", error);
    return respond({ error: "Message push delivery failed." }, 500);
  }
});
