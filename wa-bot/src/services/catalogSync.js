const logger = require('../utils/logger');
const config = require('../config');
const { getSupabase } = require('./shopResolver');

// Deliberately NOT added to config.js's requiredEnv — Meta Commerce
// Catalog setup (creating the catalog, enabling cart, confirming token
// scope) is a real-world prerequisite that hasn't happened yet as of
// writing this. Making it a hard boot requirement would crash-loop the
// whole bot the moment this code deploys, for a feature nobody has
// finished setting up on Meta's side yet. Sync just fails clearly at
// call time instead if it's missing.
//
// NOTE: whether config.whatsappToken's permissions actually cover the
// Catalog API is unverified — if catalog pushes fail with a permissions
// error, a separate catalog-scoped token may be needed from Meta
// Business Settings (set META_CATALOG_ACCESS_TOKEN to override).
function getCatalogConfig() {
  const catalogId = process.env.META_CATALOG_ID;
  const accessToken = process.env.META_CATALOG_ACCESS_TOKEN || config.whatsappToken;

  if (!catalogId) {
    return { error: 'META_CATALOG_ID is not set — create/link a Meta Commerce Catalog first.' };
  }

  return { catalogId, accessToken };
}

/**
 * Pushes a shop's active products to the Meta Commerce Catalog, one-way,
 * on demand (not automatic on every product edit — see plan). Uses each
 * product's own id as the catalog `retailer_id`, so an incoming WhatsApp
 * cart submission maps straight back to a products row with no separate
 * mapping table.
 */
async function syncShopCatalog(shopId) {
  const { catalogId, accessToken, error: configError } = getCatalogConfig();
  if (configError) {
    logger.error({ shopId }, configError);
    return { success: false, error: configError };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .select('name, currency_code')
    .eq('id', shopId)
    .single();

  if (shopError) {
    logger.error({ error: shopError, shopId }, 'Failed to load shop for catalog sync');
    return { success: false, error: 'Failed to load shop' };
  }

  // The catalog's required `link` field needs somewhere for a tap to go.
  // There's no storefront, so it's a wa.me deep link back to this shop's
  // own WhatsApp number — without one connected there's nothing valid to
  // put there, so treat it as a hard prerequisite rather than guessing.
  const { data: connection, error: connectionError } = await supabase
    .from('whatsapp_connections')
    .select('display_phone_number')
    .eq('shop_id', shopId)
    .maybeSingle();

  if (connectionError) {
    logger.error({ error: connectionError, shopId }, 'Failed to load WhatsApp connection for catalog sync');
    return { success: false, error: 'Failed to load WhatsApp connection' };
  }

  const displayPhone = connection?.display_phone_number?.replace(/[^0-9]/g, '');
  if (!displayPhone) {
    return {
      success: false,
      error: 'No WhatsApp display phone number connected for this shop — connect WhatsApp before syncing the catalog.',
    };
  }

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, description, price, image_url, is_available')
    .eq('shop_id', shopId);

  if (error) {
    logger.error({ error, shopId }, 'Failed to load products for catalog sync');
    return { success: false, error: 'Failed to load products' };
  }

  if (!products || products.length === 0) {
    return { success: true, synced: 0 };
  }

  const currencyCode = shop.currency_code || 'INR';

  // image_link is a required items_batch field — products.image_url is a
  // free-typed field on the dashboard and often empty. Pushing an item
  // without one would just get that single item rejected by Meta, so
  // skip it up front and report it instead of finding out from a
  // per-item validation error buried in the batch response.
  const withImage = products.filter((p) => p.image_url);
  const missingImage = products.filter((p) => !p.image_url);

  if (missingImage.length > 0) {
    logger.warn(
      { shopId, count: missingImage.length, productIds: missingImage.map((p) => p.id) },
      'Skipping products with no image_url — required by items_batch'
    );
  }

  if (withImage.length === 0) {
    return { success: true, synced: 0, skipped: missingImage.map((p) => p.id) };
  }

  const requests = withImage.map((product) => ({
    method: 'UPDATE',
    retailer_id: product.id,
    data: {
      name: product.name,
      description: product.description || product.name,
      // Meta's items_batch price format is a single string: "<amount> <ISO currency>"
      // (e.g. "9.99 USD") — not minor units, and there's no separate currency field.
      price: `${Number(product.price).toFixed(2)} ${currencyCode}`,
      availability: product.is_available ? 'in stock' : 'out of stock',
      condition: 'new',
      image_link: product.image_url,
      // Required `link` field — no storefront exists, so this deep-links
      // back into a chat with the shop's own WhatsApp number instead.
      link: `https://wa.me/${displayPhone}?text=${encodeURIComponent(`Hi! I'm interested in ${product.name}`)}`,
      // Required field with no source in our schema today — products
      // aren't branded goods with a per-item manufacturer on file, so
      // the shop's own name is the closest honest value.
      brand: shop.name || 'Groovia',
    },
  }));

  try {
    const res = await fetch(
      `https://graph.facebook.com/${config.graphApiVersion}/${catalogId}/items_batch`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ requests }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      logger.error({ shopId, error: data }, 'Catalog sync request failed');
      return { success: false, error: data?.error?.message || 'Catalog sync failed' };
    }

    logger.info({ shopId, count: withImage.length }, 'Catalog synced to Meta');
    return { success: true, synced: withImage.length, skipped: missingImage.map((p) => p.id) };
  } catch (err) {
    logger.error({ err, shopId }, 'Catalog sync error');
    return { success: false, error: err.message };
  }
}

module.exports = { syncShopCatalog };
