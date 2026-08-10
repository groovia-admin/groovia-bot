"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ShoppingBag, Package, Users, CornerDownLeft } from "lucide-react";

type OrderResult = { id: string; order_number: string; status: string; total_amount: number; customer_name: string | null };
type ProductResult = { id: string; name: string; unit: string; price: number; sku: string | null };
type CustomerResult = { id: string; full_name: string | null; phone: string };

type FlatResult = { key: string; href: string; icon: typeof ShoppingBag; primary: string; secondary: string };

const STATUS_COLOR: Record<string, string> = {
  pending: "#B7791F",
  accepted: "#1D4ED8",
  preparing: "#6D28D9",
  ready: "#0F9D6B",
  completed: "#4B5563",
  rejected: "var(--error)",
  cancelled: "var(--error)",
};

export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ orders: OrderResult[]; products: ProductResult[]; customers: CustomerResult[] }>({ orders: [], products: [], customers: [] });
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cmd/Ctrl+K opens from anywhere in the dashboard; Escape closes.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults({ orders: [], products: [], customers: [] });
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults({ orders: [], products: [], customers: [] });
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/shop/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) setResults(await res.json());
      } catch {
        // A failed search just shows no results — not worth surfacing an
        // error for what's a convenience shortcut, not a critical action.
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const flatResults: FlatResult[] = [
    ...results.orders.map((o) => ({
      key: `order-${o.id}`,
      href: `/dashboard/orders/${o.id}`,
      icon: ShoppingBag,
      primary: `#${o.order_number}`,
      secondary: `${o.customer_name ?? "Unknown customer"} · ${o.status}`,
    })),
    ...results.products.map((p) => ({
      key: `product-${p.id}`,
      href: `/dashboard/products/${p.id}`,
      icon: Package,
      primary: p.name,
      secondary: `${p.unit} · ₹${Number(p.price).toFixed(0)}${p.sku ? ` · ${p.sku}` : ""}`,
    })),
    ...results.customers.map((c) => ({
      key: `customer-${c.id}`,
      href: `/dashboard/customers/${c.id}`,
      icon: Users,
      primary: c.full_name || "Unnamed customer",
      secondary: c.phone,
    })),
  ];

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatResults[activeIndex]) {
      e.preventDefault();
      go(flatResults[activeIndex].href);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Search orders, products, customers (Ctrl/Cmd+K)"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 10px",
          borderRadius: 8,
          border: "1px solid var(--surface-border)",
          background: "#FFFFFF",
          color: "var(--ink-faint)",
          fontSize: "var(--text-base)",
          cursor: "pointer",
          fontFamily: "inherit",
          width: "100%",
          maxWidth: 260,
        }}
      >
        <Search size={14} />
        <span style={{ flex: 1, textAlign: "left" }}>Search…</span>
        <span style={{ fontSize: "var(--text-xs)", border: "1px solid var(--surface-border)", borderRadius: 4, padding: "1px 5px", color: "var(--ink-faint)" }}>Ctrl K</span>
      </button>

      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh" }}
          onClick={() => setOpen(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "rgba(11,28,48,0.4)" }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: "relative", width: "100%", maxWidth: 560, background: "#FFFFFF", borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--surface-border)" }}>
              <Search size={16} color="var(--ink-faint)" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Search orders, products, customers…"
                style={{ flex: 1, border: "none", outline: "none", fontSize: "var(--text-md)", color: "var(--ink)", fontFamily: "inherit" }}
              />
            </div>

            <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
              {query.trim().length < 2 ? (
                <div style={{ padding: 24, fontSize: "var(--text-base)", color: "var(--ink-faint)", textAlign: "center" }}>Type at least 2 characters to search.</div>
              ) : loading ? (
                <div style={{ padding: 24, fontSize: "var(--text-base)", color: "var(--ink-faint)", textAlign: "center" }}>Searching…</div>
              ) : flatResults.length === 0 ? (
                <div style={{ padding: 24, fontSize: "var(--text-base)", color: "var(--ink-faint)", textAlign: "center" }}>No matches for &quot;{query}&quot;.</div>
              ) : (
                flatResults.map((r, i) => (
                  <button
                    key={r.key}
                    onClick={() => go(r.href)}
                    onMouseEnter={() => setActiveIndex(i)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 16px",
                      background: i === activeIndex ? "var(--surface)" : "transparent",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                    }}
                  >
                    <r.icon size={15} color="var(--ink-muted)" style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.primary}
                      </div>
                      <div style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.secondary}</div>
                    </div>
                    {r.key.startsWith("order-") && (
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: STATUS_COLOR[results.orders.find((o) => `order-${o.id}` === r.key)?.status ?? ""] ?? "var(--ink-faint)",
                        }}
                      />
                    )}
                    {i === activeIndex && <CornerDownLeft size={13} color="var(--ink-faint)" style={{ flexShrink: 0 }} />}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
