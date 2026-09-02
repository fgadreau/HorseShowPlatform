import { requireSupabase } from "../lib/supabase";

export type StripeConnectStatus = {
  connected: boolean;
  sandbox: true;
  details_submitted?: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  requirements_due?: string[];
  disabled_reason?: string | null;
};

async function invokeConnect<T>(organizationId: string, action: "status" | "onboard" | "dashboard") {
  const { data, error } = await requireSupabase().functions.invoke<T & { error?: string }>("stripe-connect", {
    body: { organizationId, action },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function loadStripeConnectStatus(organizationId: string) {
  return invokeConnect<StripeConnectStatus>(organizationId, "status");
}

export async function openStripeConnect(organizationId: string, action: "onboard" | "dashboard") {
  const result = await invokeConnect<{ url?: string; sandbox: true }>(organizationId, action);
  if (!result.url || !result.url.startsWith("https://")) throw new Error("Stripe did not return a secure link.");
  window.location.assign(result.url);
}
