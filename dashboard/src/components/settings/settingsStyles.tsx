export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 14px",
  borderRadius: 8,
  border: "1px solid var(--surface-border)",
  background: "#FFFFFF",
  color: "var(--ink)",
  fontSize: "var(--text-base)",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

export const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--text-sm)",
  color: "var(--ink-muted)",
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
  background: "var(--brand)",
  color: "#fff",
  fontSize: "var(--text-base)",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  width: "fit-content",
  opacity: disabled ? 0.5 : 1,
});

export const noticeStyle: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  color: "var(--ink-muted)",
  background: "var(--surface)",
  border: "1px solid var(--surface-border)",
  borderRadius: 8,
  padding: "8px 12px",
  lineHeight: 1.5,
};

export const errorStyle: React.CSSProperties = {
  color: "var(--error)",
  background: "var(--error-light)",
  border: "1px solid rgba(186,26,26,0.3)",
  borderRadius: 8,
  padding: "10px 14px",
  fontSize: "var(--text-base)",
};

export const successStyle: React.CSSProperties = {
  color: "var(--brand-dark)",
  background: "var(--brand-light)",
  border: "1px solid rgba(0,104,95,0.35)",
  borderRadius: 8,
  padding: "10px 14px",
  fontSize: "var(--text-base)",
};

export function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <div
      onClick={disabled ? undefined : onToggle}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: on ? "var(--brand)" : "var(--surface-border)",
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
          boxShadow: "0 1px 2px rgba(11,28,48,0.2)",
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
      <span style={{ fontSize: "var(--text-base)", color: "var(--ink)" }}>{label}</span>
      <Toggle on={on} onToggle={onToggle} disabled={disabled} />
    </div>
  );
}
