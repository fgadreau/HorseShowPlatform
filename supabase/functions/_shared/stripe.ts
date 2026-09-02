export async function stripeRequest(path: string, options: { method?: string; params?: Record<string, string>; idempotencyKey?: string } = {}) {
  const secretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured.");
  if (!secretKey.startsWith("sk_test_")) throw new Error("Stripe live mode is disabled for this deployment.");

  const method = options.method ?? "GET";
  const params = new URLSearchParams(options.params ?? {});
  const url = method === "GET" && params.size ? `https://api.stripe.com/v1${path}?${params}` : `https://api.stripe.com/v1${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      ...(method === "GET" ? {} : { "Content-Type": "application/x-www-form-urlencoded" }),
    },
    body: method === "GET" ? undefined : params,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message ?? "Stripe request failed.");
  return payload;
}

export function stripeCurrencyAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Payment amount must be positive.");
  return String(Math.round(amount * 100));
}
