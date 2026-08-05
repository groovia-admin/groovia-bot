"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { MessageSquare, User } from "lucide-react";

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
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 12,
    overflow: "hidden",
  } as React.CSSProperties,
};

export default function ConversationsClient({ initialConversations }: { initialConversations: ConversationRow[] }) {
  const [conversations] = useState<ConversationRow[]>(initialConversations);
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

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", margin: 0 }}>Conversations</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
          Customer WhatsApp conversations. Staff order commands aren&apos;t included here.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, height: "calc(100vh - 220px)", minHeight: 400 }}>
        <div style={{ ...S.card, display: "flex", flexDirection: "column" }}>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {conversations.length === 0 ? (
              <div style={{ padding: 20, fontSize: 13, color: "#64748b" }}>No conversations yet.</div>
            ) : (
              conversations.map((c) => {
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
                      background: active ? "rgba(59,130,246,0.12)" : "transparent",
                      border: "none",
                      borderBottom: "1px solid rgba(51,65,85,0.6)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "#334155",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <User size={14} color="#94a3b8" />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: active ? "#3b82f6" : "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.customer_name || c.customer_phone}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>
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
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 13 }}>
              <div style={{ textAlign: "center" }}>
                <MessageSquare size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
                <div>Select a conversation</div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #334155" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>
                  {selectedConversation.customer_name || selectedConversation.customer_phone}
                </div>
                {selectedConversation.customer_name && (
                  <div style={{ fontSize: 12, color: "#64748b" }}>{selectedConversation.customer_phone}</div>
                )}
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                {loading ? (
                  <div style={{ fontSize: 13, color: "#64748b" }}>Loading…</div>
                ) : error ? (
                  <div style={{ fontSize: 13, color: "#f87171" }}>{error}</div>
                ) : messages.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#64748b" }}>No messages in this conversation yet.</div>
                ) : (
                  messages.map((m) => {
                    const fromCustomer = m.direction === "inbound";
                    return (
                      <div
                        key={m.id}
                        style={{
                          alignSelf: fromCustomer ? "flex-start" : "flex-end",
                          maxWidth: "70%",
                          background: fromCustomer ? "#334155" : "#1e40af",
                          color: "#f1f5f9",
                          padding: "8px 12px",
                          borderRadius: 10,
                          fontSize: 13,
                          lineHeight: 1.4,
                        }}
                      >
                        <div style={{ whiteSpace: "pre-wrap" }}>{m.content || `[${m.message_type}]`}</div>
                        <div style={{ fontSize: 10, color: "rgba(241,245,249,0.6)", marginTop: 4, textAlign: "right" }}>
                          {format(new Date(m.sent_at), "MMM d, HH:mm")}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
