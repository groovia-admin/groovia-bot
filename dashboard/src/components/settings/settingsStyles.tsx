export const inputStyle: React.CSSProperties = {
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

export const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#94a3b8",
  marginBottom: 6,
  fontWeight: 600,
};

export const saveButtonStyle = (disabled: boolean): React.CSSProperties => ({
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
  opacity: disabled ? 0.5 : 1,
});

export const noticeStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: "#64748b",
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 8,
  padding: "8px 12px",
  lineHeight: 1.5,
};

export const errorStyle: React.CSSProperties = {
  color: "#f87171",
  background: "rgba(239,68,68,0.1)",
  border: "1px solid rgba(239,68,68,0.2)",
  borderRadius: 8,
  padding: "10px 14px",
  fontSize: 13,
};

export const successStyle: React.CSSProperties = {
  color: "#4ade80",
  background: "rgba(34,197,94,0.1)",
  border: "1px solid rgba(34,197,94,0.2)",
  borderRadius: 8,
  padding: "10px 14px",
  fontSize: 13,
};

export function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <div
      onClick={disabled ? undefined : onToggle}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: on ? "#22c55e" : "#334155",
        position: "relative",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.15s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          position: "absolute",
          top: 3,
          left: on ? 21 : 3,
          transition: "left 0.15s",
        }}
      />
    </div>
  );
}

export function ToggleRow({
  label,
  on,
  onToggle,
  disabled,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 13, color: "#e2e8f0" }}>{label}</span>
      <Toggle on={on} onToggle={onToggle} disabled={disabled} />
    </div>
  );
}
