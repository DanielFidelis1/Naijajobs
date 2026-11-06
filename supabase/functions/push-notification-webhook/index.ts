import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as webpush from "https://esm.sh/web-push@3.6.7";

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
  const fcmServiceAccountJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");

  if (!supabaseUrl || !serviceRoleKey) {
    return respond(
      { error: "Supabase server configuration is incomplete." },
      500,
    );
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
    const notification = {
      id: record.id,
      title: record.title,
      body: record.body,
      link: typeof record.link === "string" ? record.link : "/dashboard.html",
    };

    // 1. Browser Web Push delivery.
    let sent = 0;
    let failed = 0;
    const expiredIds: string[] = [];

    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      console.error("Browser push configuration is incomplete.");
    } else {
      try {
        webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

        const { data: subscriptions, error: subscriptionError } = await supabase
          .from("push_subscriptions")
          .select("id, endpoint, p256dh_key, auth_key")
          .eq("user_id", record.user_id);

        if (subscriptionError) {
          console.error(
            "Subscription lookup failed:",
            subscriptionError.message,
          );
          failed++;
        } else {
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
                  title: notification.title,
                  body: notification.body,
                  url: notification.link,
                  tag: `notification-${notification.id}`,
                }),
              );

              sent++;
            } catch (error) {
              failed++;

              const statusCode = typeof error === "object" && error !== null &&
                  "statusCode" in error
                ? Number(error.statusCode)
                : 0;

              if (statusCode === 404 || statusCode === 410) {
                expiredIds.push(subscription.id);
              }

              console.error("Browser push delivery failed:", statusCode);
            }
          }

          if (expiredIds.length) {
            const { error: cleanupError } = await supabase
              .from("push_subscriptions")
              .delete()
              .in("id", expiredIds);

            if (cleanupError) {
              console.error("Expired browser subscription cleanup failed.");
            }
          }
        }
      } catch (error) {
        failed++;
        console.error("Browser push setup failed:", error);
      }
    }

    // 2. Android Firebase Cloud Messaging delivery.
    let androidSent = 0;
    let androidFailed = 0;
    const expiredDeviceTokens: string[] = [];

    const { data: androidDevices, error: deviceError } = await supabase
      .from("device_push_tokens")
      .select("id, token")
      .eq("user_id", record.user_id)
      .eq("platform", "android");

    if (deviceError) {
      console.error("Android device lookup failed:", deviceError.message);
      androidFailed++;
    } else if ((androidDevices ?? []).length > 0) {
      if (!fcmServiceAccountJson) {
        console.error("FCM_SERVICE_ACCOUNT_JSON secret is missing.");
        androidFailed += androidDevices!.length;
      } else {
        try {
          const serviceAccount = JSON.parse(fcmServiceAccountJson);
          const accessToken = await getGoogleAccessToken(serviceAccount);

          for (const device of androidDevices ?? []) {
            try {
              const result = await sendAndroidPush(
                accessToken,
                serviceAccount.project_id,
                device.token,
                notification,
              );

              if (result.success) {
                androidSent++;
              } else {
                androidFailed++;

                if (result.unregistered) {
                  expiredDeviceTokens.push(device.id);
                }

                console.error("Android push delivery failed:", result.status);
              }
            } catch (error) {
              androidFailed++;
              console.error("Android push delivery error:", error);
            }
          }
        } catch (error) {
          androidFailed += androidDevices!.length;
          console.error("Firebase setup or authentication failed:", error);
        }
      }
    }

    if (expiredDeviceTokens.length) {
      const { error: cleanupError } = await supabase
        .from("device_push_tokens")
        .delete()
        .in("id", expiredDeviceTokens);

      if (cleanupError) {
        console.error("Expired Android token cleanup failed.");
      }
    }

    return respond({
      success: true,
      sent,
      failed,
      androidSent,
      androidFailed,
    });
  } catch (error) {
    console.error("Push sender error:", error);
    return respond({ error: "Push delivery failed." }, 500);
  }
});
