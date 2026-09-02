import { requireSupabase } from "../lib/supabase";

export async function createStripeInvoicePayment(invoiceId: string, captureMethod: "automatic" | "manual" = "automatic") {
  const { data, error } = await requireSupabase().functions.invoke<{ clientSecret?: string; paymentIntentId?: string; error?: string }>("stripe-invoice-payment", { body: { invoiceId, captureMethod } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data?.clientSecret) throw new Error("Stripe did not return a payment session.");
  return { clientSecret: data.clientSecret, paymentIntentId: data.paymentIntentId ?? "" };
}
