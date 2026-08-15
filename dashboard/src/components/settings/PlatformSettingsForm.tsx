"use client";

import { useState } from "react";
import { inputStyle, labelStyle, saveButtonStyle, errorStyle, successStyle, noticeStyle, ToggleRow } from "./settingsStyles";
import { useToast } from "@/components/ui/ToastProvider";

type Initial = {
  support_email: string | null;
  support_phone: string | null;
  announcement_message: string | null;
  announcement_enabled: boolean;
};

export default function PlatformSettingsForm({ initial }: { initial: Initial }) {
  const toast = useToast();
  const [supportEmail, setSupportEmail] = useState(initial.support_email ?? "");
  const [supportPhone, setSupportPhone] = useState(initial.support_phone ?? "");
  const [announcement, setAnnouncement] = useState(initial.announcement_message ?? "");
  const [announcementOn, setAnnouncementOn] = useState(initial.announcement_enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const response = await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          support_email: supportEmail.trim() || null,
          support_phone: supportPhone.trim() || null,
          announcement_message: announcement.trim() || null,
          announcement_enabled: announcementOn,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to save platform settings");
        toast(data.error || "Failed to save platform settings", "error");
        return;
      }

      setSaved(true);
      toast("Platform settings saved");
    } catch {
      setError("Failed to save platform settings. Please try again.");
      toast("Failed to save platform settings", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div style={errorStyle}>{error}</div>}
      {saved && !error && <div style={successStyle}>Saved.</div>}

      <div>
        <div style={labelStyle}>Support email</div>
        <input
          style={inputStyle}
          type="email"
          value={supportEmail}
          onChange={(e) => setSupportEmail(e.target.value)}
          placeholder="admin@groovia.co.in"
        />
      </div>

      <div>
        <div style={labelStyle}>Support phone</div>
        <input
          style={inputStyle}
          type="tel"
          value={supportPhone}
          onChange={(e) => setSupportPhone(e.target.value)}
          placeholder="+91 XXXXX XXXXX"
        />
      </div>

      <p style={noticeStyle}>
        Shown on the sign-in page as the contact for shop owners who need help getting access.
      </p>

      <div style={{ borderTop: "1px solid var(--surface-border)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <ToggleRow label="Show announcement banner to all shop owners" on={announcementOn} onToggle={() => setAnnouncementOn((v) => !v)} />
        <textarea
          style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
          value={announcement}
          onChange={(e) => setAnnouncement(e.target.value)}
          placeholder="e.g. Scheduled maintenance tonight 11pm–1am IST — ordering may be briefly unavailable."
          maxLength={300}
        />
        <p style={noticeStyle}>
          Appears at the top of every shop owner and manager&apos;s dashboard while enabled — use it for planned downtime or platform-wide notices.
        </p>
      </div>

      <button type="submit" disabled={saving} style={saveButtonStyle(saving)}>
        {saving ? "Saving…" : "Save platform settings"}
      </button>
    </form>
  );
}
