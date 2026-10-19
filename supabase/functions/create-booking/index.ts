// Public booking endpoint.
//
// 1. The database validates the request, prices it from the catalog and saves
//    it as "awaiting payment".
// 2. In Stripe mode, we open a Stripe Checkout page for the total and send the
//    browser there. The stripe-webhook function records the payment, which
//    moves the booking into the dispatch queue.
//    In demo mode (no Stripe key, PAYMENTS_MODE=demo), the payment is recorded
//    straight away as a demo payment. No card is charged.
//
// Stripe only ever sees the amount, the booking reference and the contact
// email. No health information is sent to Stripe.

import {
  adminClient,
  corsHeaders,
  json,
  originAllowed,
  paymentsMode,
  publicError,
  siteUrl,
  stripeClient,
} from "../_shared/common.ts";

type BookingResult = {
  booking_id: string;
  reference: string;
  status: string;
  total_cents: number;
  contact_email: string;
};

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, cors);
  if (!originAllowed(req)) return json({ error: "Not allowed." }, 403, cors);

  const raw = await req.text();
  if (raw.length > 20_000) return json({ error: "That request is too large." }, 413, cors);

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request." }, 400, cors);
  }

  // Honeypot field: hidden from people, filled in by bots.
  const { website, ...payload } = body;
  if (typeof website === "string" && website.trim() !== "") {
    return json({ error: "Invalid request." }, 400, cors);
  }

  const mode = paymentsMode();
  if (!mode) {
    return json({ error: "Online payment isn't set up yet. Please call us to book." }, 503, cors);
  }

  const db = adminClient();
  const { data, error } = await db.rpc("create_booking_request", { p: payload });
  if (error) {
    if (error.code !== "P0001") console.error("create_booking_request failed", error.code, error.message);
    return json({ error: publicError(error) }, 400, cors);
  }

  const booking = data as BookingResult;
  const site = siteUrl();
  const confirmedUrl = `${site}/book/confirmed/?ref=${encodeURIComponent(booking.reference)}`;

  // Nothing to pay (not expected online, but handled).
  if (booking.status !== "awaiting_payment") {
    return json({ reference: booking.reference, url: confirmedUrl }, 200, cors);
  }

  if (mode === "demo") {
    const { error: payError } = await db.rpc("record_online_payment", {
      p_booking_id: booking.booking_id,
      p_amount_cents: booking.total_cents,
      p_method: "demo",
      p_checkout_session_id: `demo_cs_${booking.reference}`,
      p_payment_intent_id: `demo_pi_${booking.reference}`,
    });
    if (payError) {
      console.error("demo payment failed", payError.code, payError.message);
      return json({ error: publicError(null) }, 500, cors);
    }
    return json({ reference: booking.reference, url: `${confirmedUrl}&demo=1` }, 200, cors);
  }

  try {
    const stripe = stripeClient();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        locale: "en",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "cad",
              unit_amount: booking.total_cents,
              product_data: {
                name: "Aloha Footcare visit",
                description: `Booking ${booking.reference}`,
              },
            },
          },
        ],
        customer_email: booking.contact_email,
        client_reference_id: booking.booking_id,
        metadata: { booking_id: booking.booking_id, reference: booking.reference },
        payment_intent_data: {
          description: `Aloha Footcare visit ${booking.reference}`,
          metadata: { booking_id: booking.booking_id, reference: booking.reference },
        },
        success_url: confirmedUrl,
        cancel_url: `${site}/book/?unpaid=${encodeURIComponent(booking.reference)}`,
        // Stripe's minimum is 30 minutes.
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      },
      { idempotencyKey: `checkout-${booking.booking_id}` },
    );

    await db
      .from("bookings")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", booking.booking_id);

    return json({ reference: booking.reference, url: session.url }, 200, cors);
  } catch (e) {
    console.error("Stripe checkout failed", e instanceof Error ? e.message : e);
    return json(
      { error: "We saved your request but couldn't open the payment page. Please call us to finish booking.", reference: booking.reference },
      502,
      cors,
    );
  }
});
