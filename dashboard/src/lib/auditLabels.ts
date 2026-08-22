// Shared between the Activity Logs page and the notification bell — one
// place for "what does this audit_logs.action value mean to a human",
// so the two surfaces never drift into describing the same event
// differently.
export type ActorType = "super_admin" | "owner" | "manager" | "staff" | "system" | "whatsapp" | "ai";

export const ACTION_LABEL: Record<string, string> = {
  "staff.created": "Staff member added",
  "staff.role_changed": "Staff role changed",
  "staff.activated": "Staff member reactivated",
  "staff.deactivated": "Staff member deactivated",
  "staff.updated": "Staff member updated",
  "staff.permissions_updated": "Staff permissions updated",
  "order.status_changed": "Order status changed",
  "order.item_edited": "Order item edited",
  "shop.created": "Shop created",
  "shop.activated": "Shop activated",
  "shop.deactivated": "Shop deactivated",
  "shop.subscription_updated": "Subscription status updated",
  "shop.updated": "Shop updated",
  "settings.updated": "Shop settings updated",
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "shop.logo_updated": "Shop logo updated",
  "shop.whatsapp_connection_updated": "WhatsApp connection updated",
  "catalog.master_category_synced": "Master category synced to shop",
  "restricted_term.added": "Restricted term added",
  "restricted_term.updated": "Restricted term updated",
  "restricted_term.removed": "Restricted term removed",
};

export const ACTOR_BADGE: Record<ActorType, [string, string]> = {
  super_admin: ["var(--brand-dark)", "var(--brand-light)"],
  owner: ["#8B5CF6", "rgba(139,92,246,0.1)"],
  manager: ["#0EA5E9", "rgba(14,165,233,0.1)"],
  staff: ["var(--ink-muted)", "var(--surface)"],
  system: ["#B7791F", "rgba(183,121,31,0.1)"],
  whatsapp: ["var(--brand)", "var(--brand-light)"],
  ai: ["#DB2777", "rgba(219,39,119,0.1)"],
};

export function actorLabel(actorType: ActorType): string {
  return actorType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
