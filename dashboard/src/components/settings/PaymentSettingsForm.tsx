"use client";

import { useState } from "react";
import { inputStyle, labelStyle, saveButtonStyle, noticeStyle, errorStyle, successStyle } from "./settingsStyles";
import { useToast } from "@/components/ui/ToastProvider";

export type PaymentSettings = {
  upi_id: string | null;
  accepted_payment_methods: string[] | null;
};

const METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "online", label: "Online (card/netbanking)" },
  { value: "pay_later", label: "Pay later (khata/credit)" },
];

export default function PaymentSettingsForm({ initial }: { initial: Partial<PaymentSettings> | null }) {
  const toast = useToast();
  const [upiId, setUpiId] = useState(initial?.upi_id ?? "");
  const [methods, setMethods] = useState<string[]>(initial?.accepted_payment_methods ?? ["cash"]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function toggleMethod(value: string) {
    setMethods((prev) => (prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value]));
  }

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
          upi_id: upiId.trim() || null,
          accepted_payment_methods: methods.length > 0 ? methods : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to save payment settings");
        toast(data.error || "Failed to save payment settings", "error");
        return;
      }

      setSaved(true);
      toast("Payment settings saved");
    } catch {
      setError("Failed to save payment settings. Please try again.");
      toast("Failed to save payment settings", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={noticeStyle}>
        Saved here for now — the WhatsApp bot currently always offers Cash and UPI regardless of
        this setting, and doesn&apos;t use the UPI ID below yet.
      </div>

      {error && <div style={errorStyle}>{error}</div>}
      {saved && !error && <div style={successStyle}>Saved.</div>}

      <div>
        <label style={labelStyle}>UPI ID</label>
        <input style={inputStyle} value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="shopname@upi" />
      </div>

      <div>
        <label style={labelStyle}>Accepted payment methods</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          {METHOD_OPTIONS.map((m) => (
            <label key={m.value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#e2e8f0", cursor: "pointer" }}>
              <input type="checkbox" checked={methods.includes(m.value)} onChange={() => toggleMethod(m.value)} />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      <button type="submit" disabled={saving} style={saveButtonStyle(saving)}>
        {saving ? "Saving…" : "Save payment settings"}
      </button>
    </form>
  );
}
