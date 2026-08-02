"use client";

import { useState } from "react";

type Connection = {
  phone_number_id: string;
  business_account_id: string | null;
  display_phone_number: string | null;
  connection_status: string;
} | null;

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 14px",
  borderRadius: 8,
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#f1f5f9",
  fontSize: 13,
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#94a3b8",
  marginBottom: 6,
  fontWeight: 600,
};

export default function WhatsappConnectionForm({ initialConnection }: { initialConnection: Connection }) {
  const [phoneNumberId, setPhoneNumberId] = useState(initialConnection?.phone_number_id ?? "");
  const [businessAccountId, setBusinessAccountId] = useState(initialConnection?.business_account_id ?? "");
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState(initialConnection?.display_phone_number ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(Boolean(initialConnection));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const response = await fetch("/api/shop/whatsapp-connection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number_id: phoneNumberId,
          business_account_id: businessAccountId,
          display_phone_number: displayPhoneNumber,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to save WhatsApp connection");
        return;
      }

      setSaved(true);
    } catch {
      setError("Failed to save WhatsApp connection. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 12, color: "#64748b", margin: 0, lineHeight: 1.5 }}>
        Find these values in Meta Business Manager → WhatsApp Manager → API Setup for the number you
        want customers and staff to message.
      </p>

      {error && (
        <div
          style={{
            color: "#f87171",
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {saved && !error && (
        <div
          style={{
            color: "#4ade80",
            background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.2)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
          }}
        >
          Connected.
        </div>
      )}

      <div>
        <label style={labelStyle}>Phone Number ID</label>
        <input
          style={inputStyle}
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
          placeholder="e.g. 1135902319616581"
          required
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={labelStyle}>WhatsApp Business Account ID (optional)</label>
          <input
            style={inputStyle}
            value={businessAccountId}
            onChange={(e) => setBusinessAccountId(e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>Display phone number (optional)</label>
          <input
            style={inputStyle}
            value={displayPhoneNumber}
            onChange={(e) => setDisplayPhoneNumber(e.target.value)}
            placeholder="+91 98765 43210"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={saving || !phoneNumberId.trim()}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "9px 16px",
          borderRadius: 8,
          border: "none",
          background: "#3b82f6",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          width: "fit-content",
          opacity: saving || !phoneNumberId.trim() ? 0.5 : 1,
        }}
      >
        {saving ? "Saving…" : "Save connection"}
      </button>
    </form>
  );
}
