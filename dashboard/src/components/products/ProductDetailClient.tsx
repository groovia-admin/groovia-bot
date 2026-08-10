"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";
import { S } from "@/lib/ui/dashboardStyles";

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

export default function ProductDetailClient({
  product,
  categories,
  canManage,
}: {
  product: Product;
  categories: Category[];
  canManage: boolean;
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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    try {
      const uploadData = new FormData();
      uploadData.append("file", file);

      const response = await fetch("/api/shop/products/upload-image", {
        method: "POST",
        body: uploadData,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to upload image");
        return;
      }

      setForm((f) => ({ ...f, image_url: data.url }));
    } catch {
      setError("Failed to upload image. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

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
        style={{ ...S.btn("transparent", "var(--ink-muted)"), padding: 0, width: "fit-content" }}
      >
        <ArrowLeft size={15} />
        Back to products
      </button>

      <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--ink)", margin: 0 }}>{canManage ? "Edit product" : "View product"}</h1>

      {!canManage && (
        <div style={{ color: "var(--ink-muted)", background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: 8, padding: "10px 14px", fontSize: "var(--text-base)" }}>
          You don&apos;t have permission to edit products. Ask the shop owner to grant it.
        </div>
      )}

      {error && (
        <div
          style={{
            color: "var(--error)",
            background: "var(--error-light)",
            border: "1px solid rgba(186,26,26,0.3)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: "var(--text-base)",
          }}
        >
          {error}
        </div>
      )}

      {saved && !error && (
        <div
          style={{
            color: "var(--brand-dark)",
            background: "var(--brand-light)",
            border: "1px solid rgba(0,104,95,0.35)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: "var(--text-base)",
          }}
        >
          Saved.
        </div>
      )}

      <form onSubmit={handleSave} style={{ ...S.card, display: "flex", flexDirection: "column", gap: 16 }}>
        <fieldset disabled={!canManage} style={{ display: "contents", border: "none", padding: 0, margin: 0 }}>
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
          <label style={S.label}>Product image</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {form.image_url ? (
              <img
                src={form.image_url}
                alt=""
                style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", border: "1px solid var(--surface-border)" }}
              />
            ) : (
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 8,
                  border: "1px dashed var(--surface-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#64748b",
                  fontSize: "var(--text-xs)",
                  textAlign: "center",
                }}
              >
                No image
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageUpload}
              style={{ display: "none" }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              style={{ ...S.btn("var(--surface-hover)", "var(--ink)"), opacity: uploading ? 0.5 : 1 }}
            >
              <Upload size={14} />
              {uploading ? "Uploading…" : form.image_url ? "Replace image" : "Upload image"}
            </button>
          </div>
          <input
            style={{ ...S.input, marginTop: 10 }}
            value={form.image_url}
            onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
            placeholder="or paste an image URL directly"
          />
        </div>

        <div>
          <label style={S.label}>SKU (optional)</label>
          <input style={S.input} value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-base)", color: "var(--ink)" }}>
          <input
            type="checkbox"
            checked={form.is_available}
            onChange={(e) => setForm((f) => ({ ...f, is_available: e.target.checked }))}
          />
          Available for sale
        </label>

        <button type="submit" disabled={saving} style={{ ...S.btn("var(--brand)", "#fff"), opacity: saving ? 0.5 : 1, width: "fit-content" }}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        </fieldset>
      </form>
    </div>
  );
}
