const logger = require('../utils/logger');
const config = require('../config');
const { getSupabase } = require('./shopResolver');

// Catalog id is per-shop, not global — each shop has its own WABA and
// therefore its own Commerce Catalog (confirmed design: one catalog per
// WABA). It lives on that shop's whatsapp_connections row, not in an
// env var, since a single Railway env var can't represent "shop A's
// catalog is 123, shop B's is 456". The access token is still global
// for now (config.whatsappToken / META_CATALOG_ACCESS_TOKEN override) —
// that's only wrong if different shops end up on entirely separate
// Meta Business Managers, which hasn't come up yet.
//
// NOTE: whether config.whatsappToken's permissions actually cover the
// Catalog API is unverified — if catalog pushes fail with a permissions
// error, a separate catalog-scoped token may be needed from Meta
// Business Settings (set META_CATALOG_ACCESS_TOKEN to override).

/**
 * Pushes a shop's active products to the Meta Commerce Catalog, one-way,
 * on demand (not automatic on every product edit — see plan). Uses each
 * product's own id as the catalog `retailer_id`, so an incoming WhatsApp
 * cart submission maps straight back to a products row with no separate
 * mapping table.
 */
async function syncShopCatalog(shopId) {
  const accessToken = process.env.META_CATALOG_ACCESS_TOKEN || config.whatsappToken;

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
    .select('display_phone_number, catalog_id')
    .eq('shop_id', shopId)
    .maybeSingle();

  if (connectionError) {
    logger.error({ error: connectionError, shopId }, 'Failed to load WhatsApp connection for catalog sync');
    return { success: false, error: 'Failed to load WhatsApp connection' };
  }

  const catalogId = connection?.catalog_id;
  if (!catalogId) {
    return {
      success: false,
      error: 'No Meta Commerce Catalog id on file for this shop — add it in WhatsApp connection settings first.',
    };
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
    data: {
      // The item identifier for items_batch lives inside `data.id`, not a
      // top-level `retailer_id` sibling field — confirmed against Meta's
      // reference after the (#100) "item_type is required" error surfaced
      // that the request envelope was wrong. This `id` is what Meta calls
      // the retailer_id everywhere else (cart submissions, Commerce
      // Manager) — it's the same value, just nested here.
      id: product.id,
      // The item's display name field is `title`, not `name` — `name` is
      // silently ignored by items_batch (no error), which is why this was
      // showing up blank in Commerce Manager despite a "successful" sync.
      // Max 100 chars per Meta's spec.
      title: product.name.slice(0, 100),
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
        // item_type is a required top-level field, sibling to requests —
        // missing it is exactly what (#100) "item_type is required" means.
        body: JSON.stringify({ item_type: 'PRODUCT_ITEM', requests }),
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
