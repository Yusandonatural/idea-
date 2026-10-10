import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './d1.js';
import { listBatches, listItems, postBatch, reverseBatch, valuation } from '../src/inventory.js';
import { endOfDayJst, toCsv } from '../src/index.js';

async function setup() {
  const env = { DB: fakeD1() };
  const add = async (name, kind, unit, extra = {}) =>
    (await env.DB.prepare(`INSERT INTO items (name, kind, unit, unit_cost, make_on_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0) RETURNING id`)
      .bind(name, kind, unit, extra.unit_cost ?? 0, extra.make_on_order ?? 0).first()).id;
  const ara = await add('荒茶', 'semi', 'g', { unit_cost: 5 });
  const hoji = await add('ほうじ茶（仕上げ）', 'semi', 'g');
  const bag = await add('ほうじ茶の袋', 'supply', '枚', { unit_cost: 20 });
  const leaf = await add('鳳次郎ほうじ茶 60g', 'product', '個', { make_on_order: 1 });
  await env.DB.batch([
    env.DB.prepare('INSERT INTO bom (parent_id, child_id, qty) VALUES (?, ?, ?)').bind(hoji, ara, 1.2),
    env.DB.prepare('INSERT INTO bom (parent_id, child_id, qty) VALUES (?, ?, ?)').bind(leaf, hoji, 60),
    env.DB.prepare('INSERT INTO bom (parent_id, child_id, qty) VALUES (?, ?, ?)').bind(leaf, bag, 1),
  ]);
  return { env, ara, hoji, bag, leaf };
}

const qtyOf = async (env, id) => ({ ...(await env.DB.prepare('SELECT qty, unit_cost FROM items WHERE id = ?').bind(id).first()) });

test('入荷すると在庫が増え、単価は移動平均になる', async () => {
  const { env, ara, bag } = await setup();
  await postBatch(env, { kind: 'receive', at: '2026-09-01T10:00:00+09:00', lines: [{ item_id: ara, qty: 10000, unit_cost: 5 }, { item_id: bag, qty: 100, unit_cost: 30 }] }, 'テスト');
  await postBatch(env, { kind: 'receive', lines: [{ item_id: bag, qty: 100, unit_cost: 20 }] }, 'テスト');
  assert.deepEqual(await qtyOf(env, ara), { qty: 10000, unit_cost: 5 });
  assert.deepEqual(await qtyOf(env, bag), { qty: 200, unit_cost: 25 });
});

test('製造：使ったもの（荒茶）が減り、できたもの（仕掛品・半製品）が増え、原価が移る', async () => {
  const { env, ara, hoji } = await setup();
  await postBatch(env, { kind: 'receive', lines: [{ item_id: ara, qty: 12000, unit_cost: 5 }] }, 'テスト');
  await postBatch(env, { kind: 'produce', output_id: hoji, output_qty: 10000, lines: [{ item_id: ara, qty: 12000 }] }, 'テスト');
  assert.deepEqual(await qtyOf(env, ara), { qty: 0, unit_cost: 5 });
  assert.deepEqual(await qtyOf(env, hoji), { qty: 10000, unit_cost: 6 }); // 60,000円 ÷ 10,000g
  await assert.rejects(postBatch(env, { kind: 'produce', output_id: hoji, output_qty: 0, lines: [] }, 'x'), /できた量/);
});

test('棚卸は数えた数との差を記録し、廃棄はマイナスになる。取り消しで元に戻る', async () => {
  const { env, bag } = await setup();
  await postBatch(env, { kind: 'receive', lines: [{ item_id: bag, qty: 100 }] }, 'テスト');
  const c = await postBatch(env, { kind: 'count', lines: [{ item_id: bag, counted: 97 }] }, 'テスト');
  assert.equal((await qtyOf(env, bag)).qty, 97);
  await postBatch(env, { kind: 'waste', lines: [{ item_id: bag, qty: 2 }] }, 'テスト');
  assert.equal((await qtyOf(env, bag)).qty, 95);
  await reverseBatch(env, c.id, 'テスト');
  assert.equal((await qtyOf(env, bag)).qty, 98);
  await assert.rejects(reverseBatch(env, c.id, 'テスト'), /もう取り消し/);
  const list = await listBatches(env, { itemId: bag });
  assert.equal(list.length, 4);
  assert.equal(list[0].label, '調整');
  assert.match(list[2].note, /^取消済/);
});

test('一覧に作れる数と積み上げ原価が出る', async () => {
  const { env, ara, hoji, bag, leaf } = await setup();
  await postBatch(env, { kind: 'receive', lines: [{ item_id: hoji, qty: 650, unit_cost: 6 }, { item_id: bag, qty: 30 }, { item_id: ara, qty: 1 }] }, 'テスト');
  const { items } = await listItems(env);
  const l = items.find((i) => i.id === leaf);
  assert.equal(l.available, 10); // 650g ÷ 60g
  assert.equal(l.rollup_cost, 60 * 6 + 20);
});

test('在庫評価は基準日までの数量で、種類（勘定科目）ごとに合計する', async () => {
  const { env, ara, bag } = await setup();
  await postBatch(env, { kind: 'receive', at: '2026-03-20T10:00:00+09:00', lines: [{ item_id: ara, qty: 1000, unit_cost: 5 }, { item_id: bag, qty: 50, unit_cost: 20 }] }, 'テスト');
  await postBatch(env, { kind: 'receive', at: '2026-04-02T10:00:00+09:00', lines: [{ item_id: bag, qty: 50, unit_cost: 20 }] }, 'テスト');
  const v = await valuation(env, endOfDayJst('2026-03-31'));
  assert.equal(v.totals.semi, 5000);
  assert.equal(v.totals.supply, 1000);
  assert.equal(v.total, 6000);
  assert.equal((await valuation(env, endOfDayJst('2026-04-30'))).totals.supply, 2000);
  assert.equal(endOfDayJst('2026/03/31'), null);
});

test('CSV は Excel で開けるよう BOM 付き・カンマや引用符を囲む', () => {
  assert.equal(toCsv([['a,b', 'c"d', 1]]), '﻿"a,b","c""d",1\r\n');
});
