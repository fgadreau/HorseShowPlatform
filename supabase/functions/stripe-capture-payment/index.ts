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
    const { paymentIntentId, amount } = await request.json();
    if (!authorization || !paymentIntentId?.startsWith("pi_")) return json({ error: "Invalid capture request." }, 400);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: authData } = await userClient.auth.getUser();
    if (!authData.user) return json({ error: "Authentication required." }, 401);
    const { data: profile } = await admin.from("user_profiles").select("id").eq("user_id", authData.user.id).single();
    const { data: payment } = await admin.from("payments").select("id, organization_id, amount, status").eq("stripe_payment_intent_id", paymentIntentId).single();
    if (!profile || !payment) return json({ error: "Payment not found." }, 404);
    const { data: membership } = await admin.from("organization_members").select("role").eq("organization_id", payment.organization_id).eq("user_id", profile.id).in("role", ["admin", "secretary"]).maybeSingle();
    if (!membership) return json({ error: "Association payment permission required." }, 403);
    if (payment.status !== "processing") return json({ error: "This payment is not awaiting capture." }, 409);

    const requestedAmount = amount == null ? Number(payment.amount) : Number(amount);
    if (requestedAmount <= 0 || requestedAmount > Number(payment.amount)) return json({ error: "Capture amount exceeds the authorization." }, 400);
    const intent = await stripeRequest(`/payment_intents/${encodeURIComponent(paymentIntentId)}/capture`, { method: "POST", params: { amount_to_capture: stripeCurrencyAmount(requestedAmount) } });
    await admin.from("audit_events").insert({ organization_id: payment.organization_id, actor_user_id: profile.id, event_type: "stripe.payment.capture_requested", entity_type: "payment", entity_id: payment.id, metadata: { paymentIntentId, amount: requestedAmount } });
    return json({ paymentIntentId: intent.id, status: intent.status, amountCaptured: requestedAmount });
  } catch (error) {
    console.error("stripe-capture-payment error", error);
    return json({ error: error instanceof Error ? error.message : "Unable to capture payment." }, 500);
  }
});
