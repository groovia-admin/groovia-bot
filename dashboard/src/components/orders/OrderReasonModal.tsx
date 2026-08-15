"use client";

import { useState } from "react";
import { S } from "@/lib/ui/dashboardStyles";

// Shared by the Orders list (inline reject/cancel, no page navigation) and
// the order detail page's OrderActions — same reason-selection UX in both
// places instead of one having presets and the other a bare textarea.
export default function OrderReasonModal({
  title,
  presetReasons,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  presetReasons: string[];
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ position: "fixed", inset: 0, background: "rgba(11,28,48,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}
      onClick={onCancel}
    >
      <div
        style={{ ...S.card, width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 14 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: "var(--text-base)", fontWeight: 700, color: "var(--ink)" }}>{title}</div>

        {presetReasons.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {presetReasons.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setReason(preset)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  border: "1px solid " + (reason === preset ? "var(--brand)" : "var(--surface-border)"),
                  background: reason === preset ? "var(--brand-light)" : "#FFFFFF",
                  color: reason === preset ? "var(--brand-dark)" : "var(--ink-muted)",
                }}
              >
                {preset}
              </button>
            ))}
          </div>
        )}

        <div>
          <label style={S.label}>Reason{presetReasons.length > 0 ? " (or type your own)" : ""}</label>
          <textarea
            style={{ ...S.input, minHeight: 70, resize: "vertical" }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Out of stock, customer requested cancellation…"
            autoFocus
          />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={busy || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            style={{ ...S.btn("var(--error)", "#fff"), opacity: busy || !reason.trim() ? 0.5 : 1 }}
          >
            {busy ? "Saving…" : "Confirm"}
          </button>
          <button type="button" onClick={onCancel} style={S.btn("var(--surface-hover)", "var(--ink)")}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
