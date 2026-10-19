// Receives Stripe events and records money in the database.
//
// Stripe endpoint URL (note the region pin):
//   https://<project-ref>.supabase.co/functions/v1/stripe-webhook?forceFunctionRegion=ca-central-1
// Events to send:
//   checkout.session.completed, checkout.session.async_payment_succeeded,
//   refund.created, refund.updated
//
// Every write is idempotent, so Stripe retries are harmless. Refunds made
// directly in the Stripe dashboard are recorded too.

import { adminClient, json, Stripe, stripeClient, UUID_RE } from "../_shared/common.ts";

const crypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const signature = req.headers.get("stripe-signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signature || !secret) return json({ error: "Missing signature" }, 400);

  const body = await req.text();
  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, secret, undefined, crypto);
  } catch {
    return json({ error: "Invalid signature" }, 400);
  }

  const db = adminClient();

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== "paid") break;

      const bookingId = session.metadata?.booking_id ?? session.client_reference_id;
      if (!bookingId || !UUID_RE.test(bookingId)) {
        console.warn("Checkout without a booking id", session.id);
        break;
      }
      const paymentIntent = typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

      const { error } = await db.rpc("record_online_payment", {
        p_booking_id: bookingId,
        p_amount_cents: session.amount_total,
        p_method: "card",
        p_checkout_session_id: session.id,
        p_payment_intent_id: paymentIntent,
        p_charge_id: null,
      });
      if (error) {
        console.error("record_online_payment failed", error.code, error.message);
        return json({ error: "Could not record payment" }, 500); // Stripe retries
      }
      break;
    }

    case "refund.created":
    case "refund.updated": {
      const refund = event.data.object as Stripe.Refund;
      if (refund.status !== "succeeded") break;

      const paymentIntent = typeof refund.payment_intent === "string"
        ? refund.payment_intent
        : refund.payment_intent?.id ?? null;

      let bookingId: string | null = refund.metadata?.booking_id ?? null;
      if (!bookingId && paymentIntent) {
        const { data } = await db
          .from("transactions")
          .select("booking_id")
          .eq("stripe_payment_intent_id", paymentIntent)
          .eq("type", "payment")
          .limit(1)
          .maybeSingle();
        bookingId = (data?.booking_id as string | undefined) ?? null;
      }
      if (!bookingId || !UUID_RE.test(bookingId)) {
        console.warn("Refund for a payment we don't know", refund.id);
        break;
      }

      const actor = refund.metadata?.refunded_by;
      const { error } = await db.rpc("record_refund", {
        p_booking_id: bookingId,
        p_amount_cents: refund.amount,
        p_method: "card",
        p_refund_id: refund.id,
        p_payment_intent_id: paymentIntent,
        p_note: refund.metadata?.note || "Refund",
        p_actor: actor && UUID_RE.test(actor) ? actor : null,
      });
      if (error) {
        console.error("record_refund failed", error.code, error.message);
        return json({ error: "Could not record refund" }, 500);
      }
      break;
    }
  }

  return json({ received: true }, 200);
});
