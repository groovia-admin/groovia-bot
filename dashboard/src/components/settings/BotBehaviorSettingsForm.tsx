"use client";

import { useState } from "react";
import { inputStyle, labelStyle, saveButtonStyle, noticeStyle, errorStyle, successStyle, ToggleRow } from "./settingsStyles";

type BusinessHours = { open: string; close: string } | null;

export type BotBehaviorSettings = {
  order_acceptance_enabled: boolean;
  auto_accept_orders: boolean;
  welcome_message: string | null;
  away_message: string | null;
  business_hours: BusinessHours;
};

const DEFAULTS: BotBehaviorSettings = {
  order_acceptance_enabled: true,
  auto_accept_orders: false,
  welcome_message: null,
  away_message: null,
  business_hours: null,
};

export default function BotBehaviorSettingsForm({ initial }: { initial: Partial<BotBehaviorSettings> | null }) {
  const merged = { ...DEFAULTS, ...(initial ?? {}) };

  const [orderAcceptanceEnabled, setOrderAcceptanceEnabled] = useState(merged.order_acceptance_enabled);
  const [autoAcceptOrders, setAutoAcceptOrders] = useState(merged.auto_accept_orders);
  const [welcomeMessage, setWelcomeMessage] = useState(merged.welcome_message ?? "");
  const [awayMessage, setAwayMessage] = useState(merged.away_message ?? "");
  const [hoursEnabled, setHoursEnabled] = useState(Boolean(merged.business_hours));
  const [openTime, setOpenTime] = useState(merged.business_hours?.open ?? "09:00");
  const [closeTime, setCloseTime] = useState(merged.business_hours?.close ?? "21:00");

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
          order_acceptance_enabled: orderAcceptanceEnabled,
          auto_accept_orders: autoAcceptOrders,
          welcome_message: welcomeMessage.trim() || null,
          away_message: awayMessage.trim() || null,
          business_hours: hoursEnabled ? { open: openTime, close: closeTime } : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to save bot behavior settings");
        return;
      }

      setSaved(true);
    } catch {
      setError("Failed to save bot behavior settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={noticeStyle}>
        The welcome message is sent live to customers. Auto-accept, business hours, and the away
        message are saved here but not yet enforced by the WhatsApp bot — orders still need manual
        Accept/Reject and the bot replies at any hour today.
      </div>

      {error && <div style={errorStyle}>{error}</div>}
      {saved && !error && <div style={successStyle}>Saved.</div>}

      <ToggleRow
        label="Accepting new orders"
        on={orderAcceptanceEnabled}
        onToggle={() => setOrderAcceptanceEnabled((v) => !v)}
      />
      <ToggleRow
        label="Auto-accept orders (skip manual review)"
        on={autoAcceptOrders}
        onToggle={() => setAutoAcceptOrders((v) => !v)}
      />

      <div>
        <label style={labelStyle}>Welcome message</label>
        <textarea
          style={{ ...inputStyle, resize: "vertical" }}
          rows={3}
          value={welcomeMessage}
          onChange={(e) => setWelcomeMessage(e.target.value)}
          placeholder={"Namaste! 👋 Welcome to our shop.\n\nTap below to browse and order."}
        />
      </div>

      <div>
        <label style={labelStyle}>Away message (shown outside business hours)</label>
        <textarea
          style={{ ...inputStyle, resize: "vertical" }}
          rows={2}
          value={awayMessage}
          onChange={(e) => setAwayMessage(e.target.value)}
          placeholder="Sorry, we're closed right now. We open at 9 AM."
        />
      </div>

      <ToggleRow label="Set business hours" on={hoursEnabled} onToggle={() => setHoursEnabled((v) => !v)} />

      {hoursEnabled && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={labelStyle}>Opens at</label>
            <input style={inputStyle} type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Closes at</label>
            <input style={inputStyle} type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
          </div>
        </div>
      )}

      <button type="submit" disabled={saving} style={saveButtonStyle(saving)}>
        {saving ? "Saving…" : "Save bot behavior"}
      </button>
    </form>
  );
}
