"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { MessageSquare, User, Search } from "lucide-react";

type ConversationRow = {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  status: string;
  last_message_at: string | null;
  created_at: string;
};

type MessageRow = {
  id: string;
  direction: "inbound" | "outbound";
  sender_type: string;
  message_type: string;
  content: string | null;
  sent_at: string;
};

const S = {
  card: {
    background: "#FFFFFF",
    border: "1px solid var(--surface-border)",
    borderRadius: 12,
    overflow: "hidden",
  } as React.CSSProperties,
};

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMMM d, yyyy");
}

export default function ConversationsClient({ initialConversations }: { initialConversations: ConversationRow[] }) {
  const [conversations] = useState<ConversationRow[]>(initialConversations);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id ?? null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  async function selectConversation(id: string) {
    setSelectedId(id);
    if (loadedFor === id) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/shop/conversations/${id}/messages`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to load messages");
        return;
      }

      setMessages(data.messages);
      setLoadedFor(id);
    } catch {
      setError("Failed to load messages. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Load the initially-selected conversation's thread once, after mount.
  useEffect(() => {
    if (selectedId) selectConversation(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statuses = useMemo(() => {
    const set = new Set(conversations.map((c) => c.status));
    return Array.from(set);
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (c.customer_name ?? "").toLowerCase().includes(q) ||
        c.customer_phone.toLowerCase().includes(q)
      );
    });
  }, [conversations, search, statusFilter]);

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;

  // Group the thread's messages by calendar day so a running conversation
  // reads like WhatsApp itself: date divider, then messages underneath it.
  const groupedMessages = useMemo(() => {
    const groups: { label: string; items: MessageRow[] }[] = [];
    for (const m of messages) {
      const label = dayLabel(m.sent_at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) {
        last.items.push(m);
      } else {
        groups.push({ label, items: [m] });
      }
    }
    return groups;
  }, [messages]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", margin: 0 }}>Conversations</h1>
        <p style={{ fontSize: 13, color: "var(--ink-muted)", marginTop: 4 }}>
          Customer WhatsApp conversations. Staff order commands aren&apos;t included here.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, height: "calc(100vh - 220px)", minHeight: 400 }}>
        <div style={{ ...S.card, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, borderBottom: "1px solid var(--surface-border)" }}>
            <div style={{ position: "relative" }}>
              <Search size={14} color="var(--ink-faint)" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone…"
                style={{
                  width: "100%",
                  padding: "8px 10px 8px 30px",
                  fontSize: 13,
                  border: "1px solid var(--surface-border)",
                  borderRadius: 8,
                  background: "var(--surface)",
                  color: "var(--ink)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            {statuses.length > 1 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["all", ...statuses].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    style={{
                      padding: "3px 10px",
                      fontSize: 11,
                      borderRadius: 999,
                      border: "1px solid " + (statusFilter === s ? "var(--brand)" : "var(--surface-border)"),
                      background: statusFilter === s ? "var(--brand-light)" : "#FFFFFF",
                      color: statusFilter === s ? "var(--brand-dark)" : "var(--ink-muted)",
                      cursor: "pointer",
                      textTransform: "capitalize",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filteredConversations.length === 0 ? (
              <div style={{ padding: 20, fontSize: 13, color: "var(--ink-muted)" }}>
                {conversations.length === 0 ? "No conversations yet." : "No conversations match your search."}
              </div>
            ) : (
              filteredConversations.map((c) => {
                const active = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectConversation(c.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 16px",
                      background: active ? "var(--brand-light)" : "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--surface)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "var(--surface-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <User size={14} color="var(--ink-muted)" />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: active ? "var(--brand-dark)" : "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.customer_name || c.customer_phone}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>
                        {c.last_message_at ? formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true }) : "No messages"}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div style={{ ...S.card, display: "flex", flexDirection: "column" }}>
          {!selectedConversation ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-muted)", fontSize: 13 }}>
              <div style={{ textAlign: "center" }}>
                <MessageSquare size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
                <div>Select a conversation</div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--surface-border)" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
                  {selectedConversation.customer_name || selectedConversation.customer_phone}
                </div>
                {selectedConversation.customer_name && (
                  <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>{selectedConversation.customer_phone}</div>
                )}
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 14, background: "var(--surface)" }}>
                {loading ? (
                  <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>Loading…</div>
                ) : error ? (
                  <div style={{ fontSize: 13, color: "var(--error)" }}>{error}</div>
                ) : groupedMessages.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>No messages in this conversation yet.</div>
                ) : (
                  groupedMessages.map((group) => (
                    <div key={group.label} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ alignSelf: "center", fontSize: 11, color: "var(--ink-muted)", background: "#FFFFFF", border: "1px solid var(--surface-border)", borderRadius: 999, padding: "3px 12px" }}>
                        {group.label}
                      </div>
                      {group.items.map((m) => {
                        const fromCustomer = m.direction === "inbound";
                        return (
                          <div
                            key={m.id}
                            style={{
                              alignSelf: fromCustomer ? "flex-start" : "flex-end",
                              maxWidth: "70%",
                              background: fromCustomer ? "#FFFFFF" : "var(--brand-light)",
                              color: "var(--ink)",
                              padding: "8px 12px",
                              borderRadius: 10,
                              fontSize: 13,
                              lineHeight: 1.4,
                              boxShadow: "0 1px 2px rgba(11,28,48,0.06)",
                            }}
                          >
                            <div style={{ whiteSpace: "pre-wrap" }}>{m.content || `[${m.message_type}]`}</div>
                            <div style={{ fontSize: 10, color: "var(--ink-faint)", marginTop: 4, textAlign: "right" }}>
                              {format(new Date(m.sent_at), "HH:mm")}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
