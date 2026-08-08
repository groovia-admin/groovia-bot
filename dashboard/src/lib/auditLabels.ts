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
};

export const ACTOR_BADGE: Record<ActorType, [string, string]> = {
  super_admin: ["#128C7E", "#DCF8C6"],
  owner: ["#8B5CF6", "rgba(139,92,246,0.1)"],
  manager: ["#0EA5E9", "rgba(14,165,233,0.1)"],
  staff: ["#667781", "#F0F2F5"],
  system: ["#B7791F", "rgba(183,121,31,0.1)"],
  whatsapp: ["#25D366", "#DCF8C6"],
  ai: ["#DB2777", "rgba(219,39,119,0.1)"],
};

export function actorLabel(actorType: ActorType): string {
  return actorType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
