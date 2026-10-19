// Refunds a card payment on a booking. Admins only.
//
// The caller's own session decides access (same rules as the rest of the
// app, including two-step sign-in when it's required). The refund is made in
// Stripe; the webhook records it, and so do we straight away if Stripe
// confirms it immediately (recording twice is harmless).

import {
  adminClient,
  corsHeaders,
  json,
  originAllowed,
  paymentsMode,
  stripeClient,
  userClient,
  UUID_RE,
} from "../_shared/common.ts";

type Refundable = { refundable_cents: number; payment_intent_id: string | null; method: string | null };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, cors);
  if (!originAllowed(req)) return json({ error: "Not allowed." }, 403, cors);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in again to continue." }, 401, cors);

  const db = adminClient();
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "Sign in again to continue." }, 401, cors);
  const userId = userData.user.id;

  const asUser = userClient(token);
  const { data: role } = await asUser.rpc("my_role");
  if (role !== "admin") return json({ error: "Only admins can issue refunds." }, 403, cors);

  let body: { booking_id?: string; amount_cents?: number; reason?: string; request_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400, cors);
  }

  const bookingId = String(body.booking_id ?? "");
  const amount = Number(body.amount_cents);
  const reason = String(body.reason ?? "").trim().slice(0, 200);
  const requestId = String(body.request_id ?? "");
  if (!UUID_RE.test(bookingId)) return json({ error: "Invalid booking." }, 400, cors);
  if (!Number.isInteger(amount) || amount <= 0) return json({ error: "Enter an amount to refund." }, 400, cors);
  if (!reason) return json({ error: "Add a reason for the refund." }, 400, cors);

  const { data: info, error: infoError } = await asUser.rpc("booking_refundable", { p_booking_id: bookingId });
  if (infoError) return json({ error: "Couldn't load the payments on this booking." }, 500, cors);
  const refundable = info as Refundable;
  if (!refundable || refundable.refundable_cents <= 0) {
    return json({ error: "There's no card payment left to refund on this booking." }, 400, cors);
  }
  if (amount > refundable.refundable_cents) {
    return json({ error: `You can refund up to ${money(refundable.refundable_cents)}.` }, 400, cors);
  }

  // Demo payments are refunded in the database only.
  if (refundable.method === "demo" || !refundable.payment_intent_id?.startsWith("pi_")) {
    const { error } = await db.rpc("record_refund", {
      p_booking_id: bookingId,
      p_amount_cents: amount,
      p_method: "demo",
      p_refund_id: `demo_re_${UUID_RE.test(requestId) ? requestId : crypto.randomUUID()}`,
      p_payment_intent_id: refundable.payment_intent_id,
      p_note: reason,
      p_actor: userId,
    });
    if (error) return json({ error: "Couldn't record the refund." }, 500, cors);
    return json({ status: "succeeded", demo: true }, 200, cors);
  }

  if (paymentsMode() !== "stripe") {
    return json({ error: "Stripe isn't connected, so card refunds can't be made here." }, 503, cors);
  }

  try {
    const stripe = stripeClient();
    const refund = await stripe.refunds.create(
      {
        payment_intent: refundable.payment_intent_id,
        amount,
        reason: "requested_by_customer",
        metadata: { booking_id: bookingId, refunded_by: userId, note: reason },
      },
      UUID_RE.test(requestId) ? { idempotencyKey: `refund-${requestId}` } : undefined,
    );

    if (refund.status === "succeeded") {
      await db.rpc("record_refund", {
        p_booking_id: bookingId,
        p_amount_cents: refund.amount,
        p_method: "card",
        p_refund_id: refund.id,
        p_payment_intent_id: refundable.payment_intent_id,
        p_note: reason,
        p_actor: userId,
      });
    }
    return json({ status: refund.status }, 200, cors);
  } catch (e) {
    console.error("Stripe refund failed", e instanceof Error ? e.message : e);
    return json({ error: "Stripe didn't accept the refund. Check the payment in Stripe." }, 502, cors);
  }
});
