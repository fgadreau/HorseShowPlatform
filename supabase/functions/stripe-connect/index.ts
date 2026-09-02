import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stripeRequest } from "../_shared/stripe.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function connectState(account: any) {
  return {
    details_submitted: Boolean(account.details_submitted),
    charges_enabled: Boolean(account.charges_enabled),
    payouts_enabled: Boolean(account.payouts_enabled),
    requirements_due: account.requirements?.currently_due ?? [],
    disabled_reason: account.requirements?.disabled_reason ?? null,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { organizationId, action = "status" } = await request.json();
    if (!organizationId || !["status", "onboard", "dashboard"].includes(action)) return json({ error: "Invalid Connect request." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authorization = request.headers.get("Authorization") ?? "";
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
    if (!supabaseUrl || !anonKey || !serviceKey || !authorization) return json({ error: "Connect is not configured." }, 500);
    if (action !== "status" && !appUrl) return json({ error: "APP_URL is required for Stripe return links." }, 500);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: authData } = await userClient.auth.getUser();
    if (!authData.user) return json({ error: "Authentication required." }, 401);
    const { data: profile } = await admin.from("user_profiles").select("id").eq("user_id", authData.user.id).single();
    if (!profile) return json({ error: "User profile not found." }, 403);
    const { data: membership } = await admin.from("organization_members").select("role").eq("organization_id", organizationId).eq("user_id", profile.id).in("role", ["admin", "secretary"]).maybeSingle();
    if (!membership) return json({ error: "Association manager access required." }, 403);

    const { data: organization } = await admin.from("organizations").select("id, name, country, primary_contact_email").eq("id", organizationId).single();
    if (!organization) return json({ error: "Association not found." }, 404);
    let { data: connection } = await admin.from("stripe_connect_accounts").select("stripe_account_id").eq("organization_id", organizationId).maybeSingle();

    if (!connection && action !== "status") {
      const account = await stripeRequest("/accounts", {
        method: "POST",
        idempotencyKey: `hsp-connect-${organizationId}`,
        params: {
          type: "express",
          country: String(organization.country ?? "CA").toUpperCase(),
          email: organization.primary_contact_email ?? "",
          "capabilities[card_payments][requested]": "true",
          "capabilities[transfers][requested]": "true",
          "business_profile[name]": organization.name,
          "metadata[hsp_organization_id]": organization.id,
        },
      });
      const { data: created, error } = await admin.from("stripe_connect_accounts").insert({ organization_id: organizationId, stripe_account_id: account.id, ...connectState(account) }).select("stripe_account_id").single();
      if (error) throw error;
      connection = created;
    }
    if (!connection) return json({ connected: false, sandbox: true });

    const account = await stripeRequest(`/accounts/${encodeURIComponent(connection.stripe_account_id)}`);
    const state = connectState(account);
    await admin.from("stripe_connect_accounts").update(state).eq("organization_id", organizationId);
    if (action === "status") return json({ connected: true, sandbox: true, ...state });

    if (action === "dashboard") {
      if (!state.details_submitted) return json({ error: "Complete Stripe onboarding before opening the dashboard." }, 409);
      const link = await stripeRequest(`/accounts/${encodeURIComponent(account.id)}/login_links`, { method: "POST" });
      return json({ url: link.url, sandbox: true });
    }

    const accountLink = await stripeRequest("/account_links", { method: "POST", params: {
      account: account.id,
      type: "account_onboarding",
      refresh_url: `${appUrl}/?stripe_connect=refresh`,
      return_url: `${appUrl}/?stripe_connect=return`,
      "collection_options[fields]": "eventually_due",
    }});
    return json({ url: accountLink.url, sandbox: true });
  } catch (error) {
    console.error("stripe-connect error", error);
    return json({ error: error instanceof Error ? error.message : "Unable to manage Stripe Connect." }, 500);
  }
});
