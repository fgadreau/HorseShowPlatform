import type { BillingAccountSummary } from "../types/domain";
import { formatCurrency } from "./display";

export function accountBalanceLabel(accounts: BillingAccountSummary[]) {
  const groups = new Map<string, number>();
  for (const account of accounts) {
    groups.set(account.currency, (groups.get(account.currency) ?? 0) + Number(account.balance));
  }
  return [...groups].map(([currency, balance]) => formatCurrency(balance, currency)).join(" / ") || "—";
}
