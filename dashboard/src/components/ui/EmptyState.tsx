import type { CSSProperties, ElementType } from "react";

// Shared empty-state treatment — previously every list on the dashboard
// just rendered a bare "No X yet." string with no icon, no distinction
// between "genuinely nothing here" and "nothing matches your search," and
// no next step for the person looking at it. One component so every list
// gives the same, deliberate answer to "what do I do now."
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: ElementType;
  title: string;
  description?: string;
  action?: { label: string; href: string } | { label: string; onClick: () => void };
  compact?: boolean;
}) {
  const actionStyle: CSSProperties = {
    marginTop: 10,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    borderRadius: 8,
    background: "var(--brand)",
    color: "#fff",
    fontSize: "var(--text-sm)",
    fontWeight: 600,
    textDecoration: "none",
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
  };
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 6,
        padding: compact ? "28px 16px" : "48px 20px",
      }}
    >
      <div
        style={{
          width: compact ? 36 : 44,
          height: compact ? 36 : 44,
          borderRadius: 12,
          background: "var(--surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ink-faint)",
          marginBottom: 4,
        }}
      >
        <Icon size={compact ? 16 : 20} />
      </div>
      <div style={{ fontSize: "var(--text-md)", fontWeight: 700, color: "var(--ink)" }}>{title}</div>
      {description && (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)", maxWidth: 340 }}>{description}</div>
      )}
      {action && ("href" in action ? (
        <a href={action.href} style={actionStyle}>
          {action.label}
        </a>
      ) : (
        <button type="button" onClick={action.onClick} style={actionStyle}>
          {action.label}
        </button>
      ))}
    </div>
  );
}
