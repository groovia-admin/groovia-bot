// The one line format used everywhere an item-quantity change gets
// summarized for a customer — the staff order-edit webview and the
// dashboard's own logged-in item-edit route independently formatted
// the identical string shape before a simplify-pass review caught it.
export function formatItemDiffLine(item: { name: string; removed: boolean; from?: number; to?: number }): string {
  return item.removed ? `❌ ${item.name} — removed` : `✏️ ${item.name} — quantity ${item.from} → ${item.to}`
}
