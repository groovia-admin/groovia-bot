"use client";

import { useMemo, useState } from "react";
import { Plus, ShieldCheck, UserX, UserCheck } from "lucide-react";

type StaffRole = "owner" | "manager" | "staff";

type StaffRow = {
  id: string;
  full_name: string;
  phone_number: string | null;
  role: StaffRole;
  is_active: boolean;
  created_at: string;
};

const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
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

const ROLE_BADGE: Record<StaffRole, [string, string]> = {
  owner: ["#3b82f6", "rgba(59,130,246,0.12)"],
  manager: ["#a78bfa", "rgba(167,139,250,0.12)"],
  staff: ["#94a3b8", "rgba(148,163,184,0.12)"],
};

export default function StaffClient({ initialStaff }: { initialStaff: StaffRow[] }) {
  const [staff, setStaff] = useState<StaffRow[]>(initialStaff);
  const [showAdd, setShowAdd] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"manager" | "staff">("staff");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => fullName.trim().length > 0 && phone.replace(/\D/g, "").length === 10,
    [fullName, phone],
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/shop/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, phoneNumber: phone, role }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to add staff member");
        return;
      }

      setStaff((prev) => [data.staff, ...prev]);
      setFullName("");
      setPhone("");
      setRole("staff");
      setShowAdd(false);
    } catch {
      setError("Failed to add staff member. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStaff(id: string, changes: { role?: StaffRole; is_active?: boolean }) {
    setBusyId(id);
    setError("");

    try {
      const response = await fetch(`/api/shop/staff/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to update staff member");
        return;
      }

      setStaff((prev) => prev.map((row) => (row.id === id ? data.staff : row)));
    } catch {
      setError("Failed to update staff member. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", margin: 0 }}>Staff</h1>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            Manage who can access this shop and what they can do.
          </p>
        </div>
        <button type="button" style={S.btn("#3b82f6", "#fff")} onClick={() => setShowAdd((v) => !v)}>
          <Plus size={15} />
          Add staff
        </button>
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

      {showAdd && (
        <form onSubmit={handleAdd} style={{ ...S.card, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px", gap: 14 }}>
            <div>
              <label style={S.label}>Full name</label>
              <input
                style={S.input}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Staff member's name"
              />
            </div>
            <div>
              <label style={S.label}>Phone number</label>
              <div style={{ display: "flex" }}>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0 12px",
                    borderRadius: "8px 0 0 8px",
                    border: "1px solid #334155",
                    borderRight: "none",
                    background: "#0f172a",
                    color: "#64748b",
                    fontSize: 13,
                  }}
                >
                  +91
                </span>
                <input
                  style={{ ...S.input, borderRadius: "0 8px 8px 0" }}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="98765 43210"
                  maxLength={10}
                />
              </div>
            </div>
            <div>
              <label style={S.label}>Role</label>
              <select
                style={S.input}
                value={role}
                onChange={(e) => setRole(e.target.value as "manager" | "staff")}
              >
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={!canSubmit || saving} style={{ ...S.btn("#3b82f6", "#fff"), opacity: !canSubmit || saving ? 0.5 : 1 }}>
              {saving ? "Adding…" : "Add staff member"}
            </button>
            <button type="button" style={S.btn("#334155", "#cbd5e1")} onClick={() => setShowAdd(false)}>
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
                <th style={S.th}>Phone</th>
                <th style={S.th}>Role</th>
                <th style={S.th}>Status</th>
                <th style={{ ...S.th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr>
                  <td style={S.td} colSpan={5}>
                    No staff added yet.
                  </td>
                </tr>
              ) : (
                staff.map((row) => {
                  const [color, background] = ROLE_BADGE[row.role];
                  const busy = busyId === row.id;
                  return (
                    <tr key={row.id}>
                      <td style={{ ...S.td, color: "#f1f5f9", fontWeight: 500 }}>{row.full_name}</td>
                      <td style={S.td}>{row.phone_number ?? "—"}</td>
                      <td style={S.td}>
                        {row.role === "owner" ? (
                          <span style={S.badge(color, background)}>
                            <ShieldCheck size={12} />
                            {ROLE_LABEL[row.role]}
                          </span>
                        ) : (
                          <select
                            disabled={busy}
                            value={row.role}
                            onChange={(e) => updateStaff(row.id, { role: e.target.value as StaffRole })}
                            style={{
                              ...S.input,
                              width: "auto",
                              padding: "4px 8px",
                              fontSize: 12,
                            }}
                          >
                            <option value="staff">Staff</option>
                            <option value="manager">Manager</option>
                          </select>
                        )}
                      </td>
                      <td style={S.td}>
                        <span
                          style={S.badge(
                            row.is_active ? "#22c55e" : "#94a3b8",
                            row.is_active ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.12)",
                          )}
                        >
                          {row.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={{ ...S.td, textAlign: "right" }}>
                        {row.role !== "owner" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => updateStaff(row.id, { is_active: !row.is_active })}
                            style={{
                              ...S.btn(
                                row.is_active ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                                row.is_active ? "#ef4444" : "#22c55e",
                              ),
                              padding: "6px 12px",
                              opacity: busy ? 0.5 : 1,
                            }}
                          >
                            {row.is_active ? <UserX size={13} /> : <UserCheck size={13} />}
                            {row.is_active ? "Deactivate" : "Reactivate"}
                          </button>
                        )}
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
