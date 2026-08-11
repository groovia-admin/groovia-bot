"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, EyeOff, Eye, Trash2, Download, Search, ChevronLeft, ChevronRight, Package, FolderPlus } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import { S } from "@/lib/ui/dashboardStyles";
import InfoTooltip from "@/components/ui/InfoTooltip";
import EmptyState from "@/components/ui/EmptyState";
import { toCsv, downloadCsv } from "@/lib/csv";
import ProductEditModal from "./ProductEditModal";

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
  description?: string | null;
  category_id: string;
  unit: string;
  price: number;
  cost_price: number | null;
  stock_quantity: number;
  low_stock_threshold: number;
  is_available: boolean;
  image_url: string | null;
  sku: string | null;
  categories?: { name: string } | { name: string }[] | null;
};

function categoryName(product: Product): string {
  const cat = Array.isArray(product.categories) ? product.categories[0] : product.categories;
  return cat?.name ?? "—";
}

export default function ProductsClient({
  initialCategories,
  initialProducts,
  canManage,
}: {
  initialCategories: Category[];
  initialProducts: Product[];
  canManage: boolean;
}) {
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [error, setError] = useState("");

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [categoryName_, setCategoryName_] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [productForm, setProductForm] = useState({
    name: "",
    category_id: "",
    unit: "",
    price: "",
    cost_price: "",
    stock_quantity: "",
  });
  const [savingProduct, setSavingProduct] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [productSearch, setProductSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const activeCategories = useMemo(() => categories.filter((c) => c.is_active), [categories]);

  const productCountByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      map.set(p.category_id, (map.get(p.category_id) ?? 0) + 1);
    }
    return map;
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || categoryName(p).toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  // Search/pageSize changes can leave `page` pointing past the new last
  // page (e.g. searching down to 3 results while on page 4) — clamp on
  // render rather than in an effect, so it can never flash a blank page.
  const currentPage = Math.min(page, totalPages);
  const paginatedProducts = useMemo(
    () => filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredProducts, currentPage, pageSize]
  );

  function updateSearch(value: string) {
    setProductSearch(value);
    setPage(1);
  }

  function updatePageSize(size: number) {
    setPageSize(size);
    setPage(1);
  }

  function exportCsv() {
    const rows = filteredProducts.map((p) => ({
      name: p.name,
      category: categoryName(p),
      unit: p.unit,
      price: p.price,
      cost_price: p.cost_price ?? "",
      stock_quantity: p.stock_quantity,
      low_stock_threshold: p.low_stock_threshold,
      is_available: p.is_available ? "Yes" : "No",
      sku: p.sku ?? "",
    }));
    const csv = toCsv(rows, [
      { key: "name", label: "Product" },
      { key: "category", label: "Category" },
      { key: "unit", label: "Unit" },
      { key: "price", label: "Price" },
      { key: "cost_price", label: "Cost price" },
      { key: "stock_quantity", label: "Stock" },
      { key: "low_stock_threshold", label: "Low stock threshold" },
      { key: "is_available", label: "Available" },
      { key: "sku", label: "SKU" },
    ]);
    downloadCsv(`products-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

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
      toast(`Category "${data.category.name}" added`);
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

  async function handleDeleteCategory(category: Category) {
    const linkedCount = productCountByCategory.get(category.id) ?? 0;
    if (linkedCount > 0) {
      toast(
        `Move or delete the ${linkedCount} product${linkedCount > 1 ? "s" : ""} in "${category.name}" before deleting it.`,
        "error"
      );
      return;
    }

    if (!window.confirm(`Delete "${category.name}"?`)) {
      return;
    }

    setDeletingCategoryId(category.id);
    setError("");

    try {
      const response = await fetch(`/api/shop/categories/${category.id}`, { method: "DELETE" });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to remove category");
        toast(data.error || "Failed to remove category", "error");
        return;
      }

      setCategories((prev) => prev.filter((c) => c.id !== category.id));
      setProducts((prev) => prev.map((p) => (p.category_id === category.id ? { ...p, category_id: "" } : p)));
      toast(`Category "${category.name}" removed`);
    } catch {
      setError("Failed to remove category. Please try again.");
      toast("Failed to remove category", "error");
    } finally {
      setDeletingCategoryId(null);
    }
  }

  function validateProductForm(): string | null {
    const missing: string[] = [];
    if (!productForm.name.trim()) missing.push("Name");
    if (!productForm.category_id) missing.push("Category");
    if (!productForm.unit.trim()) missing.push("Unit");
    if (!productForm.price) missing.push("Price");
    if (!productForm.stock_quantity.trim()) missing.push("Stock qty");

    if (missing.length > 0) {
      return `${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} required`;
    }

    const duplicate = products.some(
      (p) =>
        p.name.trim().toLowerCase() === productForm.name.trim().toLowerCase() &&
        p.unit.trim().toLowerCase() === productForm.unit.trim().toLowerCase()
    );
    if (duplicate) {
      return `A product named "${productForm.name.trim()}" with unit "${productForm.unit.trim()}" already exists`;
    }

    return null;
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const validationError = validateProductForm();
    if (validationError) {
      setError(validationError);
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
          cost_price: productForm.cost_price ? Number(productForm.cost_price) : null,
          stock_quantity: Number(productForm.stock_quantity || 0),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to add product");
        toast(data.error || "Failed to add product", "error");
        return;
      }

      setProducts((prev) => [data.product, ...prev]);
      setProductForm({ name: "", category_id: "", unit: "", price: "", cost_price: "", stock_quantity: "" });
      setShowAddProduct(false);
      toast(`"${data.product.name}" added`);
    } catch {
      setError("Failed to add product. Please try again.");
      toast("Failed to add product", "error");
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
      toast(`${data.product.name} marked ${data.product.is_available ? "available" : "unavailable"}`);
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--ink)", margin: 0 }}>Products</h1>
            <InfoTooltip
              items={[
                { color: "var(--brand-dark)", label: "Available", hint: "shown to customers on WhatsApp" },
                { color: "var(--ink-muted)", label: "Unavailable", hint: "hidden from customers, toggle to restore" },
                { color: "#D97706", label: "Low stock", hint: "at or below its restock threshold" },
              ]}
            />
          </div>
          <p style={{ fontSize: "var(--text-base)", color: "var(--ink-muted)", marginTop: 4 }}>
            Manage your catalog and inventory.
          </p>
        </div>
      </div>

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

      {/* Categories */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: "var(--text-md)", fontWeight: 700, color: "var(--ink)", margin: 0 }}>Categories</h2>
          {canManage && (
            <button type="button" style={S.btn("var(--surface-hover)", "var(--ink)")} onClick={() => setShowAddCategory((v) => !v)}>
              <Plus size={14} />
              Add category
            </button>
          )}
        </div>

        {showAddCategory && (
          <form onSubmit={handleAddCategory} style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                style={S.input}
                value={categoryName_}
                onChange={(e) => setCategoryName_(e.target.value)}
                placeholder="Category name (e.g. Dairy, Snacks)"
              />
              <button type="submit" disabled={savingCategory || !categoryName_.trim()} style={{ ...S.btn("var(--brand)", "#fff"), opacity: savingCategory || !categoryName_.trim() ? 0.5 : 1, whiteSpace: "nowrap" }}>
                {savingCategory ? "Adding…" : "Add"}
              </button>
            </div>
          </form>
        )}

        {categories.length === 0 ? (
          <EmptyState icon={FolderPlus} title="No categories yet" description="Add a category first — every product needs one to sort under." compact />
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {categories.map((category) => (
              <div
                key={category.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 2,
                  borderRadius: 999,
                  background: category.is_active ? "var(--brand-light)" : "var(--surface)",
                  border: `1px solid ${category.is_active ? "var(--brand-dark)" : "var(--ink-muted)"}33`,
                }}
              >
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => toggleCategoryActive(category)}
                    style={{ ...S.badge(category.is_active ? "var(--brand-dark)" : "var(--ink-muted)", "transparent"), border: "none" }}
                    title={category.is_active ? "Click to deactivate" : "Click to activate"} aria-label={category.is_active ? "Click to deactivate" : "Click to activate"}
                  >
                    {category.name}
                  </button>
                ) : (
                  <span style={{ ...S.badge(category.is_active ? "var(--brand-dark)" : "var(--ink-muted)", "transparent"), border: "none" }}>
                    {category.name}
                  </span>
                )}
                {canManage && (() => {
                  const linkedCount = productCountByCategory.get(category.id) ?? 0;
                  const blocked = linkedCount > 0;
                  return (
                    <button
                      type="button"
                      disabled={deletingCategoryId === category.id}
                      onClick={() => handleDeleteCategory(category)}
                      title={
                        blocked
                          ? `${linkedCount} product${linkedCount > 1 ? "s" : ""} still in this category — move or delete them first`
                          : "Delete category"
                      }
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "2px 8px 2px 2px",
                        background: "transparent",
                        border: "none",
                        color: blocked ? "var(--ink-faint)" : "var(--error)",
                        cursor: deletingCategoryId === category.id ? "default" : "pointer",
                        opacity: deletingCategoryId === category.id ? 0.5 : 1,
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Products */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "var(--text-md)", fontWeight: 700, color: "var(--ink)", margin: 0 }}>All products</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={exportCsv}
            disabled={products.length === 0}
            title="Export all products to a CSV file" aria-label="Export all products to a CSV file"
            style={{ ...S.btn("var(--surface-hover)", "var(--ink)"), opacity: products.length === 0 ? 0.5 : 1 }}
          >
            <Download size={15} />
            Export CSV
          </button>
          {canManage && (
            <button
              type="button"
              style={{ ...S.btn("var(--brand)", "#fff"), opacity: activeCategories.length === 0 ? 0.5 : 1 }}
              disabled={activeCategories.length === 0}
              onClick={() => setShowAddProduct((v) => !v)}
              title={activeCategories.length === 0 ? "Add a category first" : undefined} aria-label={activeCategories.length === 0 ? "Add a category first" : undefined}
            >
              <Plus size={15} />
              Add product
            </button>
          )}
        </div>
      </div>

      {canManage && showAddProduct && (
        <form onSubmit={handleAddProduct} style={{ ...S.card, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 14 }}>
            <div>
              <label style={S.label}>Name *</label>
              <input
                style={S.input}
                value={productForm.name}
                onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Amul Milk"
              />
            </div>
            <div>
              <label style={S.label}>Category *</label>
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
              <label style={S.label}>Unit *</label>
              <input
                style={S.input}
                value={productForm.unit}
                onChange={(e) => setProductForm((f) => ({ ...f, unit: e.target.value }))}
                placeholder="500ml, 1kg, pc"
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div>
              <label style={S.label}>Selling price (₹) *</label>
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
              <label style={S.label}>Purchase price (₹)</label>
              <input
                style={S.input}
                type="number"
                min="0"
                step="0.01"
                value={productForm.cost_price}
                onChange={(e) => setProductForm((f) => ({ ...f, cost_price: e.target.value }))}
                placeholder="What you paid"
              />
            </div>
            <div>
              <label style={S.label}>Stock qty *</label>
              <input
                style={S.input}
                type="number"
                min="0"
                value={productForm.stock_quantity}
                onChange={(e) => setProductForm((f) => ({ ...f, stock_quantity: e.target.value }))}
              />
            </div>
          </div>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)", margin: 0 }}>* Required</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={savingProduct} style={{ ...S.btn("var(--brand)", "#fff"), opacity: savingProduct ? 0.5 : 1 }}>
              {savingProduct ? "Adding…" : "Add product"}
            </button>
            <button type="button" style={S.btn("var(--surface-hover)", "var(--ink)")} onClick={() => setShowAddProduct(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 340 }}>
          <Search size={14} color="var(--ink-faint)" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={productSearch}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder="Search name, SKU, or category…"
            style={{ ...S.input, paddingLeft: 30 }}
          />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-sm)", color: "var(--ink-muted)" }}>
          Per page
          <select value={pageSize} onChange={(e) => updatePageSize(Number(e.target.value))} style={{ ...S.input, width: "auto" }}>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </div>

      <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={S.th}>Name</th>
                <th style={S.th}>Category</th>
                <th style={S.th}>Unit</th>
                <th style={S.th}>Price</th>
                <th style={S.th}>Cost</th>
                <th style={S.th}>Margin</th>
                <th style={S.th}>Stock</th>
                <th style={S.th}>Status</th>
                <th style={{ ...S.th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td style={S.td} colSpan={9}>
                    {products.length === 0 ? (
                      <EmptyState icon={Package} title="No products yet" description="Add your first product above to start selling on WhatsApp." compact />
                    ) : (
                      <EmptyState icon={Search} title="No products match your search" compact />
                    )}
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((product) => {
                  const lowStock = product.stock_quantity <= product.low_stock_threshold;
                  const busy = busyId === product.id;
                  return (
                    <tr key={product.id}>
                      <td style={{ ...S.td, color: "var(--ink)", fontWeight: 500 }}>{product.name}</td>
                      <td style={S.td}>{categoryName(product)}</td>
                      <td style={S.td}>{product.unit}</td>
                      <td style={S.td}>₹{Number(product.price).toFixed(2)}</td>
                      <td style={S.td}>{product.cost_price != null ? `₹${Number(product.cost_price).toFixed(2)}` : "—"}</td>
                      <td style={S.td}>
                        {product.cost_price != null && Number(product.price) > 0 ? (
                          <span style={{ color: "var(--brand-dark)" }}>
                            {Math.round(((Number(product.price) - Number(product.cost_price)) / Number(product.price)) * 100)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={S.td}>
                        <span style={lowStock ? { color: "#D97706", fontWeight: 600 } : undefined}>
                          {product.stock_quantity}
                        </span>
                      </td>
                      <td style={S.td}>
                        <span
                          style={S.badge(
                            product.is_available ? "var(--brand-dark)" : "var(--ink-muted)",
                            product.is_available ? "var(--brand-light)" : "var(--surface)",
                          )}
                        >
                          {product.is_available ? "Available" : "Unavailable"}
                        </span>
                      </td>
                      <td style={{ ...S.td, textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={() => setEditingProduct(product)}
                            title={canManage ? "Edit product" : "View product"} aria-label={canManage ? "Edit product" : "View product"}
                            style={{ ...S.btn("var(--surface-hover)", "var(--ink)"), padding: "6px 10px" }}
                          >
                            <Pencil size={13} />
                          </button>
                          {canManage && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => toggleAvailability(product)}
                            title={product.is_available ? "Hide from customers" : "Show to customers"} aria-label={product.is_available ? "Hide from customers" : "Show to customers"}
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
                          )}
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

      {filteredProducts.length > 0 && totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            style={{ ...S.btn("var(--surface-hover)", "var(--ink)"), padding: "6px 10px", opacity: currentPage <= 1 ? 0.5 : 1 }}
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)" }}>
            Page {currentPage} of {totalPages} · {filteredProducts.length} product{filteredProducts.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            style={{ ...S.btn("var(--surface-hover)", "var(--ink)"), padding: "6px 10px", opacity: currentPage >= totalPages ? 0.5 : 1 }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {editingProduct && (
        <ProductEditModal
          product={editingProduct}
          categories={activeCategories}
          canManage={canManage}
          onClose={() => setEditingProduct(null)}
          onSaved={(updated) => {
            setProducts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
            setEditingProduct(null);
            toast("Product saved");
          }}
        />
      )}
    </div>
  );
}
