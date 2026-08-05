// Registry of Meta-approved WhatsApp message templates, keyed by the
// resulting order status (orders.status) — not by WhatsApp command name —
// so both the WhatsApp-triggered path and any future dashboard-triggered
// path can look up the right template the same way: "this order just
// became <status>".
//
// `name`/`language` must exactly match what's actually registered in
// WhatsApp Manager, not what this code was originally written assuming —
// confirmed directly against the templates as approved (see `mode` below
// for why that matters beyond just the name).

// Placeholder copy — adjust once the actual approved template wording (and
// any shop-specific pickup instructions) is finalized.
function nextStep() {
  return 'Please collect it at your earliest convenience.';
}

function fmtMoney(amount, currencyCode) {
  const value = Number(amount ?? 0).toFixed(2);
  return currencyCode === 'INR' ? `₹${value}` : `${currencyCode ?? ''} ${value}`.trim();
}

// Two parameter styles, because the templates actually approved in Meta
// don't all use the same one:
//   'positional' — {{1}}, {{2}}, ... in order; tail(order) returns the
//                   values after [customerName, orderNumber, shopName].
//   'named'      — {{variable_name}}; params(order, customerName, shopName)
//                   returns the exact key/value map the approved template
//                   uses. Meta requires a parameter_name on each parameter
//                   object for these — sending positional params to a
//                   named-placeholder template fails outright.
const ORDER_TEMPLATES = {
  // order_confirmed as currently approved in Meta is a structured Order
  // Details template (header product card + "Review and Pay" button),
  // still under the Marketing category rather than Utility — not a plain
  // body-text template this code can populate correctly. No entry here
  // means notifyCustomer logs a warning and no-ops for 'accepted' rather
  // than sending something malformed. Recreate as a plain Utility text
  // template (like the other four) to restore this notification.
  ready: {
    name: 'order_ready',
    language: 'en_US',
    mode: 'positional',
    tail: () => [nextStep()],
  },
  completed: {
    name: 'order_completed',
    language: 'en_US',
    mode: 'named',
    params: (order, customerName, shopName) => ({
      customer_name: customerName,
      order_number: order.order_number,
      shop_name: shopName,
      total: fmtMoney(order.total_amount, order.currency_code),
    }),
  },
  rejected: {
    name: 'order_rejected',
    language: 'en_US',
    mode: 'named',
    params: (order, customerName, shopName) => ({
      customer_name: customerName,
      order_number: order.order_number,
      shop_name: shopName,
      reason: order.rejection_reason || 'Not specified',
    }),
  },
  cancelled: {
    // Registered in Meta as cancellation_confirmation, not order_cancelled
    // — matches what was actually submitted/approved, not the original
    // placeholder name this code was written against.
    name: 'cancellation_confirmation',
    language: 'en_US',
    mode: 'named',
    params: (order, customerName, shopName) => ({
      customer_name: customerName,
      order_number: order.order_number,
      shop_name: shopName,
      reason: order.cancellation_reason || 'Not specified',
    }),
  },
};

function getTemplate(status) {
  return ORDER_TEMPLATES[status] || null;
}

module.exports = { ORDER_TEMPLATES, getTemplate };
