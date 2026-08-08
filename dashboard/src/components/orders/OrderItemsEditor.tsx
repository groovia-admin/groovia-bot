"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { S } from "@/lib/ui/dashboardStyles";
import { useToast } from "@/components/ui/ToastProvider";

type OrderItem = {
  id: string;
  product_name_snapshot: string;
  unit_snapshot: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

// Dashboard equivalent of the WhatsApp staff Edit flow — same "adjust
// quantity or drop the item" capability, editable inline instead of via
// chat since the dashboard has room for a real stepper. Only rendered
// while the order is still pending (see the order detail page), matching
// the same window the WhatsApp flow allows editing in.
export default function OrderItemsEditor({
  orderId,
  initialItems,
  showRevenue,
}: {
  orderId: string;
  initialItems: OrderItem[];
  showRevenue: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<OrderItem[]>(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function updateQuantity(item: OrderItem, nextQuantity: number) {
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/shop/orders/${orderId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: nextQuantity }),
      });
      const data = await response.json();

      if (!response.ok) {
        toast(data.error || "Failed to update item", "error");
        return;
      }

      if (data.removed) {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        toast(`${item.product_name_snapshot} removed — customer notified`);
      } else {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, quantity: nextQuantity, subtotal: i.unit_price * nextQuantity } : i))
        );
        toast(`Quantity updated — customer notified`);
      }
      router.refresh();
    } catch {
      toast("Failed to update item. Please try again.", "error");
    } finally {
      setBusyId(null);
    }
  }

  function removeItem(item: OrderItem) {
    if (items.length <= 1) {
      toast("Can't remove every item — use Reject instead if none of these are available.", "error");
      return;
    }
    if (!window.confirm(`Remove ${item.product_name_snapshot} from this order?`)) return;
    updateQuantity(item, 0);
  }

  return (
    <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px 0", fontSize: 12, color: "#667781" }}>
        Order still pending — adjust quantity or remove an item if something's unavailable. The customer is notified of any change.
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={S.th}>Item</th>
            <th style={S.th}>Qty</th>
            {showRevenue && <th style={S.th}>Unit price</th>}
            {showRevenue && <th style={{ ...S.th, textAlign: "right" }}>Subtotal</th>}
            <th style={{ ...S.th, textAlign: "right" }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const busy = busyId === item.id;
            return (
              <tr key={item.id}>
                <td style={{ ...S.td, color: "#111B21", fontWeight: 500 }}>{item.product_name_snapshot}</td>
                <td style={S.td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      type="button"
                      disabled={busy || item.quantity <= 1}
                      onClick={() => updateQuantity(item, item.quantity - 1)}
                      title="Decrease quantity"
                      style={{
                        ...S.btn("#F5F6F6", "#111B21"),
                        padding: "3px 7px",
                        opacity: busy || item.quantity <= 1 ? 0.4 : 1,
                      }}
                    >
                      <Minus size={12} />
                    </button>
                    <span style={{ minWidth: 24, textAlign: "center" }}>
                      {item.quantity} {item.unit_snapshot}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateQuantity(item, item.quantity + 1)}
                      title="Increase quantity"
                      style={{ ...S.btn("#F5F6F6", "#111B21"), padding: "3px 7px", opacity: busy ? 0.4 : 1 }}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </td>
                {showRevenue && <td style={S.td}>₹{Number(item.unit_price).toFixed(2)}</td>}
                {showRevenue && <td style={{ ...S.td, textAlign: "right" }}>₹{Number(item.subtotal).toFixed(2)}</td>}
                <td style={{ ...S.td, textAlign: "right" }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removeItem(item)}
                    title="Remove item"
                    style={{ ...S.btn("rgba(239,68,68,0.12)", "#C0392B"), padding: "5px 8px", opacity: busy ? 0.4 : 1 }}
                  >
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
