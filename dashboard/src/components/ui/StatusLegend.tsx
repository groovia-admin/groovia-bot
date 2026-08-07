"use client";

// Small reference strip explaining what each status color/badge means —
// shown near status badges/toggles so "what does green mean" doesn't
// require guessing. Used on Orders, Products, and Staff pages.
export default function StatusLegend({ items }: { items: { color: string; label: string; hint?: string }[] }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px 16px",
        alignItems: "center",
        padding: "10px 14px",
        background: "#F7F8FA",
        border: "1px solid #E9EDEF",
        borderRadius: 10,
        fontSize: 12,
        color: "#667781",
      }}
    >
      {items.map((item) => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
          <span style={{ color: "#111B21", fontWeight: 600 }}>{item.label}</span>
          {item.hint && <span>— {item.hint}</span>}
        </div>
      ))}
    </div>
  );
}
