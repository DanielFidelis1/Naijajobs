
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

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
      .select("is_suspended")
      .eq("id", recipientId)
      .maybeSingle();

    if (recipientError || !recipient || recipient.is_suspended) {
      return respond({ success: true, sent: 0, reason: "Recipient unavailable." });
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

    return respond({ success: true, sent, failed });
  } catch (error) {
    console.error("Message push sender error:", error);
    return respond({ error: "Message push delivery failed." }, 500);
  }
});
