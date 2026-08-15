"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { inputStyle, saveButtonStyle, errorStyle, successStyle } from "./settingsStyles";
import { useToast } from "@/components/ui/ToastProvider";

export default function DeclineReasonsSettingsForm({ initial }: { initial: string[] }) {
  const toast = useToast();
  const [reasons, setReasons] = useState(initial.length > 0 ? initial : [""]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function addReason() {
    const text = draft.trim();
    if (!text) return;
    if (reasons.some((r) => r.toLowerCase() === text.toLowerCase())) {
      setError(`"${text}" is already in the list`);
      return;
    }
    setReasons((prev) => [...prev.filter((r) => r.trim()), text]);
    setDraft("");
    setError("");
  }

  function removeReason(index: number) {
    setReasons((prev) => prev.filter((_, i) => i !== index));
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
        body: JSON.stringify({ order_decline_reasons: reasons.filter((r) => r.trim()) }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to save reasons");
        toast(data.error || "Failed to save reasons", "error");
        return;
      }

      setSaved(true);
      toast("Decline reasons saved");
    } catch {
      setError("Failed to save reasons. Please try again.");
      toast("Failed to save reasons", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {error && <div style={errorStyle}>{error}</div>}
      {saved && !error && <div style={successStyle}>Saved.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {reasons.filter((r) => r.trim()).map((reason, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: 8, padding: "8px 10px 8px 14px" }}>
            <span style={{ flex: 1, fontSize: "var(--text-base)", color: "var(--ink)" }}>{reason}</span>
            <button
              type="button"
              onClick={() => removeReason(i)}
              aria-label={`Remove "${reason}"`}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-faint)", display: "flex", padding: 4 }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {reasons.filter((r) => r.trim()).length === 0 && (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--ink-faint)", margin: 0 }}>No preset reasons yet — staff will only see the free-text box.</p>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={inputStyle}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addReason(); } }}
          placeholder="e.g. Item damaged in stock"
          maxLength={80}
        />
        <button type="button" onClick={addReason} style={{ ...saveButtonStyle(false), background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--surface-border)", flexShrink: 0 }}>
          <Plus size={14} /> Add
        </button>
      </div>

      <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-faint)", margin: 0 }}>
        Shown as quick-pick options when rejecting or cancelling an order — staff can still type a custom reason instead.
      </p>

      <button type="submit" disabled={saving} style={saveButtonStyle(saving)}>
        {saving ? "Saving…" : "Save decline reasons"}
      </button>
    </form>
  );
}
