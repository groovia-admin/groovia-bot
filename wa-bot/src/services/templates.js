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

function fmtMoney(amount, currencyCode) {
  const value = Number(amount ?? 0).toFixed(2);
  return currencyCode === 'INR' ? `₹${value}` : `${currencyCode ?? ''} ${value}`.trim();
}

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
  // Replaces the old order_confirmed (a structured Order Details
  // template under the wrong category that was never usable — see the
  // v2 build brief). order_confirm is a plain Utility text template,
  // confirmed against its actual approved body:
  //   "Hi {{1}}, Your *{{2}}* order has been successfully placed at
  //    *{{3}}*. The selected time slot is *{{4}}*. We'll notify you
  //    the moment it's ready.😇"
  // 4 numbered variables, same base convention as everywhere else
  // (customerName, orderNumber, shopName) plus the pickup slot as tail.
  // Wired to 'accepted' per the v2 build brief's own Phase 7 flow
  // (ACCEPT -> order_confirm + receipt) — the receipt half isn't built
  // yet (a later phase), this is just the text notification.
  accepted: {
    name: 'order_confirm',
    language: 'en_US',
    mode: 'positional',
    tail: (order) => [fmtSlot(order)],
  },
  // order_ready's approved body has only 3 variables total — customer
  // name, order number, pickup location — with no room for a separate
  // "next step" value (confirmed against the actual approved text:
  // "...ready for pickup at {{3}}. Please shocase your order number for
  // smooth pickup. See you soon!" — that instruction is static body
  // text, not a variable). Sending the previous 4th value (nextStep())
  // caused every real send to fail with (#132000) "number of params
  // does not match". tail() returning [] yields exactly the 3 base
  // values [customerName, orderNumber, shopName] the template expects,
  // using shopName for the pickup-location slot — the same value every
  // other template already uses for "which shop", and the only
  // shop-identifying string already available here (no shops.address
  // column exists in this schema).
  ready: {
    name: 'order_ready',
    language: 'en_US',
    mode: 'positional',
    tail: () => [],
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
