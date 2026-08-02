// Registry of Meta-approved WhatsApp message templates, keyed by the
// resulting order status (orders.status) — not by WhatsApp command name —
// so both the WhatsApp-triggered path and any future dashboard-triggered
// path can look up the right template the same way: "this order just
// became <status>".
//
// Every template shares the same first three variables — customer name,
// order number, shop name — with a status-specific tail appended after.
// `name` must exactly match the approved template's name in Meta, and the
// approved copy must use exactly 4 variables in this order: customer
// name, order number, shop name, then the tail value below.

function fmtSlot(order) {
  if (order.pickup_slot_label) return order.pickup_slot_label;

  if (order.preferred_pickup_time) {
    return new Date(order.preferred_pickup_time).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return 'shortly';
}

// Placeholder copy — adjust once the actual approved template wording (and
// any shop-specific pickup instructions) is finalized.
function nextStep() {
  return 'Please collect it at your earliest convenience.';
}

function fmtMoney(amount, currencyCode) {
  const value = Number(amount ?? 0).toFixed(2);
  return currencyCode === 'INR' ? `₹${value}` : `${currencyCode ?? ''} ${value}`.trim();
}

const ORDER_TEMPLATES = {
  accepted: {
    name: 'order_confirmed',
    language: 'en',
    tail: (order) => [fmtSlot(order)],
  },
  ready: {
    name: 'order_ready',
    language: 'en',
    tail: () => [nextStep()],
  },
  completed: {
    name: 'order_completed',
    language: 'en',
    tail: (order) => [fmtMoney(order.total_amount, order.currency_code)],
  },
  rejected: {
    name: 'order_rejected',
    language: 'en',
    tail: (order) => [order.rejection_reason || 'Not specified'],
  },
  cancelled: {
    name: 'order_cancelled',
    language: 'en',
    tail: (order) => [order.cancellation_reason || 'Not specified'],
  },
};

function getTemplate(status) {
  return ORDER_TEMPLATES[status] || null;
}

module.exports = { ORDER_TEMPLATES, getTemplate };
