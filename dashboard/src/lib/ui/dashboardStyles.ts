// Shared style tokens for the dashboard's inline-styled list/table pages
// (Staff, Logs, Products, ...). Previously each component defined its own
// near-identical copy of this object — centralizing it means the brand
// palette lives in one place, not N places that can drift apart. Values
// are var() references into globals.css's :root tokens, not literals, so
// this file and globals.css can never drift apart on what "the surface
// border" or "muted text" actually is.
export const S = {
  // A soft two-layer shadow (tight contact + a wider diffused layer) plus a
  // faint inset top highlight reads as gently raised off the page — the
  // same restrained "tactile" language the login page's button already
  // used, just not previously carried into the rest of the dashboard.
  card: {
    background: "var(--surface-card)",
    border: "1px solid var(--surface-border)",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 1px 2px rgba(11,28,48,0.05), 0 8px 20px -14px rgba(11,28,48,0.12), inset 0 1px 0 rgba(255,255,255,0.5)",
  } as React.CSSProperties,
  // A faint inset shadow instead of a flat fill reads as a shallow, pressed-
  // in field rather than just a bordered box.
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
    boxShadow: "inset 0 1px 2px rgba(11,28,48,0.04)",
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
  // A subtle gloss (light top, faint shade bottom) layered over whatever
  // solid color the caller passes, plus a soft drop shadow and an inset
  // top highlight — works for any background color since the gradient is a
  // second, semi-transparent background-image rather than a per-color mix.
  // A "transparent" background means the caller wants a ghost/link-style
  // button (e.g. a "Back" link) — those stay flat, no depth to fake.
  btn: (background: string, color: string) => {
    const ghost = background === "transparent";
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "8px 14px",
      borderRadius: 8,
      border: ghost ? "none" : "1px solid rgba(11,28,48,0.05)",
      backgroundColor: background,
      backgroundImage: ghost ? undefined : "linear-gradient(180deg, rgba(255,255,255,0.16), rgba(11,28,48,0.04))",
      color,
      fontSize: "var(--text-base)",
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
      boxShadow: ghost ? undefined : "0 1px 2px rgba(11,28,48,0.06), 0 3px 8px -4px rgba(11,28,48,0.18), inset 0 1px 0 rgba(255,255,255,0.2)",
    } as React.CSSProperties;
  },
};
