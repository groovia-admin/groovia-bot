"use client";

import { useState } from "react";
import { inputStyle, labelStyle, saveButtonStyle, noticeStyle, errorStyle, successStyle, ToggleRow } from "./settingsStyles";

export type DeliverySettings = {
  allow_pickup: boolean;
  allow_delivery: boolean;
  minimum_order_amount: number | null;
  delivery_fee: number;
  delivery_radius_km: number | null;
  free_delivery_above: number | null;
  tax_enabled: boolean;
  tax_percentage: number | null;
};

const DEFAULTS: DeliverySettings = {
  allow_pickup: true,
  allow_delivery: false,
  minimum_order_amount: null,
  delivery_fee: 0,
  delivery_radius_km: null,
  free_delivery_above: null,
  tax_enabled: false,
  tax_percentage: null,
};

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default function DeliverySettingsForm({ initial }: { initial: Partial<DeliverySettings> | null }) {
  const merged = { ...DEFAULTS, ...(initial ?? {}) };

  const [allowPickup, setAllowPickup] = useState(merged.allow_pickup);
  const [allowDelivery, setAllowDelivery] = useState(merged.allow_delivery);
  const [minimumOrderAmount, setMinimumOrderAmount] = useState(merged.minimum_order_amount?.toString() ?? "");
  const [deliveryFee, setDeliveryFee] = useState(merged.delivery_fee.toString());
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState(merged.delivery_radius_km?.toString() ?? "");
  const [freeDeliveryAbove, setFreeDeliveryAbove] = useState(merged.free_delivery_above?.toString() ?? "");
  const [taxEnabled, setTaxEnabled] = useState(merged.tax_enabled);
  const [taxPercentage, setTaxPercentage] = useState(merged.tax_percentage?.toString() ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const response = await fetch("/api/shop/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allow_pickup: allowPickup,
          allow_delivery: allowDelivery,
          minimum_order_amount: numberOrNull(minimumOrderAmount),
          delivery_fee: numberOrNull(deliveryFee) ?? 0,
          delivery_radius_km: numberOrNull(deliveryRadiusKm),
          free_delivery_above: numberOrNull(freeDeliveryAbove),
          tax_enabled: taxEnabled,
          tax_percentage: numberOrNull(taxPercentage),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to save order & delivery settings");
        return;
      }

      setSaved(true);
    } catch {
      setError("Failed to save order & delivery settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={noticeStyle}>
        Saved here for now — the WhatsApp ordering flow doesn&apos;t apply delivery fees, tax, or the
        minimum order amount to orders yet, and every order is currently created with ₹0 delivery
        fee regardless of this setting.
      </div>

      {error && <div style={errorStyle}>{error}</div>}
      {saved && !error && <div style={successStyle}>Saved.</div>}

      <ToggleRow label="Allow pickup" on={allowPickup} onToggle={() => setAllowPickup((v) => !v)} />
      <ToggleRow label="Allow delivery" on={allowDelivery} onToggle={() => setAllowDelivery((v) => !v)} />

      <div>
        <label style={labelStyle}>Minimum order amount (₹)</label>
        <input
          style={inputStyle}
          type="number"
          min={0}
          value={minimumOrderAmount}
          onChange={(e) => setMinimumOrderAmount(e.target.value)}
          placeholder="No minimum"
        />
      </div>

      {allowDelivery && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingLeft: 14, borderLeft: "2px solid #334155" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Delivery fee (₹)</label>
              <input style={inputStyle} type="number" min={0} value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Delivery radius (km)</label>
              <input
                style={inputStyle}
                type="number"
                min={0}
                value={deliveryRadiusKm}
                onChange={(e) => setDeliveryRadiusKm(e.target.value)}
                placeholder="No limit"
              />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Free delivery above (₹)</label>
            <input
              style={inputStyle}
              type="number"
              min={0}
              value={freeDeliveryAbove}
              onChange={(e) => setFreeDeliveryAbove(e.target.value)}
              placeholder="Not offered"
            />
          </div>
        </div>
      )}

      <ToggleRow label="Charge tax" on={taxEnabled} onToggle={() => setTaxEnabled((v) => !v)} />

      {taxEnabled && (
        <div style={{ paddingLeft: 14, borderLeft: "2px solid #334155" }}>
          <label style={labelStyle}>Tax percentage (%)</label>
          <input style={inputStyle} type="number" min={0} max={100} step={0.01} value={taxPercentage} onChange={(e) => setTaxPercentage(e.target.value)} />
        </div>
      )}

      <button type="submit" disabled={saving} style={saveButtonStyle(saving)}>
        {saving ? "Saving…" : "Save order & delivery"}
      </button>
    </form>
  );
}
