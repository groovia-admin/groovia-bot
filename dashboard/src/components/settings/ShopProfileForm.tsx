"use client";

import { useState } from "react";
import { inputStyle, labelStyle, saveButtonStyle, errorStyle, successStyle } from "./settingsStyles";
import { useToast } from "@/components/ui/ToastProvider";

export type ShopProfile = {
  name: string;
  description: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

export default function ShopProfileForm({
  initial,
  whatsappNumber,
}: {
  initial: ShopProfile;
  whatsappNumber: string | null;
}) {
  const toast = useToast();

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [addressLine1, setAddressLine1] = useState(initial.address_line_1 ?? "");
  const [addressLine2, setAddressLine2] = useState(initial.address_line_2 ?? "");
  const [city, setCity] = useState(initial.city ?? "");
  const [state, setState] = useState(initial.state ?? "");
  const [postalCode, setPostalCode] = useState(initial.postal_code ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      setError("Shop name cannot be empty");
      return;
    }

    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const response = await fetch("/api/shop/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          address_line_1: addressLine1 || null,
          address_line_2: addressLine2 || null,
          city: city || null,
          state: state || null,
          postal_code: postalCode || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to save shop details");
        toast(data.error || "Failed to save shop details", "error");
        return;
      }

      setSaved(true);
      toast("Shop details saved");
    } catch {
      setError("Failed to save shop details. Please try again.");
      toast("Failed to save shop details", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error && <div style={errorStyle}>{error}</div>}
      {saved && !error && <div style={successStyle}>Saved.</div>}

      <div>
        <label style={labelStyle}>Shop name</label>
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div>
        <label style={labelStyle}>Description (optional)</label>
        <input
          style={inputStyle}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What you sell, in a few words"
        />
      </div>

      <div>
        <label style={labelStyle}>Address line 1</label>
        <input
          style={inputStyle}
          value={addressLine1}
          onChange={(e) => setAddressLine1(e.target.value)}
          placeholder="Shop no., building, street"
        />
      </div>

      <div>
        <label style={labelStyle}>Address line 2 (optional)</label>
        <input
          style={inputStyle}
          value={addressLine2}
          onChange={(e) => setAddressLine2(e.target.value)}
          placeholder="Landmark, area"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div>
          <label style={labelStyle}>City</label>
          <input style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>State</label>
          <input style={inputStyle} value={state} onChange={(e) => setState(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>PIN code</label>
          <input style={inputStyle} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
        </div>
      </div>

      <div>
        <label style={labelStyle}>WhatsApp number</label>
        <input style={{ ...inputStyle, background: "#F7F8FA", color: "var(--ink-muted)" }} value={whatsappNumber ?? "Not connected"} disabled />
        <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-faint)", margin: "6px 0 0" }}>
          Shown to customers automatically — set up under your WhatsApp connection, not editable here.
        </p>
      </div>

      <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-faint)", margin: 0 }}>
        Name, address, and this number are shown to customers in the WhatsApp welcome message when they start an order.
      </p>

      <button type="submit" disabled={saving} style={saveButtonStyle(saving)}>
        {saving ? "Saving…" : "Save shop details"}
      </button>
    </form>
  );
}
