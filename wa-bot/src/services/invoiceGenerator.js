const PDFDocument = require('pdfkit');

// NOT templates.js's fmtMoney: that one writes a literal "₹" (U+20B9),
// which renders fine in a WhatsApp text message (UTF-8 native) but comes
// out as a garbled superscript glyph here — confirmed against a real
// generated PDF. pdfkit's built-in Helvetica is one of the 14 standard
// PDF fonts, restricted to WinAnsiEncoding (~Latin-1), which has no
// Rupee-sign codepoint. Embedding a Unicode TTF just to render one symbol
// is more than this needs — "Rs." reads unambiguously and is what the
// existing text receipt's audience already expects on a printed slip.
function fmtMoneyForPdf(amount, currencyCode) {
  const value = Number(amount ?? 0).toFixed(2);
  return currencyCode === 'INR' ? `Rs. ${value}` : `${currencyCode ?? ''} ${value}`.trim();
}

// Table column x-positions (points from the page's left margin) — pdfkit
// has no built-in table primitive, and pulling in a second dependency just
// for a 4-column item list would be more than this needs.
const COL_ITEM_X = 50;
const COL_QTY_X = 320;
const COL_UNIT_PRICE_X = 380;
const COL_AMOUNT_X = 460;
const PAGE_RIGHT_EDGE = 545;

function drawRow(doc, y, item, qty, unitPrice, amount, { bold = false } = {}) {
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
  doc.text(item, COL_ITEM_X, y, { width: COL_QTY_X - COL_ITEM_X - 10 });
  doc.text(qty, COL_QTY_X, y, { width: COL_UNIT_PRICE_X - COL_QTY_X - 10, align: 'right' });
  doc.text(unitPrice, COL_UNIT_PRICE_X, y, { width: COL_AMOUNT_X - COL_UNIT_PRICE_X - 10, align: 'right' });
  doc.text(amount, COL_AMOUNT_X, y, { width: PAGE_RIGHT_EDGE - COL_AMOUNT_X, align: 'right' });
}

/**
 * Renders a text invoice PDF for one order into an in-memory Buffer —
 * never touches disk, so there's nothing to clean up before/after handing
 * it off to the WhatsApp Media API upload or the dashboard download
 * route, both of which just want bytes.
 *
 * `items` is passed in separately from `order` (rather than read off
 * order.order_items) so callers control exactly which snapshot this
 * reflects — on order completion that's always the *current* order_items,
 * i.e. after any staff edits, which is the whole point of generating this
 * at completion time rather than at order-creation time.
 */
function generateInvoicePdfBuffer({ shop, order, items, currencyCode }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(20).text(shop.name || 'Invoice', { align: 'left' });

    const addressLine1 = [shop.address_line_1, shop.address_line_2].filter(Boolean).join(', ');
    const addressLine2 = [shop.city, shop.state].filter(Boolean).join(', ') + (shop.postal_code ? ` ${shop.postal_code}` : '');

    doc.font('Helvetica').fontSize(10).fillColor('#555555');
    if (addressLine1) doc.text(addressLine1);
    if (addressLine2.trim()) doc.text(addressLine2.trim());
    if (shop.displayPhone) doc.text(`Phone: ${shop.displayPhone}`);

    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#000000').text('INVOICE', { align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor('#555555');
    doc.text(`Order: ${order.order_number}`, { align: 'right' });
    doc.text(
      `Completed: ${new Date(order.completed_at || Date.now()).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`,
      { align: 'right' }
    );
    if (order.customerName) doc.text(`Customer: ${order.customerName}`, { align: 'right' });

    doc.moveDown(1.5);
    const tableTop = doc.y;
    doc.font('Helvetica-Bold').fillColor('#000000');
    drawRow(doc, tableTop, 'Item', 'Qty', 'Unit price', 'Amount', { bold: true });
    doc.moveTo(COL_ITEM_X, tableTop + 16).lineTo(PAGE_RIGHT_EDGE, tableTop + 16).strokeColor('#DDDDDD').stroke();

    let y = tableTop + 24;
    doc.fillColor('#000000');
    for (const item of items) {
      drawRow(
        doc,
        y,
        `${item.product_name_snapshot}${item.unit_snapshot ? ` (${item.unit_snapshot})` : ''}`,
        String(item.quantity),
        fmtMoneyForPdf(item.unit_price, currencyCode),
        fmtMoneyForPdf(item.subtotal, currencyCode)
      );
      y += 20;
    }

    doc.moveTo(COL_ITEM_X, y + 4).lineTo(PAGE_RIGHT_EDGE, y + 4).strokeColor('#DDDDDD').stroke();
    y += 14;

    const totalsRow = (label, amount, { bold = false } = {}) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10);
      doc.text(label, COL_UNIT_PRICE_X, y, { width: COL_AMOUNT_X - COL_UNIT_PRICE_X - 10, align: 'right' });
      doc.text(amount, COL_AMOUNT_X, y, { width: PAGE_RIGHT_EDGE - COL_AMOUNT_X, align: 'right' });
      y += bold ? 20 : 16;
    };

    totalsRow('Subtotal', fmtMoneyForPdf(order.subtotal, currencyCode));
    if (Number(order.delivery_fee) > 0) totalsRow('Delivery fee', fmtMoneyForPdf(order.delivery_fee, currencyCode));
    if (Number(order.tax_amount) > 0) totalsRow('Tax', fmtMoneyForPdf(order.tax_amount, currencyCode));
    if (Number(order.discount_amount) > 0) totalsRow('Discount', `-${fmtMoneyForPdf(order.discount_amount, currencyCode)}`);
    totalsRow('Total', fmtMoneyForPdf(order.total_amount, currencyCode), { bold: true });

    doc.moveDown(3);
    doc.font('Helvetica').fontSize(10).fillColor('#555555').text(`Thank you for shopping with ${shop.name}!`, {
      align: 'center',
    });

    doc.end();
  });
}

module.exports = { generateInvoicePdfBuffer };
