"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  ExternalLink,
  MapPin,
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
  temporaryPassword: string | null;
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
    created?: boolean;
    temporaryPassword?: string | null;
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
    color: "#f59e0b",
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
    color: "#94a3b8",
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
      const response = await fetch(`https://api.postalpincode.in/pincode/${normalizedPin}`);

      if (!response.ok) {
        throw new Error("PIN code lookup failed");
      }

      const data = await response.json();
      const result = data?.[0];

      if (
        result?.Status !== "Success" ||
        !Array.isArray(result?.PostOffice) ||
        result.PostOffice.length === 0
      ) {
        setPinError("PIN code was not found. Please enter the city and state manually.");
        return;
      }

      const postOffice = result.PostOffice[0];

      setForm((current) => ({
        ...current,
        postal_code: normalizedPin,
        city: postOffice.District || current.city,
        state: postOffice.State || current.state,
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

      const ownerCreated = result.owner?.created === true;

      setCreatedOwner({
        email: ownerEmail,
        temporaryPassword: result.owner?.temporaryPassword ?? null,
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
      background: "#1e293b",
      border: "1px solid #334155",
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
              fontSize: 22,
              fontWeight: 800,
              color: "#f1f5f9",
              margin: 0,
            }}
          >
            Shops
          </h1>

          <p
            style={{
              fontSize: 13,
              color: "#94a3b8",
              marginTop: 2,
              marginBottom: 0,
            }}
          >
            Manage all merchant accounts
          </p>
        </div>

        <button
          type="button"
          style={S.btn("#3b82f6", "#fff")}
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
            icon: <Store size={16} color="#94a3b8" />,
            color: "#f1f5f9",
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
            icon: <AlertTriangle size={16} color="#f59e0b" />,
            color: "#f59e0b",
          },
          {
            label: "Paying",
            value: stats.paying,
            icon: <CheckCircle size={16} color="#3b82f6" />,
            color: "#3b82f6",
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
                  fontSize: 12,
                  color: "#94a3b8",
                }}
              >
                {stat.label}
              </span>

              {stat.icon}
            </div>

            <div
              style={{
                fontSize: 28,
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
              color: "#64748b",
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
                  <td
                    colSpan={7}
                    style={{
                      ...S.td,
                      textAlign: "center",
                      padding: 48,
                      color: "#64748b",
                    }}
                  >
                    {search || filterStatus !== "all"
                      ? "No shops match the selected filters."
                      : "No shops yet. Add the first shop."}
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
                          "rgba(51,65,85,0.4)";
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
                            <Store size={14} color="#3b82f6" />
                          </div>

                          <div>
                            <div
                              style={{
                                fontWeight: 600,
                                color: "#f1f5f9",
                                fontSize: 13,
                              }}
                            >
                              {shop.name}
                            </div>

                            <div
                              style={{
                                fontSize: 11,
                                color: "#64748b",
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
                              color: "#475569",
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
                              fontSize: 12,
                              color: trialExpired ? "#ef4444" : "#94a3b8",
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
                              color: "#475569",
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
                            fontSize: 12,
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
                              color: "#94a3b8",
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
                                  background: "#1e293b",
                                  border: "1px solid #334155",
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
                                    fontSize: 13,
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

                                <div
                                  style={{
                                    borderTop: "1px solid #334155",
                                    margin: "4px 0",
                                  }}
                                />

                                <div
                                  style={{
                                    padding: "4px 14px",
                                    fontSize: 11,
                                    color: "#64748b",
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
                                          ? "#3b82f6"
                                          : "#cbd5e1",
                                      fontSize: 13,
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
                                    borderTop: "1px solid #334155",
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
                                    color: "#cbd5e1",
                                    fontSize: 13,
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
              borderTop: "1px solid #334155",
              fontSize: 12,
              color: "#64748b",
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
              background: "#1e293b",
              border: "1px solid #334155",
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
                fontSize: 16,
                fontWeight: 700,
                color: "#f1f5f9",
                marginTop: 0,
                marginBottom: 4,
              }}
            >
              Add New Shop
            </h2>

            <p
              style={{
                fontSize: 12,
                color: "#94a3b8",
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
                      color: "#4ade80",
                      fontWeight: 700,
                      fontSize: 14,
                      marginBottom: 6,
                    }}
                  >
                    Shop created successfully
                  </div>

                  <div
                    style={{
                      color: "#cbd5e1",
                      fontSize: 12,
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

                {createdOwner.isExistingOwner ? (
                  <div
                    style={{
                      background: "rgba(59,130,246,0.1)",
                      border: "1px solid rgba(59,130,246,0.3)",
                      borderRadius: 10,
                      padding: 12,
                      color: "#bfdbfe",
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    This owner already has a GrooVia account. Their existing
                    password was not changed.
                  </div>
                ) : (
                  <>
                    <div>
                      <label style={S.label}>Temporary password</label>

                      <div
                        style={{
                          ...S.input,
                          fontFamily: "monospace",
                          wordBreak: "break-all",
                        }}
                      >
                        {createdOwner.temporaryPassword ||
                          "Password was not returned. Reset the owner password from Supabase Auth."}
                      </div>
                    </div>

                    <p
                      style={{
                        fontSize: 11,
                        color: "#fbbf24",
                        lineHeight: 1.5,
                        margin: 0,
                      }}
                    >
                      Save these credentials now. The temporary password is not
                      stored in the dashboard after this window is closed.
                    </p>
                  </>
                )}

                <button
                  type="button"
                  onClick={closeAddModal}
                  style={{
                    ...S.btn("#3b82f6", "#fff"),
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
                        color: "#475569",
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
                        fontSize: 12,
                        color: "#94a3b8",
                      }}
                    >
                      Looking up city and state...
                    </p>
                  )}

                  {pinError && (
                    <p
                      style={{
                        margin: "5px 0 0",
                        fontSize: 12,
                        color: "#f87171",
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

                <div
                  style={{
                    borderTop: "1px solid #334155",
                    paddingTop: 14,
                    marginTop: 2,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: "#cbd5e1",
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
                      color: "#f87171",
                      fontSize: 12,
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
                      ...S.btn("#334155", "#94a3b8"),
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
                      ...S.btn("#3b82f6", "#fff"),
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

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 99,
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 12,
            padding: "12px 20px",
            fontSize: 13,
            color: "#f1f5f9",
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
