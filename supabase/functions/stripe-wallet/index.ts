import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stripeRequest } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type WalletRequest = {
  action?: "overview" | "create_setup" | "detach";
  contactId?: string;
  paymentMethodId?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authorization = request.headers.get("Authorization") ?? "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return jsonResponse({ error: "Stripe wallet is not configured." }, 500);
  }

  try {
    const body = (await request.json()) as WalletRequest;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: "Authentication required." }, 401);

    const { data: profile, error: profileError } = await adminClient
      .from("user_profiles")
      .select("id")
      .eq("user_id", userData.user.id)
      .single();
    if (profileError || !profile) return jsonResponse({ error: "User profile not found." }, 403);

    const { data: contacts, error: contactsError } = await adminClient
      .from("contacts")
      .select("id, first_name, last_name, email")
      .eq("linked_user_id", profile.id);
    if (contactsError) throw contactsError;

    const contact = contacts?.find((candidate) => candidate.id === body.contactId);
    if (!contact) return jsonResponse({ error: "This payment profile does not belong to the authenticated user." }, 403);

    let { data: paymentProfile, error: paymentProfileError } = await adminClient
      .from("stripe_payment_profiles")
      .select("stripe_customer_id")
      .eq("contact_id", contact.id)
      .maybeSingle();
    if (paymentProfileError) throw paymentProfileError;

    if (!paymentProfile) {
      const customer = await stripeRequest("/customers", {
        method: "POST",
        params: {
          email: contact.email ?? "",
          name: `${contact.first_name} ${contact.last_name}`.trim(),
          "metadata[hsp_contact_id]": contact.id,
        },
      });
      const { data: createdProfile, error: createError } = await adminClient
        .from("stripe_payment_profiles")
        .insert({ contact_id: contact.id, stripe_customer_id: customer.id })
        .select("stripe_customer_id")
        .single();
      if (createError?.code === "23505") {
        const { data: concurrentProfile, error: concurrentError } = await adminClient.from("stripe_payment_profiles").select("stripe_customer_id").eq("contact_id", contact.id).single();
        if (concurrentError) throw concurrentError;
        paymentProfile = concurrentProfile;
      } else {
        if (createError) throw createError;
        paymentProfile = createdProfile;
      }
    }

    const customerId = paymentProfile.stripe_customer_id;

    if (body.action === "detach") {
      if (!body.paymentMethodId?.startsWith("pm_")) return jsonResponse({ error: "Invalid payment method." }, 400);
      const method = await stripeRequest(`/payment_methods/${encodeURIComponent(body.paymentMethodId)}`);
      if (method.customer !== customerId) return jsonResponse({ error: "Payment method does not belong to this wallet." }, 403);
      await stripeRequest(`/payment_methods/${encodeURIComponent(body.paymentMethodId)}/detach`, { method: "POST" });
    }

    const methods = await stripeRequest("/payment_methods", { params: { customer: customerId, type: "card" } });
    const paymentMethods = (methods.data ?? []).map((method: any) => ({
      id: method.id,
      brand: method.card?.brand ?? "card",
      last4: method.card?.last4 ?? "",
      expMonth: method.card?.exp_month ?? 0,
      expYear: method.card?.exp_year ?? 0,
      allowRedisplay: method.allow_redisplay ?? "unspecified",
    }));

    if (body.action === "create_setup") {
      const [setupIntent, customerSession] = await Promise.all([
        stripeRequest("/setup_intents", {
          method: "POST",
          params: { customer: customerId, usage: "off_session", "payment_method_types[]": "card" },
        }),
        stripeRequest("/customer_sessions", {
          method: "POST",
          params: {
            customer: customerId,
            "components[payment_element][enabled]": "true",
            "components[payment_element][features][payment_method_redisplay]": "enabled",
            "components[payment_element][features][payment_method_save]": "enabled",
            "components[payment_element][features][payment_method_save_usage]": "off_session",
          },
        }),
      ]);
      return jsonResponse({
        paymentMethods,
        setupClientSecret: setupIntent.client_secret,
        customerSessionClientSecret: customerSession.client_secret,
      });
    }

    return jsonResponse({ paymentMethods });
  } catch (error) {
    console.error("stripe-wallet error", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unable to manage payment methods." }, 500);
  }
});
