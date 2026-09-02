import { requireSupabase } from "../lib/supabase";

export type StripePaymentMethodSummary = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  allowRedisplay: "always" | "limited" | "unspecified";
};

export type StripeWalletResponse = {
  paymentMethods: StripePaymentMethodSummary[];
  setupClientSecret?: string;
  customerSessionClientSecret?: string;
};

async function invokeStripeWallet(body: Record<string, unknown>) {
  const { data, error } = await requireSupabase().functions.invoke<StripeWalletResponse & { error?: string }>("stripe-wallet", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data) throw new Error("Stripe wallet returned an empty response.");
  return data;
}

export function loadStripeWallet(contactId: string) {
  return invokeStripeWallet({ action: "overview", contactId });
}

export function createStripeWalletSetup(contactId: string) {
  return invokeStripeWallet({ action: "create_setup", contactId });
}

export function detachStripePaymentMethod(contactId: string, paymentMethodId: string) {
  return invokeStripeWallet({ action: "detach", contactId, paymentMethodId });
}
