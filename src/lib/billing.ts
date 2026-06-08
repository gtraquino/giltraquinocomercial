export interface BillingFields {
  is_blocked?: boolean | null;
  paid_until?: string | null;
}

/** Returns true if the store should be blocked (manual flag or past due). */
export function isStoreBlocked(store: BillingFields | null | undefined): boolean {
  if (!store) return false;
  if (store.is_blocked) return true;
  if (!store.paid_until) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(store.paid_until);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

/** Add months to a date, returning a YYYY-MM-DD date string. */
export function addPeriod(from: Date, period: "monthly" | "quarterly"): string {
  const months = period === "monthly" ? 1 : 3;
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function periodLabel(period: string | null | undefined): string {
  if (period === "monthly") return "Mensal";
  if (period === "quarterly") return "Trimestral";
  return "—";
}
