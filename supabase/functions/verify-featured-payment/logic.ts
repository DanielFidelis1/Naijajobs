// Pure rules for featured-job payments. No network, so they can be unit tested.

// The server decides prices. The website can never choose its own price.
export const PLANS: Record<number, { priceNaira: number }> = {
  7: { priceNaira: 2000 },
  14: { priceNaira: 3500 },
  30: { priceNaira: 6000 },
};

export function priceInKobo(days: number): number | null {
  const plan = PLANS[days];
  return plan ? plan.priceNaira * 100 : null;
}

export interface Expected {
  reference: string;
  amountKobo: number;
  jobId: string;
  userId: string;
}

export type Check = { ok: true } | { ok: false; reason: string };

// "response" is what Paystack's /transaction/verify/:reference returned.
// deno-lint-ignore no-explicit-any
export function checkPayment(response: any, expected: Expected): Check {
  if (!response || response.status !== true || !response.data) {
    return { ok: false, reason: "Paystack could not find this payment." };
  }
  const data = response.data;
  if (data.status !== "success") {
    return { ok: false, reason: "The payment was not successful." };
  }
  if (data.currency !== "NGN") {
    return { ok: false, reason: "Wrong currency." };
  }
  if (data.reference !== expected.reference) {
    return { ok: false, reason: "Payment reference does not match." };
  }
  if (data.amount !== expected.amountKobo) {
    return { ok: false, reason: "The amount paid does not match the plan." };
  }
  const meta = data.metadata || {};
  if (String(meta.job_id) !== String(expected.jobId)) {
    return { ok: false, reason: "This payment was made for a different job." };
  }
  if (String(meta.user_id) !== String(expected.userId)) {
    return { ok: false, reason: "This payment was made by a different person." };
  }
  return { ok: true };
}

// Featuring stacks: extending an already-featured job adds days to the end date.
export function computeFeaturedUntil(
  existingIso: string | null,
  days: number,
  now: Date = new Date(),
): Date {
  const existing = existingIso ? new Date(existingIso) : null;
  const base = existing && !isNaN(existing.getTime()) && existing > now ? existing : now;
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}
