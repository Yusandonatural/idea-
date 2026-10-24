import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1, stubFetch } from './d1.js';
import { putSetting } from '../src/inventory.js';
import { importProducts, pushInventory, saveCreds, syncOrders, unmappedLines } from '../src/shopify.js';

const V = (n) => `gid://shopify/ProductVariant/${n}`;

async function setup() {
  const env = { DB: fakeD1(), APP_SECRET: 'test-secret-test-secret' };
  await saveCreds(env, { shop: 'yusando.myshopify.com', access_token: 'shpat_x' });
  await putSetting(env, 'orders_since', '2026-10-01T00:00:00Z');
  await putSetting(env, 'location_id', 'gid://shopify/Location/1');
  const add = async (name, extra = {}) =>
    (await env.DB.prepare(`INSERT INTO items (name, kind, unit, qty, make_on_order, shopify_variant_id, shopify_inventory_item_id, push_to_shopify, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0) RETURNING id`)
      .bind(name, extra.kind ?? 'supply', extra.unit ?? '個', extra.qty ?? 0, extra.make_on_order ?? 0, extra.variant ?? null, extra.inv ?? null, extra.push ?? 0).first()).id;
  const tea = await add('ほうじ茶（仕上げ）', { kind: 'semi', unit: 'g', qty: 1000 });
  const tb = await add('ティーバッグ', { qty: 300 });
  const bag = await add('袋', { qty: 40 });
  const prod = await add('ほうじ茶TB 10P', { kind: 'product', make_on_order: 1, variant: V(1), inv: 'gid://shopify/InventoryItem/1', push: 1 });
  await env.DB.batch([[prod, tea, 20], [prod, tb, 10], [prod, bag, 1]].map(([p, c, q]) =>
    env.DB.prepare('INSERT INTO bom (parent_id, child_id, qty) VALUES (?, ?, ?)').bind(p, c, q)));
  return { env, tea, tb, bag, prod };
}

const order = (id, lines, extra = {}) => ({
  id: `gid://shopify/Order/${id}`, name: `#${id}`, createdAt: '2026-10-05T01:00:00Z', updatedAt: extra.updatedAt ?? '2026-10-05T01:00:00Z',
  cancelledAt: extra.cancelledAt ?? null, test: false,
  lineItems: { nodes: lines.map(([v, q, name], i) => ({ id: `li${id}-${i}`, quantity: q, sku: null, name: name ?? 'x', variant: v ? { id: v } : null })) },
});
const ordersReply = (nodes) => ({ data: { orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } });
const qty = async (env, id) => (await env.DB.prepare('SELECT qty FROM items WHERE id = ?').bind(id).first()).qty;

test('Shopify の注文を取り込むと、構成品（中身・ティーバッグ・袋）が減る。二度は引かない', async () => {
  const { env, tea, tb, bag } = await setup();
  const nodes = [order(1001, [[V(1), 3], [V(999), 1, '未登録の商品']])];
  const f = stubFetch([['graphql.json', () => ordersReply(nodes)]]);
  try {
    const r = await syncOrders(env);
    assert.deepEqual(r, { orders: 1, sold: 1, cancelled: 0, unmapped: 1 });
    assert.equal(await qty(env, tea), 940);
    assert.equal(await qty(env, tb), 270);
    assert.equal(await qty(env, bag), 37);
    await syncOrders(env);
    assert.equal(await qty(env, tea), 940);
    const un = await unmappedLines(env);
    assert.deepEqual(un.map((u) => [u.name, u.qty]), [['未登録の商品', 1]]);
    // キャンセルされたら戻す（1回だけ）
    nodes[0] = order(1001, [[V(1), 3]], { cancelledAt: '2026-10-06T00:00:00Z', updatedAt: '2026-10-06T00:00:00Z' });
    assert.equal((await syncOrders(env)).cancelled, 1);
    assert.equal(await qty(env, tea), 1000);
    assert.equal((await syncOrders(env)).cancelled, 0);
    assert.equal(await qty(env, bag), 40);
  } finally {
    f.restore();
  }
});

test('作れる数を Shopify に送る。変わっていなければ送らない', async () => {
  const { env } = await setup();
  const sent = [];
  const f = stubFetch([['graphql.json', (u, init) => {
    const b = JSON.parse(init.body);
    sent.push(b);
    if (b.query.includes('Track')) return { data: { inventoryItemUpdate: { userErrors: [] }, inventoryActivate: { userErrors: [] } } };
    return { data: { inventorySetQuantities: { inventoryAdjustmentGroup: { id: 'g' }, userErrors: [] } } };
  }]]);
  try {
    const r = await pushInventory(env);
    assert.deepEqual(r, { pushed: 1, checked: 1, errors: [] });
    const set = sent.find((s) => s.query.includes('inventorySetQuantities'));
    assert.equal(set.variables.input.quantities[0].quantity, 30); // ティーバッグ300枚 ÷ 10、袋40、茶1000g÷20=50 → 30
    assert.ok(set.variables.key);
    assert.ok(sent[0].query.includes('Track')); // はじめは在庫追跡を有効にする
    sent.length = 0;
    assert.equal((await pushInventory(env)).checked, 0);
    assert.equal(sent.length, 0);
  } finally {
    f.restore();
  }
});

test('商品の取り込み：新しいバリエーションは製品として足し、アーカイブ済みは飛ばす', async () => {
  const { env } = await setup();
  const v = (n, title, product, status = 'ACTIVE') => ({ id: V(n), title, sku: `S${n}`, price: '600', product: { title: product, status }, inventoryItem: { id: `gid://shopify/InventoryItem/${n}`, tracked: false, unitCost: { amount: '120' } } });
  const f = stubFetch([['graphql.json', { data: { productVariants: { pageInfo: { hasNextPage: false }, nodes: [
    v(1, 'Default Title', 'ほうじ茶TB 10P'), v(2, '袋入り　30g', '宇治抹茶'), v(3, 'Default Title', '昔の商品', 'ARCHIVED'),
  ] } } }]]);
  try {
    assert.deepEqual(await importProducts(env), { added: 1, updated: 1, total: 3 });
    const row = await env.DB.prepare('SELECT * FROM items WHERE shopify_variant_id = ?').bind(V(2)).first();
    assert.equal(row.name, '宇治抹茶／袋入り　30g');
    assert.equal(row.kind, 'product');
    assert.equal(row.unit_cost, 120);
    assert.equal(row.make_on_order, 1);
  } finally {
    f.restore();
  }
});
