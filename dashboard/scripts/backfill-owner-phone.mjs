// One-time migration: give existing shop owners (created back when auth
// was email+password) a phone number on their auth.users record so they
// can sign in via phone-OTP like everyone else.
//
// Source of truth for the phone to backfill, in priority order:
//   1. shop_users.phone_number (if already set)
//   2. auth.users.user_metadata.phone_number (set at shop-creation time)
//
// Usage:
//   node scripts/backfill-owner-phone.mjs            # dry run (default, no writes)
//   node scripts/backfill-owner-phone.mjs --apply     # actually perform the updates
//
// Reads Supabase credentials from dashboard/.env.local (NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY) — no extra dependency, just enough parsing for this.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  const contents = readFileSync(envPath, 'utf-8');
  const env = {};

  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }

  return env;
}

const INDIA_PHONE_REGEX = /^[6-9]\d{9}$/;

function normalizeIndianPhone(value) {
  if (!value) return null;
  let digits = String(value).replace(/\D/g, '');

  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }

  if (!INDIA_PHONE_REGEX.test(digits)) return null;

  return `+91${digits}`;
}

async function main() {
  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(APPLY ? '=== APPLY MODE — will write changes ===' : '=== DRY RUN — no changes will be made (pass --apply to write) ===');
  console.log('');

  const { data: owners, error: ownersError } = await supabase
    .from('shop_users')
    .select('id, shop_id, auth_user_id, full_name, phone_number, shops ( name )')
    .eq('role', 'owner');

  if (ownersError) {
    console.error('Failed to load owners:', ownersError);
    process.exit(1);
  }

  let skipped = 0;
  let updated = 0;
  let failed = 0;

  for (const owner of owners ?? []) {
    const shopName = Array.isArray(owner.shops) ? owner.shops[0]?.name : owner.shops?.name;
    const label = `${owner.full_name} (${shopName ?? owner.shop_id})`;

    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(owner.auth_user_id);

    if (authError || !authUser?.user) {
      console.log(`⚠️  ${label}: could not load auth account — ${authError?.message ?? 'not found'}`);
      failed++;
      continue;
    }

    const currentAuthPhone = authUser.user.phone || null;

    const candidatePhone =
      normalizeIndianPhone(owner.phone_number) ??
      normalizeIndianPhone(authUser.user.user_metadata?.phone_number);

    if (!candidatePhone) {
      console.log(`⚠️  ${label}: no usable phone number found (metadata phone: ${authUser.user.user_metadata?.phone_number ?? 'none'}) — skipping`);
      skipped++;
      continue;
    }

    const alreadyMigrated =
      currentAuthPhone === candidatePhone || currentAuthPhone === candidatePhone.replace('+', '');

    if (alreadyMigrated && owner.phone_number) {
      console.log(`✅ ${label}: already migrated (${candidatePhone})`);
      skipped++;
      continue;
    }

    console.log(`${APPLY ? '→' : '(dry run)'} ${label}: set auth phone to ${candidatePhone}${!owner.phone_number ? ' + backfill shop_users.phone_number' : ''}`);

    if (!APPLY) {
      updated++;
      continue;
    }

    if (!alreadyMigrated) {
      const { error: updateAuthError } = await supabase.auth.admin.updateUserById(owner.auth_user_id, {
        phone: candidatePhone,
        phone_confirm: true,
      });

      if (updateAuthError) {
        console.log(`   ❌ failed to update auth phone: ${updateAuthError.message}`);
        failed++;
        continue;
      }
    }

    if (!owner.phone_number) {
      const { error: updateShopUserError } = await supabase
        .from('shop_users')
        .update({ phone_number: candidatePhone })
        .eq('id', owner.id);

      if (updateShopUserError) {
        console.log(`   ❌ failed to update shop_users.phone_number: ${updateShopUserError.message}`);
        failed++;
        continue;
      }
    }

    updated++;
  }

  console.log('');
  console.log(`Done. ${updated} ${APPLY ? 'updated' : 'would update'}, ${skipped} skipped, ${failed} failed. Total owners: ${(owners ?? []).length}`);
}

main();
