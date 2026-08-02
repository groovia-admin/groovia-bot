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

  const requests = products.map((product) => ({
    method: 'UPDATE',
    retailer_id: product.id,
    data: {
      name: product.name,
      description: product.description || product.name,
      price: Math.round(Number(product.price) * 100), // Meta expects minor units
      currency: 'INR',
      availability: product.is_available ? 'in stock' : 'out of stock',
      condition: 'new',
      image_link: product.image_url || undefined,
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

    logger.info({ shopId, count: products.length }, 'Catalog synced to Meta');
    return { success: true, synced: products.length };
  } catch (err) {
    logger.error({ err, shopId }, 'Catalog sync error');
    return { success: false, error: err.message };
  }
}

module.exports = { syncShopCatalog };
