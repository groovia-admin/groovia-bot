"use client";

import { useState } from "react";
import { inputStyle, labelStyle, saveButtonStyle, errorStyle, successStyle, noticeStyle } from "./settingsStyles";
import { useToast } from "@/components/ui/ToastProvider";

type Initial = {
  default_trial_days: number;
};

// Separate from PlatformSettingsForm on purpose — this page already
// groups settings into one SettingsCard per concern (Support &
// Announcements, Payout & Banking), and "operational defaults" is its
// own concern, not a support/announcement setting. Both forms PATCH the
// same /api/admin/platform-settings route, just with different fields.
export default function PlatformDefaultsForm({ initial }: { initial: Initial }) {
  const toast = useToast();
  const [defaultTrialDays, setDefaultTrialDays] = useState(String(initial.default_trial_days));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    const days = Number(defaultTrialDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setError("Enter a whole number of days between 1 and 365");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_trial_days: days }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to save platform defaults");
        toast(data.error || "Failed to save platform defaults", "error");
        return;
      }

      setSaved(true);
      toast("Platform defaults saved");
    } catch {
      setError("Failed to save platform defaults. Please try again.");
      toast("Failed to save platform defaults", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div style={errorStyle}>{error}</div>}
      {saved && !error && <div style={successStyle}>Saved.</div>}

      <div>
        <div style={labelStyle}>Default trial length (days)</div>
        <input
          style={{ ...inputStyle, maxWidth: 120 }}
          type="number"
          min={1}
          max={365}
          value={defaultTrialDays}
          onChange={(e) => setDefaultTrialDays(e.target.value)}
        />
        <p style={noticeStyle}>Applied to every new shop's trial_ends_at at creation — changing this doesn't affect shops already created.</p>
      </div>

      <button type="submit" disabled={saving} style={saveButtonStyle(saving)}>
        {saving ? "Saving…" : "Save platform defaults"}
      </button>
    </form>
  );
}
