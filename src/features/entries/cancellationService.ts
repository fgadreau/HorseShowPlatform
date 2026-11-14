import { requireSupabase } from "../../lib/supabase";

export type CancellationRequest = {
  id: string; block_id: string; entry_ids: string[]; scope: "class" | "block";
  status: "pending" | "approved" | "rejected" | "withdrawn";
  requested_by: string; reason: string; decision_note: string; created_at: string;
};
export type CancellationQuote = {
  version: number; signature: string; currency: string; subtotal: number; tax_amount: number; total: number;
  fee_tax_rules: { rate: number }[];
};
export async function cancellationRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, args);
  if (error) throw error;
  return data as T;
}
export async function loadCancellations(showId: string): Promise<CancellationRequest[]> {
  const { data, error } = await requireSupabase().from("entry_cancellation_requests").select("*").eq("show_id", showId).order("created_at");
  if (error) throw error;
  return data ?? [];
}
export { cancellationError } from "../finance/presentation";
