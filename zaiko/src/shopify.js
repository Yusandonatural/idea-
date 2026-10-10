// Shopify との連携：商品の取り込み・注文の取り込み（在庫を引く）・在庫数の反映
import { decryptJSON, encryptJSON, getKeys } from './crypto.js';
import { getSetting, InputError, loadGraph, now, postSale, putSetting, returnBatch } from './inventory.js';
import { available } from '../public/core.js';

const VERSION = '2026-10';
const MAX_PAGES = 20; // 1回の取り込みで最大 1,000 件

export const shopHost = (s) => String(s || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();

export async function loadCreds(env) {
  const enc = await getSetting(env, 'shopify');
  if (!enc) return null;
  const { aes } = await getKeys(env.APP_SECRET);
  return decryptJSON(aes, enc);
}

export async function saveCreds(env, creds) {
  const { aes } = await getKeys(env.APP_SECRET);
  await putSetting(env, 'shopify', await encryptJSON(aes, creds));
}

// アクセストークン：管理画面のカスタムアプリ（shpat_…）か、Dev Dashboard のアプリ（クライアントID＋シークレット）
async function token(env, c) {
  if (c.access_token) return c.access_token;
  const cached = await getSetting(env, 'shopify_token');
  if (cached && cached.exp > now() + 60_000) return cached.token;
  const res = await fetch(`https://${shopHost(c.shop)}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: c.client_id, client_secret: c.client_secret }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`アクセストークンを取得できませんでした（${res.status}${data.error_description ? '：' + data.error_description : ''}）`);
  await putSetting(env, 'shopify_token', { token: data.access_token, exp: now() + (Number(data.expires_in) || 3600) * 1000 });
  return data.access_token;
}

export async function gql(env, c, query, variables) {
  const res = await fetch(`https://${shopHost(c.shop)}/admin/api/${VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-shopify-access-token': await token(env, c) },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Shopify ${res.status}：${data.errors ? JSON.stringify(data.errors) : res.statusText}`);
  if (data.errors?.length) throw new Error(data.errors.map((e) => e.message).join(' / '));
  return data.data;
}

const CHECK = `query Check { shop { name myshopifyDomain } locations(first: 20) { nodes { id name isActive fulfillsOnlineOrders } } }`;

// 接続を確かめ、ロケーション一覧を返す
export async function verify(env, c) {
  const d = await gql(env, c, CHECK);
  return { shop: d.shop.name, domain: d.shop.myshopifyDomain, locations: d.locations.nodes.filter((l) => l.isActive) };
}

async function requireCreds(env) {
  const c = await loadCreds(env);
  if (!c) throw new InputError('Shopify がまだつながっていません。「Shopify」タブで接続してください');
  return c;
}

const VARIANTS = `query Variants($first: Int!, $after: String) { productVariants(first: $first, after: $after) {
  pageInfo { hasNextPage endCursor }
  nodes { id title sku price product { title status } inventoryItem { id tracked unitCost { amount } } } } }`;

export const variantName = (v) => (v.title && v.title !== 'Default Title' ? `${v.product.title}／${v.title}` : v.product.title);

// Shopify の商品（バリエーション）を品目として取り込む。取り込み済みは名前・SKUだけ合わせる
export async function importProducts(env) {
  const c = await requireCreds(env);
  const variants = [];
  let after = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const d = await gql(env, c, VARIANTS, { first: 100, after });
    variants.push(...d.productVariants.nodes);
    if (!d.productVariants.pageInfo.hasNextPage) break;
    after = d.productVariants.pageInfo.endCursor;
  }
  const { results } = await env.DB.prepare('SELECT id, shopify_variant_id FROM items WHERE shopify_variant_id IS NOT NULL').all();
  const linked = new Map(results.map((r) => [r.shopify_variant_id, r.id]));
  const t = now();
  const stmts = [];
  let added = 0;
  let updated = 0;
  for (const v of variants) {
    if (v.product.status === 'ARCHIVED') continue;
    const name = variantName(v).slice(0, 120);
    if (linked.has(v.id)) {
      stmts.push(env.DB.prepare('UPDATE items SET shopify_inventory_item_id = ?, sku = COALESCE(sku, ?) WHERE id = ?').bind(v.inventoryItem?.id ?? null, v.sku || null, linked.get(v.id)));
      updated++;
      continue;
    }
    // 作り置きしない（売れたら構成品から引く）を初期値にする。構成を入れるまでは製品そのものから引く
    stmts.push(env.DB.prepare(`INSERT INTO items (name, kind, unit, unit_cost, make_on_order, sku, shopify_variant_id, shopify_inventory_item_id, created_at, updated_at)
      VALUES (?, 'product', '個', ?, 1, ?, ?, ?, ?, ?)`).bind(name, Number(v.inventoryItem?.unitCost?.amount) || 0, v.sku || null, v.id, v.inventoryItem?.id ?? null, t, t));
    added++;
  }
  if (stmts.length) await env.DB.batch(stmts);
  return { added, updated, total: variants.length };
}

const ORDERS = `query Orders($first: Int!, $after: String, $q: String) { orders(first: $first, after: $after, query: $q, sortKey: UPDATED_AT) {
  pageInfo { hasNextPage endCursor }
  nodes { id name createdAt updatedAt cancelledAt test lineItems(first: 100) { nodes { id quantity sku name variant { id } } } } } }`;

// 注文を取り込んで在庫を引く。キャンセルされた注文は戻す。同じ注文は二度引かない
export async function syncOrders(env) {
  const c = await requireCreds(env);
  let since = await getSetting(env, 'orders_since');
  if (!since) {
    since = new Date().toISOString();
    await putSetting(env, 'orders_since', since);
  }
  // 少し重ねて取り、取りこぼしを防ぐ（重なった分は shopify_orders で弾く）
  const from = new Date(Date.parse(since) - 5 * 60_000).toISOString();
  const { results } = await env.DB.prepare('SELECT id, shopify_variant_id FROM items WHERE shopify_variant_id IS NOT NULL').all();
  const byVariant = new Map(results.map((r) => [r.shopify_variant_id, r.id]));
  let after = null;
  let latest = since;
  const stats = { orders: 0, sold: 0, cancelled: 0, unmapped: 0 };
  for (let i = 0; i < MAX_PAGES; i++) {
    const d = await gql(env, c, ORDERS, { first: 50, after, q: `updated_at:>='${from}'` });
    for (const o of d.orders.nodes) {
      if (o.updatedAt > latest) latest = o.updatedAt;
      if (o.test) continue;
      const r = await handleOrder(env, o, byVariant);
      if (r) {
        stats[r.type]++;
        stats.unmapped += r.unmapped || 0;
      }
    }
    if (!d.orders.pageInfo.hasNextPage) break;
    after = d.orders.pageInfo.endCursor;
  }
  await putSetting(env, 'orders_since', latest);
  stats.orders = stats.sold + stats.cancelled;
  return stats;
}

async function handleOrder(env, o, byVariant) {
  const seen = await env.DB.prepare('SELECT * FROM shopify_orders WHERE order_id = ?').bind(o.id).first();
  const at = Date.parse(o.createdAt);
  if (!seen) {
    const sold = [];
    const unmapped = [];
    for (const li of o.lineItems.nodes) {
      const itemId = li.variant && byVariant.get(li.variant.id);
      if (itemId) sold.push({ item_id: itemId, qty: li.quantity });
      else if (li.quantity > 0) unmapped.push({ variant_id: li.variant?.id ?? null, name: li.name, sku: li.sku, qty: li.quantity });
    }
    // 先に「取り込んだ」と書いてから在庫を引く（途中で止まっても二重には引かない）
    const claim = await env.DB.prepare('INSERT OR IGNORE INTO shopify_orders (order_id, name, unmapped, created_at) VALUES (?, ?, ?, ?)')
      .bind(o.id, o.name, unmapped.length ? JSON.stringify(unmapped) : null, now()).run();
    if (!claim.meta.changes) return null;
    if (o.cancelledAt || !sold.length) return { type: o.cancelledAt ? 'cancelled' : 'sold', unmapped: unmapped.length };
    const batchId = await postSale(env, { at, ref: o.name, note: 'Shopify 注文' }, sold);
    await env.DB.prepare('UPDATE shopify_orders SET batch_id = ? WHERE order_id = ?').bind(batchId, o.id).run();
    return { type: 'sold', unmapped: unmapped.length };
  }
  if (o.cancelledAt && seen.batch_id && !seen.cancel_batch_id) {
    const claim = await env.DB.prepare('UPDATE shopify_orders SET cancel_batch_id = -1 WHERE order_id = ? AND cancel_batch_id IS NULL').bind(o.id).run();
    if (!claim.meta.changes) return null;
    const id = await returnBatch(env, seen.batch_id, { kind: 'cancel', at: Date.parse(o.cancelledAt), ref: o.name, note: 'Shopify 注文のキャンセル', user: 'Shopify' });
    await env.DB.prepare('UPDATE shopify_orders SET cancel_batch_id = ? WHERE order_id = ?').bind(id ?? -1, o.id).run();
    return { type: 'cancelled' };
  }
  return null;
}

// 品目に結びついていない注文明細（直近）を、バリエーションごとにまとめる
export async function unmappedLines(env) {
  const { results } = await env.DB.prepare('SELECT name AS order_name, unmapped FROM shopify_orders WHERE unmapped IS NOT NULL ORDER BY created_at DESC LIMIT 300').all();
  const linked = new Set((await env.DB.prepare('SELECT shopify_variant_id FROM items WHERE shopify_variant_id IS NOT NULL').all()).results.map((r) => r.shopify_variant_id));
  const m = new Map();
  for (const r of results) {
    for (const u of JSON.parse(r.unmapped)) {
      if (u.variant_id && linked.has(u.variant_id)) continue;
      const k = u.variant_id || `name:${u.name}`;
      const cur = m.get(k) || { variant_id: u.variant_id, name: u.name, sku: u.sku, qty: 0, orders: [] };
      cur.qty += u.qty;
      if (cur.orders.length < 5) cur.orders.push(r.order_name);
      m.set(k, cur);
    }
  }
  return [...m.values()];
}

// 2026-04 以降は @idempotent のキーが必須
const SET = `mutation Set($input: InventorySetQuantitiesInput!, $key: String!) { inventorySetQuantities(input: $input) @idempotent(key: $key) { inventoryAdjustmentGroup { id } userErrors { field message code } } }`;
const TRACK = `mutation Track($id: ID!, $locationId: ID!) { inventoryItemUpdate(id: $id, input: { tracked: true }) { userErrors { field message } } inventoryActivate(inventoryItemId: $id, locationId: $locationId) { userErrors { field message } } }`;

// 「Shopifyに反映」にした品目の在庫数（作り置きしない品目は作れる数）を Shopify に送る。変わった分だけ
export async function pushInventory(env, { force = false } = {}) {
  const c = await requireCreds(env);
  const locationId = await getSetting(env, 'location_id');
  if (!locationId) throw new InputError('在庫を反映するロケーションを「Shopify」タブで選んでください');
  const g = await loadGraph(env);
  const targets = g.rows
    .filter((r) => r.push_to_shopify && r.shopify_inventory_item_id && !r.archived)
    .map((r) => ({ r, q: available(r.id, g.items, g.byParent) }))
    .filter(({ r, q }) => force || r.pushed_qty !== q);
  const errors = [];
  let pushed = 0;
  for (const { r } of targets.filter(({ r }) => r.pushed_qty == null)) {
    // はじめて送る品目は、Shopify で在庫を追跡する設定にしてロケーションに置く
    const d = await gql(env, c, TRACK, { id: r.shopify_inventory_item_id, locationId });
    const errs = [...d.inventoryItemUpdate.userErrors, ...d.inventoryActivate.userErrors];
    if (errs.length) errors.push(`${r.name}：${errs.map((e) => e.message).join(' / ')}`);
  }
  for (let i = 0; i < targets.length; i += 100) {
    const chunk = targets.slice(i, i + 100);
    const d = await gql(env, c, SET, {
      key: crypto.randomUUID(),
      input: {
        name: 'available',
        reason: 'correction',
        referenceDocumentUri: 'zaiko://sync',
        quantities: chunk.map(({ r, q }) => ({ inventoryItemId: r.shopify_inventory_item_id, locationId, quantity: q, changeFromQuantity: null })),
      },
    });
    const errs = d.inventorySetQuantities.userErrors;
    if (errs.length) {
      errors.push(...errs.map((e) => e.message));
      continue;
    }
    await env.DB.batch(chunk.map(({ r, q }) => env.DB.prepare('UPDATE items SET pushed_qty = ? WHERE id = ?').bind(q, r.id)));
    pushed += chunk.length;
  }
  return { pushed, checked: targets.length, errors };
}

// cron：注文の取り込み → 在庫の反映。結果は settings に残して画面で見せる
export async function runSync(env) {
  if (!(await loadCreds(env))) return null;
  const log = { at: now() };
  try {
    log.orders = await syncOrders(env);
    if (await getSetting(env, 'location_id')) log.push = await pushInventory(env);
  } catch (e) {
    log.error = e.message;
  }
  await putSetting(env, 'last_sync', log);
  return log;
}
