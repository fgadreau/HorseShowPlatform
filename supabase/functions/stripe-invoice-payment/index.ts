import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stripeCurrencyAmount, stripeRequest } from "../_shared/stripe.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authorization = request.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!authorization || !supabaseUrl || !anonKey || !serviceKey) return json({ error: "Payment service is not configured." }, 500);

    const { invoiceId, captureMethod = "automatic" } = await request.json();
    if (!invoiceId || !["automatic", "manual"].includes(captureMethod)) return json({ error: "Invalid payment request." }, 400);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: authData } = await userClient.auth.getUser();
    if (!authData.user) return json({ error: "Authentication required." }, 401);
    const { data: profile } = await admin.from("user_profiles").select("id").eq("user_id", authData.user.id).single();
    if (!profile) return json({ error: "User profile not found." }, 403);

    const { data: invoice, error: invoiceError } = await admin.from("invoices").select("id, organization_id, invoice_number, payer_contact_id, balance_due, status, organizations(currency)").eq("id", invoiceId).single();
    if (invoiceError || !invoice) return json({ error: "Invoice not found." }, 404);
    if (["paid", "void"].includes(invoice.status) || Number(invoice.balance_due) <= 0) return json({ error: "This invoice has no payable balance." }, 409);

    const { data: contact } = await admin.from("contacts").select("id, linked_user_id").eq("id", invoice.payer_contact_id).single();
    if (!contact || contact.linked_user_id !== profile.id) return json({ error: "You are not the payer for this invoice." }, 403);
    const { data: wallet } = await admin.from("stripe_payment_profiles").select("stripe_customer_id").eq("contact_id", contact.id).single();
    if (!wallet) return json({ error: "Add a payment card before paying this invoice." }, 409);

    const currency = String((invoice.organizations as any)?.currency ?? "CAD").toLowerCase();
    const { data: connectAccount } = await admin.from("stripe_connect_accounts").select("stripe_account_id, charges_enabled").eq("organization_id", invoice.organization_id).maybeSingle();
    if (!connectAccount?.charges_enabled) return json({ error: "This association has not completed Stripe Connect onboarding." }, 409);
    const { data: existingPayment } = await admin.from("payments").select("stripe_payment_intent_id").eq("invoice_id", invoice.id).eq("payment_method", "stripe").in("status", ["pending", "processing"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existingPayment?.stripe_payment_intent_id) {
      const existingIntent = await stripeRequest(`/payment_intents/${encodeURIComponent(existingPayment.stripe_payment_intent_id)}`);
      if (existingIntent.client_secret && !["canceled", "succeeded"].includes(existingIntent.status)) {
        return json({ clientSecret: existingIntent.client_secret, paymentIntentId: existingIntent.id, captureMethod: existingIntent.capture_method, reused: true });
      }
    }

    const intent = await stripeRequest("/payment_intents", { method: "POST", params: {
      amount: stripeCurrencyAmount(Number(invoice.balance_due)), currency, customer: wallet.stripe_customer_id,
      capture_method: captureMethod,
      "automatic_payment_methods[enabled]": "true",
      "transfer_data[destination]": connectAccount.stripe_account_id,
      "metadata[hsp_invoice_id]": invoice.id,
      "metadata[hsp_organization_id]": invoice.organization_id,
      "metadata[hsp_actor_profile_id]": profile.id,
      description: `HSP invoice ${invoice.invoice_number}`,
    }, idempotencyKey: `hsp-invoice-${invoice.id}-${Number(invoice.balance_due).toFixed(2)}-${captureMethod}` });

    const { error: paymentError } = await admin.from("payments").insert({
      organization_id: invoice.organization_id, invoice_id: invoice.id, payment_method: "stripe",
      amount: Number(invoice.balance_due), currency: currency.toUpperCase(), stripe_payment_intent_id: intent.id,
      status: "pending", created_by_user_id: profile.id, notes: captureMethod === "manual" ? "Stripe preauthorization" : "Stripe invoice payment",
    });
    if (paymentError) throw paymentError;
    return json({ clientSecret: intent.client_secret, paymentIntentId: intent.id, captureMethod });
  } catch (error) {
    console.error("stripe-invoice-payment error", error);
    return json({ error: error instanceof Error ? error.message : "Unable to create payment." }, 500);
  }
});
