// Shared style tokens for the dashboard's inline-styled list/table pages
// (Staff, Logs, Products, ...). Previously each component defined its own
// near-identical copy of this object — centralizing it means the WhatsApp
// palette lives in one place, not N places that can drift apart.
export const S = {
  card: {
    background: "#FFFFFF",
    border: "1px solid #E9EDEF",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 1px 2px rgba(17,27,33,0.04)",
  } as React.CSSProperties,
  input: {
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
  } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: 12,
    color: "#667781",
    marginBottom: 6,
    fontWeight: 600,
  } as React.CSSProperties,
  th: {
    textAlign: "left",
    padding: "10px 16px",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.7px",
    color: "#667781",
    fontWeight: 600,
    borderBottom: "1px solid #E9EDEF",
  } as React.CSSProperties,
  td: {
    padding: "12px 16px",
    fontSize: 13,
    color: "#667781",
    borderBottom: "1px solid #F0F2F5",
  } as React.CSSProperties,
  badge: (color: string, background: string) =>
    ({
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 10px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 600,
      color,
      background,
      border: `1px solid ${color}33`,
    }) as React.CSSProperties,
  btn: (background: string, color: string) =>
    ({
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "8px 14px",
      borderRadius: 8,
      border: "none",
      background,
      color,
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
    }) as React.CSSProperties,
};
