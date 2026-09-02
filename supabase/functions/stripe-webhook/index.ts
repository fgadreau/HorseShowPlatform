import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function safeEqual(first: string, second: string) {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  return difference === 0;
}

async function validStripeSignature(payload: string, header: string, secret: string) {
  const parts = header.split(",").map((part) => part.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1] ?? "";
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some((candidate) => safeEqual(candidate, expected));
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  if (!webhookSecret || !(await validStripeSignature(payload, signature, webhookSecret))) return json({ error: "Invalid Stripe signature." }, 400);

  try {
    const event = JSON.parse(payload);
    const intent = event?.data?.object;
    if (!event?.id || !event?.type) return json({ error: "Invalid Stripe event." }, 400);
    if (event.livemode) return json({ error: "Live Stripe events are disabled for this deployment." }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: existing } = await admin.from("stripe_webhook_events").select("stripe_event_id").eq("stripe_event_id", event.id).maybeSingle();
    if (existing) return json({ received: true, duplicate: true });

    const supported: Record<string, string> = {
      "payment_intent.amount_capturable_updated": "processing",
      "payment_intent.processing": "processing",
      "payment_intent.succeeded": "completed",
      "payment_intent.payment_failed": "failed",
      "payment_intent.canceled": "failed",
    };
    const paymentStatus = supported[event.type];

    if (event.type === "account.updated" && intent?.id) {
      const { error: connectError } = await admin.from("stripe_connect_accounts").update({
        details_submitted: Boolean(intent.details_submitted),
        charges_enabled: Boolean(intent.charges_enabled),
        payouts_enabled: Boolean(intent.payouts_enabled),
        requirements_due: intent.requirements?.currently_due ?? [],
        disabled_reason: intent.requirements?.disabled_reason ?? null,
      }).eq("stripe_account_id", intent.id);
      if (connectError) throw connectError;
    }

    if (paymentStatus && intent?.id) {
      const updates: Record<string, unknown> = { status: paymentStatus };
      if (intent.latest_charge) updates.stripe_charge_id = intent.latest_charge;
      if (paymentStatus === "completed") updates.processed_at = new Date().toISOString();
      const { data: payment, error: updateError } = await admin.from("payments").update(updates).eq("stripe_payment_intent_id", intent.id).select("invoice_id").maybeSingle();
      if (updateError) throw updateError;

      if (payment?.invoice_id) {
        const { data: completedPayments, error: paymentsError } = await admin.from("payments").select("amount").eq("invoice_id", payment.invoice_id).eq("status", "completed");
        if (paymentsError) throw paymentsError;
        const totalPaid = (completedPayments ?? []).reduce((sum, item) => sum + Number(item.amount), 0);
        const { data: invoice, error: invoiceError } = await admin.from("invoices").select("total_amount, status").eq("id", payment.invoice_id).single();
        if (invoiceError) throw invoiceError;
        const nextStatus = totalPaid <= 0 ? invoice.status : totalPaid >= Number(invoice.total_amount) ? "paid" : "partially_paid";
        const { error: invoiceUpdateError } = await admin.from("invoices").update({ total_paid: totalPaid, status: nextStatus }).eq("id", payment.invoice_id);
        if (invoiceUpdateError) throw invoiceUpdateError;
      }
    }

    const { error: receiptError } = await admin.from("stripe_webhook_events").insert({ stripe_event_id: event.id, event_type: event.type, livemode: Boolean(event.livemode) });
    if (receiptError?.code !== "23505" && receiptError) throw receiptError;
    return json({ received: true });
  } catch (error) {
    console.error("stripe-webhook error", error);
    return json({ error: "Webhook processing failed." }, 500);
  }
});
