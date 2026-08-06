export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 14px",
  borderRadius: 8,
  border: "1px solid #E9EDEF",
  background: "#FFFFFF",
  color: "#111B21",
  fontSize: 13,
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

export const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#667781",
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
  background: "#25D366",
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
  color: "#667781",
  background: "#F0F2F5",
  border: "1px solid #E9EDEF",
  borderRadius: 8,
  padding: "8px 12px",
  lineHeight: 1.5,
};

export const errorStyle: React.CSSProperties = {
  color: "#C0392B",
  background: "#FDECEA",
  border: "1px solid #F5C6C2",
  borderRadius: 8,
  padding: "10px 14px",
  fontSize: 13,
};

export const successStyle: React.CSSProperties = {
  color: "#128C7E",
  background: "#DCF8C6",
  border: "1px solid #B9EFA4",
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
        background: on ? "#25D366" : "#E9EDEF",
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
          boxShadow: "0 1px 2px rgba(17,27,33,0.2)",
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
      <span style={{ fontSize: 13, color: "#111B21" }}>{label}</span>
      <Toggle on={on} onToggle={onToggle} disabled={disabled} />
    </div>
  );
}
