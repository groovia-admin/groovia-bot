// Shared style tokens for the dashboard's inline-styled list/table pages
// (Staff, Logs, Products, ...). Previously each component defined its own
// near-identical copy of this object — centralizing it means the brand
// palette lives in one place, not N places that can drift apart. Values
// are var() references into globals.css's :root tokens, not literals, so
// this file and globals.css can never drift apart on what "the surface
// border" or "muted text" actually is.
export const S = {
  card: {
    background: "var(--surface-card)",
    border: "1px solid var(--surface-border)",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 1px 2px rgba(11,28,48,0.06)",
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "9px 14px",
    borderRadius: 8,
    border: "1px solid var(--surface-border)",
    background: "var(--surface-card)",
    color: "var(--ink)",
    fontSize: "var(--text-base)",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: "var(--text-sm)",
    color: "var(--ink-muted)",
    marginBottom: 6,
    fontWeight: 600,
  } as React.CSSProperties,
  th: {
    textAlign: "left",
    padding: "10px 16px",
    fontSize: "var(--text-xs)",
    textTransform: "uppercase",
    letterSpacing: "0.7px",
    color: "var(--ink-muted)",
    fontWeight: 600,
    borderBottom: "1px solid var(--surface-border)",
  } as React.CSSProperties,
  td: {
    padding: "12px 16px",
    fontSize: "var(--text-base)",
    color: "var(--ink-muted)",
    borderBottom: "1px solid var(--surface)",
  } as React.CSSProperties,
  badge: (color: string, background: string) =>
    ({
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 10px",
      borderRadius: 999,
      fontSize: "var(--text-xs)",
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
      fontSize: "var(--text-base)",
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
    }) as React.CSSProperties,
};
