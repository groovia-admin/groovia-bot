"use client";

import { useState } from "react";
import { inputStyle, labelStyle, saveButtonStyle, noticeStyle, errorStyle, successStyle, ToggleRow } from "./settingsStyles";
import { useToast } from "@/components/ui/ToastProvider";

export type DailySummarySettings = {
  daily_summary_enabled: boolean;
  daily_summary_time: string;
};

const DEFAULTS: DailySummarySettings = {
  daily_summary_enabled: false,
  daily_summary_time: "08:00",
};

export default function DailySummarySettingsForm({ initial }: { initial: Partial<DailySummarySettings> | null }) {
  const toast = useToast();
  const merged = { ...DEFAULTS, ...(initial ?? {}) };

  const [enabled, setEnabled] = useState(merged.daily_summary_enabled);
  const [time, setTime] = useState(merged.daily_summary_time);

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
          daily_summary_enabled: enabled,
          daily_summary_time: time,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to save daily summary settings");
        toast(data.error || "Failed to save daily summary settings", "error");
        return;
      }

      setSaved(true);
      toast("Daily summary settings saved");
    } catch {
      setError("Failed to save daily summary settings. Please try again.");
      toast("Failed to save daily summary settings", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={noticeStyle}>
        Sends yesterday&apos;s order count, revenue, and top-selling products to active staff over WhatsApp each morning.
      </div>

      {error && <div style={errorStyle}>{error}</div>}
      {saved && !error && <div style={successStyle}>Saved.</div>}

      <ToggleRow label="Send daily summary" on={enabled} onToggle={() => setEnabled((v) => !v)} />

      {enabled && (
        <div style={{ paddingLeft: 14, borderLeft: "2px solid #E9EDEF" }}>
          <label style={labelStyle}>Send at (your shop&apos;s local time)</label>
          <input
            style={{ ...inputStyle, maxWidth: 160 }}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      )}

      <button type="submit" disabled={saving} style={saveButtonStyle(saving)}>
        {saving ? "Saving…" : "Save daily summary"}
      </button>
    </form>
  );
}
