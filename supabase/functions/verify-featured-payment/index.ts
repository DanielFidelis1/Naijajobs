// Supabase Edge Function: verify-featured-payment
// Called by the website after a Paystack payment succeeds. It re-checks the
// payment directly with Paystack (using the SECRET key, which never leaves the
// server) and only then marks the job as featured.
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkPayment, computeFeaturedUntil, priceInKobo } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ ok: false, error: "Use POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!paystackSecret) return reply({ ok: false, error: "Payments are not configured." }, 500);

  const admin = createClient(url, serviceKey);

  // 1. Who is calling?
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return reply({ ok: false, error: "Please log in again." }, 401);

  // 2. What are they asking for?
  let body: { reference?: string; jobId?: string; days?: number };
  try {
    body = await req.json();
  } catch {
    return reply({ ok: false, error: "Bad request." }, 400);
  }
  const reference = String(body.reference ?? "");
  const jobId = String(body.jobId ?? "");
  const days = Number(body.days);
  const amountKobo = priceInKobo(days);
  if (!reference || !jobId || amountKobo === null) {
    return reply({ ok: false, error: "Missing or invalid details." }, 400);
  }

  // 3. Is it their job, and is it still open?
  const { data: job } = await admin
    .from("jobs")
    .select("id, user_id, status, featured_until")
    .eq("id", jobId)
    .maybeSingle();
  if (!job || job.user_id !== user.id) return reply({ ok: false, error: "That is not your job." }, 403);
  if (job.status !== "open") return reply({ ok: false, error: "Only open jobs can be featured." }, 400);

  // 4. Ask Paystack whether the money really arrived.
  const verify = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${paystackSecret}` } },
  );
  const paystack = await verify.json().catch(() => null);
  const check = checkPayment(paystack, { reference, amountKobo, jobId, userId: user.id });
  if (!check.ok) return reply({ ok: false, error: check.reason }, 402);

  // 5. Record the payment. The reference is unique, so a repeat call cannot
  //    feature the job a second time.
  const { error: payError } = await admin.from("payments").insert({
    user_id: user.id,
    job_id: jobId,
    reference,
    amount_kobo: amountKobo,
    plan_days: days,
  });
  if (payError) {
    if (payError.code === "23505") {
      return reply({ ok: true, alreadyProcessed: true, featured_until: job.featured_until });
    }
    console.error("Payment record failed:", payError);
    return reply({ ok: false, error: "Could not record the payment." }, 500);
  }

  // 6. Feature the job.
  const until = computeFeaturedUntil(job.featured_until, days).toISOString();
  const { error: updateError } = await admin
    .from("jobs")
    .update({ featured_until: until })
    .eq("id", jobId);
  if (updateError) {
    console.error("Feature update failed:", updateError);
    await admin.from("payments").delete().eq("reference", reference); // let them retry
    return reply({ ok: false, error: "Could not feature the job. Please try again." }, 500);
  }

  return reply({ ok: true, featured_until: until });
});
