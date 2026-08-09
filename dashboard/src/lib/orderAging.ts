// How long a *pending* order has been waiting for the shop to respond,
// escalating visually the longer it sits — a pending order at 2 minutes
// and one at 25 minutes look identical today, which is exactly how one
// gets missed. Thresholds are same-day-grocery reasonable, not generic.
export type AgingLevel = "normal" | "warning" | "urgent";

export const AGING_WARNING_MINUTES = 10;
export const AGING_URGENT_MINUTES = 20;

export function getOrderAgeMinutes(createdAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 60000));
}

export function getAgingLevel(minutes: number): AgingLevel {
  if (minutes >= AGING_URGENT_MINUTES) return "urgent";
  if (minutes >= AGING_WARNING_MINUTES) return "warning";
  return "normal";
}

export function formatAgeShort(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

export const AGING_COLOR: Record<AgingLevel, { color: string; background: string }> = {
  normal: { color: "var(--ink-muted)", background: "var(--surface)" },
  warning: { color: "#B7791F", background: "rgba(245,158,11,0.12)" },
  urgent: { color: "var(--error)", background: "rgba(186,26,26,0.12)" },
};
