"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, EyeOff, Eye } from "lucide-react";

type Category = {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
};

type Product = {
  id: string;
  name: string;
  category_id: string;
  unit: string;
  price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  is_available: boolean;
  image_url: string | null;
  sku: string | null;
  categories?: { name: string } | { name: string }[] | null;
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
  th: {
    textAlign: "left",
    padding: "10px 16px",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.7px",
    color: "#64748b",
    fontWeight: 600,
    borderBottom: "1px solid #334155",
  } as React.CSSProperties,
  td: {
    padding: "12px 16px",
    fontSize: 13,
    color: "#94a3b8",
    borderBottom: "1px solid rgba(30,41,59,0.8)",
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

function categoryName(product: Product): string {
  const cat = Array.isArray(product.categories) ? product.categories[0] : product.categories;
  return cat?.name ?? "—";
}

export default function ProductsClient({
  initialCategories,
  initialProducts,
}: {
  initialCategories: Category[];
  initialProducts: Product[];
}) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [error, setError] = useState("");

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [categoryName_, setCategoryName_] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [productForm, setProductForm] = useState({
    name: "",
    category_id: "",
    unit: "",
    price: "",
    stock_quantity: "",
  });
  const [savingProduct, setSavingProduct] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const activeCategories = useMemo(() => categories.filter((c) => c.is_active), [categories]);

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryName_.trim()) return;

    setSavingCategory(true);
    setError("");

    try {
      const response = await fetch("/api/shop/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: categoryName_ }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to add category");
        return;
      }

      setCategories((prev) => [...prev, data.category]);
      setCategoryName_("");
      setShowAddCategory(false);
    } catch {
      setError("Failed to add category. Please try again.");
    } finally {
      setSavingCategory(false);
    }
  }

  async function toggleCategoryActive(category: Category) {
    setError("");

    try {
      const response = await fetch(`/api/shop/categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !category.is_active }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to update category");
        return;
      }

      setCategories((prev) => prev.map((c) => (c.id === category.id ? data.category : c)));
    } catch {
      setError("Failed to update category. Please try again.");
    }
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!productForm.name.trim() || !productForm.category_id || !productForm.unit.trim() || !productForm.price) {
      setError("Name, category, unit, and price are required");
      return;
    }

    setSavingProduct(true);

    try {
      const response = await fetch("/api/shop/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: productForm.name,
          category_id: productForm.category_id,
          unit: productForm.unit,
          price: Number(productForm.price),
          stock_quantity: Number(productForm.stock_quantity || 0),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to add product");
        return;
      }

      setProducts((prev) => [data.product, ...prev]);
      setProductForm({ name: "", category_id: "", unit: "", price: "", stock_quantity: "" });
      setShowAddProduct(false);
    } catch {
      setError("Failed to add product. Please try again.");
    } finally {
      setSavingProduct(false);
    }
  }

  async function toggleAvailability(product: Product) {
    setBusyId(product.id);
    setError("");

    try {
      const response = await fetch(`/api/shop/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_available: !product.is_available }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to update product");
        return;
      }

      setProducts((prev) => prev.map((p) => (p.id === product.id ? data.product : p)));
    } catch {
      setError("Failed to update product. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", margin: 0 }}>Products</h1>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            Manage your catalog and inventory.
          </p>
        </div>
      </div>

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

      {/* Categories */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Categories</h2>
          <button type="button" style={S.btn("#334155", "#f1f5f9")} onClick={() => setShowAddCategory((v) => !v)}>
            <Plus size={14} />
            Add category
          </button>
        </div>

        {showAddCategory && (
          <form onSubmit={handleAddCategory} style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <input
              style={S.input}
              value={categoryName_}
              onChange={(e) => setCategoryName_(e.target.value)}
              placeholder="Category name (e.g. Dairy, Snacks)"
            />
            <button type="submit" disabled={savingCategory} style={{ ...S.btn("#3b82f6", "#fff"), opacity: savingCategory ? 0.5 : 1, whiteSpace: "nowrap" }}>
              {savingCategory ? "Adding…" : "Add"}
            </button>
          </form>
        )}

        {categories.length === 0 ? (
          <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>No categories yet. Add one to start adding products.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => toggleCategoryActive(category)}
                style={S.badge(category.is_active ? "#22c55e" : "#64748b", category.is_active ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)")}
                title={category.is_active ? "Click to deactivate" : "Click to activate"}
              >
                {category.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Products */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>All products</h2>
        <button
          type="button"
          style={{ ...S.btn("#3b82f6", "#fff"), opacity: activeCategories.length === 0 ? 0.5 : 1 }}
          disabled={activeCategories.length === 0}
          onClick={() => setShowAddProduct((v) => !v)}
          title={activeCategories.length === 0 ? "Add a category first" : undefined}
        >
          <Plus size={15} />
          Add product
        </button>
      </div>

      {showAddProduct && (
        <form onSubmit={handleAddProduct} style={{ ...S.card, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 14 }}>
            <div>
              <label style={S.label}>Name</label>
              <input
                style={S.input}
                value={productForm.name}
                onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Amul Milk"
              />
            </div>
            <div>
              <label style={S.label}>Category</label>
              <select
                style={S.input}
                value={productForm.category_id}
                onChange={(e) => setProductForm((f) => ({ ...f, category_id: e.target.value }))}
              >
                <option value="">Select…</option>
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={S.label}>Unit</label>
              <input
                style={S.input}
                value={productForm.unit}
                onChange={(e) => setProductForm((f) => ({ ...f, unit: e.target.value }))}
                placeholder="500ml, 1kg, pc"
              />
            </div>
            <div>
              <label style={S.label}>Price (₹)</label>
              <input
                style={S.input}
                type="number"
                min="0"
                step="0.01"
                value={productForm.price}
                onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))}
              />
            </div>
            <div>
              <label style={S.label}>Stock qty</label>
              <input
                style={S.input}
                type="number"
                min="0"
                value={productForm.stock_quantity}
                onChange={(e) => setProductForm((f) => ({ ...f, stock_quantity: e.target.value }))}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={savingProduct} style={{ ...S.btn("#3b82f6", "#fff"), opacity: savingProduct ? 0.5 : 1 }}>
              {savingProduct ? "Adding…" : "Add product"}
            </button>
            <button type="button" style={S.btn("#334155", "#cbd5e1")} onClick={() => setShowAddProduct(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={S.th}>Name</th>
                <th style={S.th}>Category</th>
                <th style={S.th}>Unit</th>
                <th style={S.th}>Price</th>
                <th style={S.th}>Stock</th>
                <th style={S.th}>Status</th>
                <th style={{ ...S.th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td style={S.td} colSpan={7}>
                    No products yet.
                  </td>
                </tr>
              ) : (
                products.map((product) => {
                  const lowStock = product.stock_quantity <= product.low_stock_threshold;
                  const busy = busyId === product.id;
                  return (
                    <tr key={product.id}>
                      <td style={{ ...S.td, color: "#f1f5f9", fontWeight: 500 }}>{product.name}</td>
                      <td style={S.td}>{categoryName(product)}</td>
                      <td style={S.td}>{product.unit}</td>
                      <td style={S.td}>₹{Number(product.price).toFixed(2)}</td>
                      <td style={S.td}>
                        <span style={lowStock ? { color: "#f59e0b", fontWeight: 600 } : undefined}>
                          {product.stock_quantity}
                        </span>
                      </td>
                      <td style={S.td}>
                        <span
                          style={S.badge(
                            product.is_available ? "#22c55e" : "#94a3b8",
                            product.is_available ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.12)",
                          )}
                        >
                          {product.is_available ? "Available" : "Unavailable"}
                        </span>
                      </td>
                      <td style={{ ...S.td, textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <Link
                            href={`/dashboard/products/${product.id}`}
                            style={{ ...S.btn("#334155", "#cbd5e1"), padding: "6px 10px", textDecoration: "none" }}
                          >
                            <Pencil size={13} />
                          </Link>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => toggleAvailability(product)}
                            style={{
                              ...S.btn(
                                product.is_available ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                                product.is_available ? "#ef4444" : "#22c55e",
                              ),
                              padding: "6px 10px",
                              opacity: busy ? 0.5 : 1,
                            }}
                          >
                            {product.is_available ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
