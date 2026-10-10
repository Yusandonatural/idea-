import test from 'node:test';
import assert from 'node:assert/strict';
import { available, costBreakdown, costRate, explode, indexBom, movingAverage, rollupCost, wouldCycle } from '../public/core.js';

// ほうじ茶ティーバッグ 2g×10P：ほうじ茶 20g・ティーバッグ 10枚・袋 1枚
// ギフト：ティーバッグ商品 2つ・缶 2つ・箱 1つ
const items = new Map([
  [1, { id: 1, name: 'ほうじ茶TB 10P', make_on_order: 1, qty: 0, unit_cost: 0 }],
  [2, { id: 2, name: 'ほうじ茶（仕上げ）', make_on_order: 0, qty: 500, unit_cost: 8 }],
  [3, { id: 3, name: 'ティーバッグ', make_on_order: 0, qty: 95, unit_cost: 3 }],
  [4, { id: 4, name: '袋', make_on_order: 0, qty: 30, unit_cost: 20 }],
  [5, { id: 5, name: 'ギフト', make_on_order: 1, qty: 0, unit_cost: 0 }],
  [6, { id: 6, name: '缶', make_on_order: 0, qty: 7, unit_cost: 150 }],
  [7, { id: 7, name: '作り置き品', make_on_order: 0, qty: 4.5, unit_cost: 100 }],
]);
const bom = [
  { parent_id: 1, child_id: 2, qty: 20 }, { parent_id: 1, child_id: 3, qty: 10 }, { parent_id: 1, child_id: 4, qty: 1 },
  { parent_id: 5, child_id: 1, qty: 2 }, { parent_id: 5, child_id: 6, qty: 2 },
];
const byParent = indexBom(bom);

test('作り置きしない製品は、売れたら構成品（中身・ティーバッグ・袋）まで分解して引く', () => {
  assert.deepEqual([...explode(1, 3, items, byParent)], [[2, 60], [3, 30], [4, 3]]);
  // ギフトは中の製品をさらに分解する
  assert.deepEqual([...explode(5, 1, items, byParent)], [[2, 40], [3, 20], [4, 2], [6, 2]]);
  // 作り置きの品目はそのまま引く
  assert.deepEqual([...explode(7, 2, items, byParent)], [[7, 2]]);
});

test('作れる数は、いちばん足りない構成品で決まる', () => {
  assert.equal(available(1, items, byParent), 9); // ティーバッグ 95枚 ÷ 10
  assert.equal(available(5, items, byParent), 3); // 缶 7 ÷ 2
  assert.equal(available(7, items, byParent), 4);
});

test('原価は構成品から積み上げる', () => {
  assert.equal(rollupCost(1, items, byParent), 20 * 8 + 10 * 3 + 20);
  assert.equal(rollupCost(5, items, byParent), 2 * 210 + 2 * 150);
});

test('循環する構成を見つける', () => {
  assert.equal(wouldCycle(1, 5, byParent), true); // ギフトの中にTBがいるので、TBにギフトは入れられない
  assert.equal(wouldCycle(5, 6, byParent), false);
});

test('移動平均の単価', () => {
  assert.equal(movingAverage(100, 10, 100, 20), 15);
  assert.equal(movingAverage(-5, 10, 10, 20), 20); // マイナス在庫は0として扱う
  assert.equal(movingAverage(10, 10, 5, null), 10);
});

test('原価計算：中身（茶葉）＋資材（袋）＋加工費など（袋詰費用・保管料）を足す', () => {
  // 煎茶40g：煎茶リーフ 0.04kg（加工費だけで 1,820円/kg）・袋 30.5円・シール代 11・袋詰 30・保管 15
  const it = new Map([
    [1, { id: 1, kind: 'product', unit_cost: 0, cost_extras: JSON.stringify([{ label: 'シール代', amount: 11 }, { label: '袋詰費用', amount: 30 }, { label: '保管料', amount: 15 }]) }],
    [2, { id: 2, kind: 'semi', unit: 'kg', unit_cost: 1700, cost_extras: JSON.stringify([{ label: '加工賃', amount: 1320 }, { label: '労務費', amount: 300 }, { label: '保管料', amount: 100 }, { label: 'その他', amount: 100 }]) }],
    [3, { id: 3, kind: 'supply', unit: '枚', unit_cost: 30.5 }],
  ]);
  const bp = indexBom([{ parent_id: 1, child_id: 2, qty: 0.04 }, { parent_id: 1, child_id: 3, qty: 1 }]);
  const b = costBreakdown(1, it, bp);
  assert.equal(b.contents, 72.8); // 標準原価 1,820円/kg を使う（在庫単価の 1,700 ではなく）
  assert.equal(b.supplies, 30.5);
  assert.equal(b.labor, 56);
  assert.equal(b.total, 159.3);
  assert.equal(Math.round(costRate(b.total, 500) * 1000) / 10, 31.9);
  assert.equal(costRate(100, null), null);
  // 構成も加工費もない品目は在庫単価
  assert.deepEqual([costBreakdown(3, it, bp).standard, costBreakdown(3, it, bp).total], [false, 30.5]);
});
