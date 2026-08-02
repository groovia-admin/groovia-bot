"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

type Category = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  category_id: string;
  unit: string;
  price: number;
  cost_price: number | null;
  stock_quantity: number;
  low_stock_threshold: number;
  is_available: boolean;
  image_url: string | null;
  sku: string | null;
};

const S = {
  card: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: 20,
  } as React.CSSProperties,
  input: {
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
  } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: 12,
    color: "#94a3b8",
    marginBottom: 6,
    fontWeight: 600,
  } as React.CSSProperties,
  btn: (background: string, color: string) =>
    ({
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "9px 16px",
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

export default function ProductDetailClient({
  product,
  categories,
}: {
  product: Product;
  categories: Category[];
}) {
  const router = useRouter();

  const [form, setForm] = useState({
    name: product.name,
    description: product.description ?? "",
    category_id: product.category_id,
    unit: product.unit,
    price: String(product.price),
    cost_price: product.cost_price !== null ? String(product.cost_price) : "",
    stock_quantity: String(product.stock_quantity),
    low_stock_threshold: String(product.low_stock_threshold),
    image_url: product.image_url ?? "",
    sku: product.sku ?? "",
    is_available: product.is_available,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const response = await fetch(`/api/shop/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          category_id: form.category_id,
          unit: form.unit,
          price: Number(form.price),
          cost_price: form.cost_price === "" ? null : Number(form.cost_price),
          stock_quantity: Number(form.stock_quantity),
          low_stock_threshold: Number(form.low_stock_threshold),
          image_url: form.image_url,
          sku: form.sku,
          is_available: form.is_available,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to save product");
        return;
      }

      setSaved(true);
      router.refresh();
    } catch {
      setError("Failed to save product. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>
      <button
        type="button"
        onClick={() => router.push("/dashboard/products")}
        style={{ ...S.btn("transparent", "#94a3b8"), padding: 0, width: "fit-content" }}
      >
        <ArrowLeft size={15} />
        Back to products
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", margin: 0 }}>Edit product</h1>

      {error && (
        <div
          style={{
            color: "#f87171",
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {saved && !error && (
        <div
          style={{
            color: "#4ade80",
            background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.2)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
          }}
        >
          Saved.
        </div>
      )}

      <form onSubmit={handleSave} style={{ ...S.card, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={S.label}>Name</label>
          <input style={S.input} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>

        <div>
          <label style={S.label}>Description</label>
          <textarea
            style={{ ...S.input, minHeight: 70, resize: "vertical" }}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={S.label}>Category</label>
            <select
              style={S.input}
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={S.label}>Unit</label>
            <input style={S.input} value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={S.label}>Price (₹)</label>
            <input
              style={S.input}
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            />
          </div>
          <div>
            <label style={S.label}>Cost price (₹, optional)</label>
            <input
              style={S.input}
              type="number"
              min="0"
              step="0.01"
              value={form.cost_price}
              onChange={(e) => setForm((f) => ({ ...f, cost_price: e.target.value }))}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={S.label}>Stock quantity</label>
            <input
              style={S.input}
              type="number"
              min="0"
              value={form.stock_quantity}
              onChange={(e) => setForm((f) => ({ ...f, stock_quantity: e.target.value }))}
            />
          </div>
          <div>
            <label style={S.label}>Low stock threshold</label>
            <input
              style={S.input}
              type="number"
              min="0"
              value={form.low_stock_threshold}
              onChange={(e) => setForm((f) => ({ ...f, low_stock_threshold: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <label style={S.label}>Image URL (optional)</label>
          <input
            style={S.input}
            value={form.image_url}
            onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
            placeholder="https://…"
          />
        </div>

        <div>
          <label style={S.label}>SKU (optional)</label>
          <input style={S.input} value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#cbd5e1" }}>
          <input
            type="checkbox"
            checked={form.is_available}
            onChange={(e) => setForm((f) => ({ ...f, is_available: e.target.checked }))}
          />
          Available for sale
        </label>

        <button type="submit" disabled={saving} style={{ ...S.btn("#3b82f6", "#fff"), opacity: saving ? 0.5 : 1, width: "fit-content" }}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
