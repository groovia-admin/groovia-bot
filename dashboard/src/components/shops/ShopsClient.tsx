"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import EmptyState from "@/components/ui/EmptyState";
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  ExternalLink,
  MapPin,
  MessageSquare,
  MoreVertical,
  Plus,
  Search,
  Store,
  XCircle,
} from "lucide-react";
import type { Shop, SubscriptionStatus } from "@/types/database";

type ShopRow = Pick<
  Shop,
  | "id"
  | "slug"
  | "name"
  | "city"
  | "state"
  | "is_active"
  | "subscription_status"
  | "trial_ends_at"
  | "created_at"
  | "updated_at"
>;

type AddForm = {
  name: string;
  slug: string;
  description: string;
  area: string;
  address_line_1: string;
  address_line_2: string;
  postal_code: string;
  city: string;
  state: string;
  country: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
};

type CreatedOwnerCredentials = {
  email: string;
  phone: string;
  shopName: string;
  isExistingOwner: boolean;
};

type ApiShopResponse = {
  success?: boolean;
  error?: string;
  shop?: ShopRow;
  shops?: ShopRow[];
  owner?: {
    id?: string;
    email?: string;
    phone?: string;
    created?: boolean;
  };
};

const EMPTY_FORM: AddForm = {
  name: "",
  slug: "",
  description: "",
  area: "",
  address_line_1: "",
  address_line_2: "",
  postal_code: "",
  city: "",
  state: "",
  country: "India",
  owner_name: "",
  owner_email: "",
  owner_phone: "",
};

const SUB: Record<
  SubscriptionStatus,
  {
    label: string;
    color: string;
    bg: string;
  }
> = {
  trial: {
    label: "Trial",
    color: "#D97706",
    bg: "rgba(245,158,11,0.1)",
  },
  active: {
    label: "Active",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.1)",
  },
  past_due: {
    label: "Past Due",
    color: "#f97316",
    bg: "rgba(249,115,22,0.1)",
  },
  cancelled: {
    label: "Cancelled",
    color: "var(--ink-muted)",
    bg: "rgba(148,163,184,0.1)",
  },
  expired: {
    label: "Expired",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
  },
  suspended: {
    label: "Suspended",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
  },
};

const VALID_SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>([
  "trial",
  "active",
  "past_due",
  "cancelled",
  "expired",
  "suspended",
]);

function isShopRow(value: unknown): value is ShopRow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const shop = value as Record<string, unknown>;

  return (
    typeof shop.id === "string" &&
    typeof shop.slug === "string" &&
    typeof shop.name === "string" &&
    typeof shop.is_active === "boolean" &&
    typeof shop.subscription_status === "string" &&
    typeof shop.created_at === "string"
  );
}

async function readApiResponse(response: Response): Promise<ApiShopResponse> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as ApiShopResponse;
  }

  const text = await response.text();

  return {
    error: text || "The server returned an invalid response.",
  };
}

export default function ShopsClient({
  initialShops,
}: {
  initialShops: ShopRow[];
}) {
  const [shops, setShops] = useState<ShopRow[]>(initialShops);

  const [search, setSearch] = useState("");

  const [filterStatus, setFilterStatus] = useState<"all" | SubscriptionStatus>(
    "all",
  );

  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const [menuAnchor, setMenuAnchor] = useState<{
    top: number;
    bottom: number;
    left: number;
    right: number;
  } | null>(null);

  const [menuOpenUpward, setMenuOpenUpward] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!openMenu || !menuAnchor || !menuRef.current) {
      setMenuOpenUpward(false);
      return;
    }
    const menuHeight = menuRef.current.offsetHeight;
    const spaceBelow = window.innerHeight - menuAnchor.bottom;
    const spaceAbove = menuAnchor.top;
    setMenuOpenUpward(spaceBelow < menuHeight + 8 && spaceAbove > spaceBelow);
  }, [openMenu, menuAnchor]);

  const [showAdd, setShowAdd] = useState(false);

  const [form, setForm] = useState<AddForm>(EMPTY_FORM);

  const [saving, setSaving] = useState(false);

  const [updatingShopId, setUpdatingShopId] = useState<string | null>(null);

  const [loadingShops, setLoadingShops] = useState(false);

  const [addError, setAddError] = useState("");

  const [pinLoading, setPinLoading] = useState(false);

  const [pinError, setPinError] = useState("");

  const [toast, setToast] = useState("");

  const [createdOwner, setCreatedOwner] =
    useState<CreatedOwnerCredentials | null>(null);

  const [whatsappShop, setWhatsappShop] = useState<{ id: string; name: string } | null>(null);
  const [whatsappForm, setWhatsappForm] = useState({
    phone_number_id: "",
    business_account_id: "",
    display_phone_number: "",
    catalog_id: "",
  });
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [whatsappError, setWhatsappError] = useState("");

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setShops(initialShops);
  }, [initialShops]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  function showToast(message: string) {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToast(message);

    toastTimerRef.current = setTimeout(() => {
      setToast("");
      toastTimerRef.current = null;
    }, 3500);
  }

  async function openWhatsappModal(shop: ShopRow) {
    setWhatsappShop({ id: shop.id, name: shop.name });
    setWhatsappError("");
    setWhatsappForm({ phone_number_id: "", business_account_id: "", display_phone_number: "", catalog_id: "" });
    setWhatsappLoading(true);
    setOpenMenu(null);

    try {
      const response = await fetch(`/api/admin/shops/${shop.id}/whatsapp-connection`);
      const data = await response.json();

      if (response.ok && data.connection) {
        setWhatsappForm({
          phone_number_id: data.connection.phone_number_id ?? "",
          business_account_id: data.connection.business_account_id ?? "",
          display_phone_number: data.connection.display_phone_number ?? "",
          catalog_id: data.connection.catalog_id ?? "",
        });
      } else if (!response.ok) {
        setWhatsappError(data.error || "Failed to load WhatsApp connection");
      }
    } catch {
      setWhatsappError("Failed to load WhatsApp connection. Please try again.");
    } finally {
      setWhatsappLoading(false);
    }
  }

  function closeWhatsappModal() {
    setWhatsappShop(null);
    setWhatsappError("");
  }

  async function handleSaveWhatsapp(e: React.FormEvent) {
    e.preventDefault();
    if (!whatsappShop) return;

    setWhatsappSaving(true);
    setWhatsappError("");

    try {
      const response = await fetch(`/api/admin/shops/${whatsappShop.id}/whatsapp-connection`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(whatsappForm),
      });
      const data = await response.json();

      if (!response.ok) {
        setWhatsappError(data.error || "Failed to save WhatsApp connection");
        return;
      }

      showToast(`WhatsApp connection saved for ${whatsappShop.name} — verified as ${data.connection?.display_phone_number ?? "unknown number"}`);
      closeWhatsappModal();
    } catch {
      setWhatsappError("Failed to save WhatsApp connection. Please try again.");
    } finally {
      setWhatsappSaving(false);
    }
  }

  function handleName(name: string) {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    setForm((current) => ({
      ...current,
      name,
      slug,
    }));
  }

  async function lookupPinCode(pinCode: string) {
    const normalizedPin = pinCode.replace(/\D/g, "");

    if (normalizedPin.length !== 6) {
      setPinError("");
      return;
    }

    setPinLoading(true);
    setPinError("");

    try {
      const response = await fetch(`/api/location/pincode/${normalizedPin}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        setPinError(data.message || "PIN code was not found. Please enter the city and state manually.");
        return;
      }

      setForm((current) => ({
        ...current,
        postal_code: normalizedPin,
        city: data.city || current.city,
        state: data.state || current.state,
      }));
    } catch (error) {
      console.error("PIN code lookup failed:", error);

      setPinError("Unable to look up this PIN code. Please enter the city and state manually.");
    } finally {
      setPinLoading(false);
    }
  }

  function closeAddModal() {
    if (saving) {
      return;
    }

    setShowAdd(false);
    setAddError("");
    setCreatedOwner(null);
    setForm(EMPTY_FORM);
  }

  async function reloadShops(showError = true): Promise<boolean> {
    setLoadingShops(true);

    try {
      const response = await fetch("/api/admin/shops", {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
      });

      const result = await readApiResponse(response);

      if (!response.ok) {
        throw new Error(result.error || "Unable to load shops.");
      }

      if (!Array.isArray(result.shops)) {
        throw new Error("The server returned an invalid shop list.");
      }

      const validShops = result.shops.filter(isShopRow);

      if (validShops.length !== result.shops.length) {
        throw new Error("The server returned invalid shop data.");
      }

      setShops(validShops);

      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load shops.";

      if (showError) {
        showToast(message);
      }

      return false;
    } finally {
      setLoadingShops(false);
    }
  }

  async function updateShop(
    shop: ShopRow,
    changes: Partial<Pick<Shop, "is_active" | "subscription_status">>,
  ) {
    setUpdatingShopId(shop.id);

    try {
      const response = await fetch(`/api/admin/shops/${shop.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(changes),
      });

      const result = await readApiResponse(response);

      if (!response.ok) {
        throw new Error(result.error || "Unable to update the shop.");
      }

      const refreshed = await reloadShops(false);

      if (!refreshed) {
        throw new Error(
          "Shop was updated, but the latest list could not be loaded. Refresh the page.",
        );
      }

      setOpenMenu(null);

      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update the shop.";

      showToast(message);

      return false;
    } finally {
      setUpdatingShopId(null);
    }
  }

  async function toggleActive(shop: ShopRow) {
    const next = !shop.is_active;

    const action = next ? "Activate" : "Suspend";

    const confirmed = window.confirm(`${action} "${shop.name}"?`);

    if (!confirmed) {
      return;
    }

    const updated = await updateShop(shop, {
      is_active: next,
    });

    if (updated) {
      showToast(`"${shop.name}" ${next ? "activated" : "suspended"}.`);
    }
  }

  async function updateSub(shop: ShopRow, status: SubscriptionStatus) {
    if (!VALID_SUBSCRIPTION_STATUSES.has(status)) {
      showToast("Invalid subscription status.");

      return;
    }

    if (shop.subscription_status === status) {
      setOpenMenu(null);
      return;
    }

    const updated = await updateShop(shop, {
      subscription_status: status,
    });

    if (updated) {
      showToast("Subscription updated.");
    }
  }

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) {
      return;
    }

    setSaving(true);
    setAddError("");

    try {
      const normalizedPhone = form.owner_phone.replace(/\D/g, "");

      if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
        setAddError("Please enter a valid 10-digit Indian mobile number.");
        setSaving(false);
        return;
      }

      const response = await fetch("/api/admin/shops", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          ...form,
          postalCode: form.postal_code,
          area: form.area,
          owner_phone: normalizedPhone,

          /*
           * These aliases allow this
           * client to work with the
           * earlier API naming and the
           * updated API naming.
           */
          shopName: form.name,
          ownerName: form.owner_name,
          ownerEmail: form.owner_email,
          address: form.address_line_1,
        }),
      });

      const result = await readApiResponse(response);

      if (!response.ok) {
        setAddError(result.error || "Unable to create shop.");

        return;
      }

      if (!isShopRow(result.shop)) {
        setAddError(
          "The shop was created, but the server returned invalid shop data. Refresh the page before trying again.",
        );

        return;
      }

      const refreshed = await reloadShops(false);

      if (!refreshed) {
        setAddError(
          "The shop may have been created, but the updated shop list could not be verified. Refresh the page and check before submitting again.",
        );

        return;
      }

      const ownerEmail = result.owner?.email || form.owner_email;
      const ownerPhone = result.owner?.phone || form.owner_phone;

      const ownerCreated = result.owner?.created === true;

      setCreatedOwner({
        email: ownerEmail,
        phone: ownerPhone,
        shopName: result.shop.name,
        isExistingOwner: !ownerCreated,
      });

      setForm(EMPTY_FORM);

      showToast(`Shop "${result.shop.name}" created successfully.`);
    } catch (error) {
      setAddError(
        error instanceof Error
          ? error.message
          : "Network error. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return shops.filter((shop) => {
      const matchesSearch =
        !query ||
        shop.name.toLowerCase().includes(query) ||
        shop.slug.toLowerCase().includes(query) ||
        shop.city?.toLowerCase().includes(query) ||
        shop.state?.toLowerCase().includes(query);

      const matchesStatus =
        filterStatus === "all" || shop.subscription_status === filterStatus;

      return matchesSearch && matchesStatus;
    });
  }, [shops, search, filterStatus]);

  const stats = useMemo(
    () => ({
      total: shops.length,
      active: shops.filter((shop) => shop.is_active).length,
      trial: shops.filter((shop) => shop.subscription_status === "trial")
        .length,
      paying: shops.filter((shop) => shop.subscription_status === "active")
        .length,
    }),
    [shops],
  );

  const S = {
    card: {
      background: "#FFFFFF",
      border: "1px solid var(--surface-border)",
      borderRadius: 12,
      padding: 20,
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

    input: {
      width: "100%",
      padding: "9px 14px",
      borderRadius: 8,
      border: "1px solid var(--surface-border)",
      background: "var(--surface)",
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
      color: "var(--ink-faint)",
      fontWeight: 600,
      borderBottom: "1px solid var(--surface-border)",
    } as React.CSSProperties,

    td: {
      padding: "12px 16px",
      fontSize: "var(--text-base)",
      color: "var(--ink-muted)",
      borderBottom: "1px solid var(--surface)",
    } as React.CSSProperties,
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "var(--text-xl)",
              fontWeight: 800,
              color: "var(--ink)",
              margin: 0,
            }}
          >
            Shops
          </h1>

          <p
            style={{
              fontSize: "var(--text-base)",
              color: "var(--ink-muted)",
              marginTop: 2,
              marginBottom: 0,
            }}
          >
            Manage all merchant accounts
          </p>
        </div>

        <button
          type="button"
          style={S.btn("var(--brand)", "#fff")}
          onClick={() => {
            setShowAdd(true);
            setAddError("");
            setCreatedOwner(null);
          }}
        >
          <Plus size={14} />
          Add Shop
        </button>
      </div>

      <div
        className="shops-stats"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
        }}
      >
        {[
          {
            label: "Total Shops",
            value: stats.total,
            icon: <Store size={16} color="var(--ink-muted)" />,
            color: "var(--ink)",
          },
          {
            label: "Active",
            value: stats.active,
            icon: <CheckCircle size={16} color="#22c55e" />,
            color: "#22c55e",
          },
          {
            label: "On Trial",
            value: stats.trial,
            icon: <AlertTriangle size={16} color="#D97706" />,
            color: "#D97706",
          },
          {
            label: "Paying",
            value: stats.paying,
            icon: <CheckCircle size={16} color="var(--brand)" />,
            color: "var(--brand)",
          },
        ].map((stat) => (
          <div key={stat.label} style={S.card}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--ink-muted)",
                }}
              >
                {stat.label}
              </span>

              {stat.icon}
            </div>

            <div
              style={{
                fontSize: "var(--text-2xl)",
                fontWeight: 800,
                color: stat.color,
              }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div
        className="shops-filters"
        style={{
          display: "flex",
          gap: 12,
        }}
      >
        <div
          style={{
            position: "relative",
            flex: 1,
          }}
        >
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--ink-faint)",
            }}
          />

          <input
            style={{
              ...S.input,
              paddingLeft: 36,
            }}
            placeholder="Search shops..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <select
          style={{
            ...S.input,
            width: 180,
          }}
          value={filterStatus}
          onChange={(event) =>
            setFilterStatus(event.target.value as "all" | SubscriptionStatus)
          }
        >
          <option value="all">All subscriptions</option>

          {Object.entries(SUB).map(([value, config]) => (
            <option key={value} value={value}>
              {config.label}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          ...S.card,
          padding: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            overflowX: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                {[
                  "Shop",
                  "Location",
                  "Subscription",
                  "Trial Ends",
                  "Status",
                  "Joined",
                  "Actions",
                ].map((heading) => (
                  <th key={heading} style={S.th}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={S.td}>
                    {search || filterStatus !== "all" ? (
                      <EmptyState icon={Search} title="No shops match the selected filters" compact />
                    ) : (
                      <EmptyState icon={Store} title="No shops yet" description="Add the first shop to get started." compact />
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((shop) => {
                  const sub = SUB[shop.subscription_status] ?? SUB.trial;

                  const trialExpired = shop.trial_ends_at
                    ? isPast(new Date(shop.trial_ends_at))
                    : false;

                  const isUpdating = updatingShopId === shop.id;

                  return (
                    <tr
                      key={shop.id}
                      style={{
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.background =
                          "var(--surface-hover)";
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.background = "";
                      }}
                    >
                      <td style={S.td}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              background: "rgba(59,130,246,0.1)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <Store size={14} color="var(--brand)" />
                          </div>

                          <div>
                            <div
                              style={{
                                fontWeight: 600,
                                color: "var(--ink)",
                                fontSize: "var(--text-base)",
                              }}
                            >
                              {shop.name}
                            </div>

                            <div
                              style={{
                                fontSize: "var(--text-xs)",
                                color: "var(--ink-faint)",
                              }}
                            >
                              /{shop.slug}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={S.td}>
                        {shop.city ? (
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <MapPin size={12} />

                            {shop.city}

                            {shop.state ? `, ${shop.state}` : ""}
                          </span>
                        ) : (
                          <span
                            style={{
                              color: "var(--ink-faint)",
                            }}
                          >
                            —
                          </span>
                        )}
                      </td>

                      <td style={S.td}>
                        <span style={S.badge(sub.color, sub.bg)}>
                          {sub.label}
                        </span>
                      </td>

                      <td style={S.td}>
                        {shop.subscription_status === "trial" &&
                        shop.trial_ends_at ? (
                          <span
                            style={{
                              fontSize: "var(--text-sm)",
                              color: trialExpired ? "#ef4444" : "var(--ink-muted)",
                            }}
                          >
                            {trialExpired
                              ? "Expired"
                              : formatDistanceToNow(
                                  new Date(shop.trial_ends_at),
                                  {
                                    addSuffix: true,
                                  },
                                )}
                          </span>
                        ) : (
                          <span
                            style={{
                              color: "var(--ink-faint)",
                            }}
                          >
                            —
                          </span>
                        )}
                      </td>

                      <td style={S.td}>
                        <span
                          style={S.badge(
                            shop.is_active ? "#22c55e" : "#ef4444",
                            shop.is_active
                              ? "rgba(34,197,94,0.1)"
                              : "rgba(239,68,68,0.1)",
                          )}
                        >
                          {shop.is_active ? (
                            <CheckCircle size={10} />
                          ) : (
                            <XCircle size={10} />
                          )}

                          {shop.is_active ? "Active" : "Suspended"}
                        </span>
                      </td>

                      <td style={S.td}>
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            fontSize: "var(--text-sm)",
                          }}
                        >
                          <Calendar size={12} />

                          {format(new Date(shop.created_at), "dd MMM yyyy")}
                        </span>
                      </td>

                      <td
                        style={{
                          ...S.td,
                          textAlign: "right",
                          paddingRight: 16,
                        }}
                      >
                        <div
                          style={{
                            position: "relative",
                            display: "inline-block",
                          }}
                        >
                          <button
                            type="button"
                            disabled={isUpdating}
                            aria-label={`Open actions for ${shop.name}`}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: isUpdating ? "not-allowed" : "pointer",
                              color: "var(--ink-muted)",
                              padding: "4px 6px",
                              borderRadius: 6,
                              opacity: isUpdating ? 0.5 : 1,
                            }}
                            onClick={(e) => {
                              if (openMenu === shop.id) {
                                setOpenMenu(null);
                                return;
                              }
                              const rect =
                                e.currentTarget.getBoundingClientRect();
                              setMenuAnchor({
                                top: rect.top,
                                bottom: rect.bottom,
                                left: rect.left,
                                right: rect.right,
                              });
                              setOpenMenu(shop.id);
                            }}
                          >
                            <MoreVertical size={16} />
                          </button>

                          {openMenu === shop.id && menuAnchor && (
                            <>
                              <div
                                style={{
                                  position: "fixed",
                                  inset: 0,
                                  zIndex: 10,
                                }}
                                onClick={() => setOpenMenu(null)}
                              />

                              <div
                                ref={menuRef}
                                style={{
                                  position: "fixed",
                                  left: Math.min(
                                    Math.max(8, menuAnchor.right - 200),
                                    window.innerWidth - 208,
                                  ),
                                  ...(menuOpenUpward
                                    ? {
                                        bottom:
                                          window.innerHeight -
                                          menuAnchor.top +
                                          4,
                                      }
                                    : { top: menuAnchor.bottom + 4 }),
                                  zIndex: 20,
                                  width: 200,
                                  background: "#FFFFFF",
                                  border: "1px solid var(--surface-border)",
                                  borderRadius: 12,
                                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                                  padding: "4px 0",
                                }}
                              >
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => toggleActive(shop)}
                                  style={{
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "8px 14px",
                                    background: "none",
                                    border: "none",
                                    cursor: isUpdating
                                      ? "not-allowed"
                                      : "pointer",
                                    color: shop.is_active
                                      ? "#ef4444"
                                      : "#22c55e",
                                    fontSize: "var(--text-base)",
                                    fontFamily: "inherit",
                                  }}
                                >
                                  {shop.is_active ? (
                                    <>
                                      <XCircle size={14} />
                                      Suspend
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle size={14} />
                                      Activate
                                    </>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => openWhatsappModal(shop)}
                                  style={{
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "8px 14px",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    color: "var(--ink)",
                                    fontSize: "var(--text-base)",
                                    fontFamily: "inherit",
                                  }}
                                >
                                  <MessageSquare size={14} />
                                  Manage WhatsApp
                                </button>

                                <div
                                  style={{
                                    borderTop: "1px solid var(--surface-border)",
                                    margin: "4px 0",
                                  }}
                                />

                                <div
                                  style={{
                                    padding: "4px 14px",
                                    fontSize: "var(--text-xs)",
                                    color: "var(--ink-faint)",
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.6px",
                                  }}
                                >
                                  Subscription
                                </div>

                                {(
                                  Object.entries(SUB) as [
                                    SubscriptionStatus,
                                    (typeof SUB)[SubscriptionStatus],
                                  ][]
                                ).map(([value, config]) => (
                                  <button
                                    type="button"
                                    key={value}
                                    disabled={isUpdating}
                                    onClick={() => updateSub(shop, value)}
                                    style={{
                                      width: "100%",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      padding: "7px 14px",
                                      background: "none",
                                      border: "none",
                                      cursor: isUpdating
                                        ? "not-allowed"
                                        : "pointer",
                                      color:
                                        shop.subscription_status === value
                                          ? "var(--brand)"
                                          : "var(--ink)",
                                      fontSize: "var(--text-base)",
                                      fontFamily: "inherit",
                                    }}
                                  >
                                    {shop.subscription_status === value && (
                                      <CheckCircle size={12} />
                                    )}

                                    <span
                                      style={{
                                        marginLeft:
                                          shop.subscription_status === value
                                            ? 0
                                            : 20,
                                      }}
                                    >
                                      {config.label}
                                    </span>
                                  </button>
                                ))}

                                <div
                                  style={{
                                    borderTop: "1px solid var(--surface-border)",
                                    margin: "4px 0",
                                  }}
                                />

                                <a
                                  href={`/shop/${encodeURIComponent(
                                    shop.slug,
                                  )}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "8px 14px",
                                    color: "var(--ink)",
                                    fontSize: "var(--text-base)",
                                    textDecoration: "none",
                                  }}
                                  onClick={() => setOpenMenu(null)}
                                >
                                  <ExternalLink size={14} />
                                  View public page
                                </a>
                              </div>
                            </>
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

        {filtered.length > 0 && (
          <div
            style={{
              padding: "10px 16px",
              borderTop: "1px solid var(--surface-border)",
              fontSize: "var(--text-sm)",
              color: "var(--ink-faint)",
            }}
          >
            Showing {filtered.length} of {shops.length} shops
            {loadingShops ? " • Refreshing..." : ""}
          </div>
        )}
      </div>

      {showAdd && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
            }}
            onClick={closeAddModal}
          />

          <div
            style={{
              position: "relative",
              background: "#FFFFFF",
              border: "1px solid var(--surface-border)",
              borderRadius: 16,
              width: "100%",
              maxWidth: 440,
              padding: 24,
              maxHeight: "calc(100vh - 32px)",
              overflowY: "auto",
            }}
          >
            <h2
              style={{
                fontSize: "var(--text-md)",
                fontWeight: 700,
                color: "var(--ink)",
                marginTop: 0,
                marginBottom: 4,
              }}
            >
              Add New Shop
            </h2>

            <p
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--ink-muted)",
                marginTop: 0,
                marginBottom: 20,
              }}
            >
              Creates a shop and assigns an owner login.
            </p>

            {createdOwner ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    background: "rgba(34,197,94,0.1)",
                    border: "1px solid rgba(34,197,94,0.3)",
                    borderRadius: 10,
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      color: "var(--brand-dark)",
                      fontWeight: 700,
                      fontSize: "var(--text-md)",
                      marginBottom: 6,
                    }}
                  >
                    Shop created successfully
                  </div>

                  <div
                    style={{
                      color: "var(--ink)",
                      fontSize: "var(--text-sm)",
                    }}
                  >
                    Owner login for <strong>{createdOwner.shopName}</strong>
                  </div>
                </div>

                <div>
                  <label style={S.label}>Owner email</label>

                  <div
                    style={{
                      ...S.input,
                      wordBreak: "break-all",
                    }}
                  >
                    {createdOwner.email}
                  </div>
                </div>

                <div>
                  <label style={S.label}>Owner phone</label>

                  <div
                    style={{
                      ...S.input,
                      fontFamily: "monospace",
                      wordBreak: "break-all",
                    }}
                  >
                    {createdOwner.phone}
                  </div>
                </div>

                {createdOwner.isExistingOwner ? (
                  <div
                    style={{
                      background: "rgba(59,130,246,0.1)",
                      border: "1px solid rgba(59,130,246,0.3)",
                      borderRadius: 10,
                      padding: 12,
                      color: "#1D4ED8",
                      fontSize: "var(--text-sm)",
                      lineHeight: 1.5,
                    }}
                  >
                    This owner already has a GrooVia account. They can sign in
                    with their existing phone number.
                  </div>
                ) : (
                  <p
                    style={{
                      fontSize: "var(--text-xs)",
                      color: "#B7791F",
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    No password needed — the owner signs in from the login
                    page with this phone number and a one-time code sent via
                    SMS.
                  </p>
                )}

                <button
                  type="button"
                  onClick={closeAddModal}
                  style={{
                    ...S.btn("var(--brand)", "#fff"),
                    justifyContent: "center",
                  }}
                >
                  Done
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleAdd}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <div>
                  <label style={S.label}>Shop name *</label>

                  <input
                    style={S.input}
                    value={form.name}
                    onChange={(event) => handleName(event.target.value)}
                    placeholder="Sharma Kirana"
                    required
                    disabled={saving}
                  />
                </div>

                <div>
                  <label style={S.label}>
                    Slug *{" "}
                    <span
                      style={{
                        color: "var(--ink-faint)",
                        fontWeight: 400,
                      }}
                    >
                      (URL: /shop/...)
                    </span>
                  </label>

                  <input
                    style={S.input}
                    value={form.slug}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        slug: event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, "")
                          .replace(/-{2,}/g, "-")
                          .replace(/^-+|-+$/g, ""),
                      }))
                    }
                    placeholder="sharma-kirana"
                    required
                    disabled={saving}
                  />
                </div>

                <div>
                  <label style={S.label}>Description</label>

                  <textarea
                    style={{
                      ...S.input,
                      minHeight: 88,
                      resize: "vertical",
                    }}
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Tell customers what makes this shop special"
                    disabled={saving}
                  />
                </div>

                <div>
                  <label style={S.label}>PIN code *</label>

                  <input
                    style={S.input}
                    type="text"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    value={form.postal_code}
                    onChange={(event) => {
                      const postalCode = event.target.value.replace(/\D/g, "").slice(0, 6);

                      setForm((current) => ({
                        ...current,
                        postal_code: postalCode,
                      }));

                      if (postalCode.length < 6) {
                        setPinError("");
                      }

                      if (postalCode.length === 6) {
                        void lookupPinCode(postalCode);
                      }
                    }}
                    placeholder="380015"
                    maxLength={6}
                    required
                    disabled={saving}
                  />

                  {pinLoading && (
                    <p
                      style={{
                        margin: "5px 0 0",
                        fontSize: "var(--text-sm)",
                        color: "var(--ink-muted)",
                      }}
                    >
                      Looking up city and state...
                    </p>
                  )}

                  {pinError && (
                    <p
                      style={{
                        margin: "5px 0 0",
                        fontSize: "var(--text-sm)",
                        color: "var(--error)",
                      }}
                    >
                      {pinError}
                    </p>
                  )}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <div>
                    <label style={S.label}>City *</label>

                    <input
                      style={S.input}
                      value={form.city}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          city: event.target.value,
                        }))
                      }
                      placeholder="Ahmedabad"
                      required
                      disabled={saving}
                    />
                  </div>

                  <div>
                    <label style={S.label}>State *</label>

                    <input
                      style={S.input}
                      value={form.state}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          state: event.target.value,
                        }))
                      }
                      placeholder="Gujarat"
                      required
                      disabled={saving}
                    />
                  </div>
                </div>

                <div>
                  <label style={S.label}>Area / Locality</label>

                  <input
                    style={S.input}
                    value={form.area}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        area: event.target.value,
                      }))
                    }
                    placeholder="Satellite"
                    disabled={saving}
                  />
                </div>

                <div>
                  <label style={S.label}>Address</label>

                  <input
                    style={S.input}
                    value={form.address_line_1}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        address_line_1: event.target.value,
                      }))
                    }
                    placeholder="Shop #12, Main Road"
                    disabled={saving}
                  />
                </div>

                <div>
                  <label style={S.label}>Address line 2 (optional)</label>

                  <input
                    style={S.input}
                    value={form.address_line_2}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        address_line_2: event.target.value,
                      }))
                    }
                    placeholder="Landmark, area"
                    disabled={saving}
                  />
                </div>

                <div
                  style={{
                    borderTop: "1px solid var(--surface-border)",
                    paddingTop: 14,
                    marginTop: 2,
                  }}
                >
                  <div
                    style={{
                      fontSize: "var(--text-sm)",
                      color: "var(--ink)",
                      fontWeight: 700,
                      marginBottom: 10,
                    }}
                  >
                    Shop owner
                  </div>

                  <div
                    className="shop-owner-grid"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <div>
                      <label style={S.label}>Full name *</label>

                      <input
                        style={S.input}
                        value={form.owner_name}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            owner_name: event.target.value,
                          }))
                        }
                        placeholder="Rajesh Sharma"
                        required
                        disabled={saving}
                      />
                    </div>

                    <div>
                      <label style={S.label}>Email *</label>

                      <input
                        type="email"
                        style={S.input}
                        value={form.owner_email}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            owner_email: event.target.value,
                          }))
                        }
                        placeholder="owner@example.com"
                        required
                        disabled={saving}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label style={S.label}>Mobile number *</label>

                  <input
                    type="tel"
                    inputMode="numeric"
                    style={S.input}
                    value={form.owner_phone}
                    onChange={(event) => {
                      const phone = event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 10);

                      setForm((current) => ({
                        ...current,
                        owner_phone: phone,
                      }));
                    }}
                    placeholder="9876543210"
                    minLength={10}
                    maxLength={10}
                    pattern="[6-9][0-9]{9}"
                    required
                    disabled={saving}
                  />
                </div>

                {addError && (
                  <div
                    role="alert"
                    style={{
                      background: "rgba(239,68,68,0.1)",
                      border: "1px solid rgba(239,68,68,0.3)",
                      borderRadius: 8,
                      padding: "8px 12px",
                      color: "var(--error)",
                      fontSize: "var(--text-sm)",
                    }}
                  >
                    {addError}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginTop: 4,
                  }}
                >
                  <button
                    type="button"
                    onClick={closeAddModal}
                    disabled={saving}
                    style={{
                      ...S.btn("var(--surface-border)", "var(--ink-muted)"),
                      flex: 1,
                      justifyContent: "center",
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      ...S.btn("var(--brand)", "#fff"),
                      flex: 1,
                      justifyContent: "center",
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? "Creating..." : "Create Shop"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {whatsappShop && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }}
            onClick={closeWhatsappModal}
          />

          <div
            style={{
              position: "relative",
              background: "#FFFFFF",
              border: "1px solid var(--surface-border)",
              borderRadius: 16,
              width: "100%",
              maxWidth: 440,
              padding: 24,
              maxHeight: "calc(100vh - 32px)",
              overflowY: "auto",
            }}
          >
            <h2 style={{ fontSize: "var(--text-md)", fontWeight: 700, color: "var(--ink)", marginTop: 0, marginBottom: 4 }}>
              WhatsApp Connection — {whatsappShop.name}
            </h2>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)", marginTop: 0, marginBottom: 20 }}>
              Find these values in Meta Business Manager → WhatsApp Manager → API Setup for this shop&apos;s number.
            </p>

            {whatsappLoading ? (
              <p style={{ fontSize: "var(--text-base)", color: "var(--ink-faint)" }}>Loading…</p>
            ) : (
              <form onSubmit={handleSaveWhatsapp} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {whatsappError && (
                  <div
                    style={{
                      color: "var(--error)",
                      background: "rgba(239,68,68,0.1)",
                      border: "1px solid rgba(239,68,68,0.2)",
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: "var(--text-base)",
                    }}
                  >
                    {whatsappError}
                  </div>
                )}

                <div>
                  <label style={S.label}>Phone Number ID *</label>
                  <input
                    style={S.input}
                    value={whatsappForm.phone_number_id}
                    onChange={(e) => setWhatsappForm((f) => ({ ...f, phone_number_id: e.target.value }))}
                    placeholder="e.g. 1135902319616581"
                  />
                </div>

                <div>
                  <label style={S.label}>WhatsApp Business Account ID *</label>
                  <input
                    style={S.input}
                    value={whatsappForm.business_account_id}
                    onChange={(e) => setWhatsappForm((f) => ({ ...f, business_account_id: e.target.value }))}
                  />
                </div>

                <div>
                  <label style={S.label}>Display phone number</label>
                  {/* Read-only: no longer hand-typed — a manually entered
                      value drifted from Meta's actual number on a real
                      shop, silently breaking every wa.me redirect in the
                      app. Saving now re-fetches this straight from Meta
                      using the Phone Number ID above, so this box always
                      reflects what's actually live, not what someone
                      typed once and forgot to update. */}
                  <input
                    style={{ ...S.input, background: "var(--surface)", color: "var(--ink-faint)" }}
                    value={whatsappForm.display_phone_number || "Verified from Meta on save"}
                    disabled
                  />
                </div>

                <div>
                  <label style={S.label}>Meta Commerce Catalog ID</label>
                  <input
                    style={S.input}
                    value={whatsappForm.catalog_id}
                    onChange={(e) => setWhatsappForm((f) => ({ ...f, catalog_id: e.target.value }))}
                    placeholder="Optional — add once the catalog is created"
                  />
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={closeWhatsappModal}
                    disabled={whatsappSaving}
                    style={{ ...S.btn("var(--surface-border)", "var(--ink-muted)"), flex: 1, justifyContent: "center", opacity: whatsappSaving ? 0.6 : 1 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={whatsappSaving}
                    style={{ ...S.btn("var(--brand)", "#fff"), flex: 1, justifyContent: "center", opacity: whatsappSaving ? 0.6 : 1 }}
                  >
                    {whatsappSaving ? "Saving…" : "Save connection"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 99,
            background: "#FFFFFF",
            border: "1px solid var(--surface-border)",
            borderRadius: 12,
            padding: "12px 20px",
            fontSize: "var(--text-base)",
            color: "var(--ink)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          <CheckCircle size={14} color="#22c55e" />
          {toast}
        </div>
      )}
    </div>
  );
}
