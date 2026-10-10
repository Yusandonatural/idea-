// 在庫の計算（画面と Worker で共用）

// 品目の種類と、決算の在庫計上で使う勘定科目
export const KINDS = {
  product: { label: '製品', account: '製品', hint: '自分で作って売るもの（Shopifyの商品）' },
  goods: { label: '商品', account: '商品', hint: '仕入れてそのまま売るもの' },
  semi: { label: '半製品', account: '半製品', hint: 'そのままでも売れる途中のもの（仕上げ茶・荒茶など）' },
  wip: { label: '仕掛品', account: '仕掛品', hint: '作業の途中のもの（発酵中・乾燥中など）' },
  material: { label: '原材料', account: '原材料', hint: '生葉・玄米・花など' },
  supply: { label: '資材', account: '貯蔵品', hint: '袋・缶・ティーバッグ・ラベル・箱など' },
};

export const BATCH_KINDS = {
  receive: '入荷',
  produce: '製造',
  sale: '出荷',
  cancel: 'キャンセル戻し',
  count: '棚卸',
  adjust: '調整',
  waste: '廃棄',
};

const MAX_DEPTH = 8;

export function indexBom(bom) {
  const byParent = new Map();
  for (const b of bom) {
    if (!byParent.has(b.parent_id)) byParent.set(b.parent_id, []);
    byParent.get(b.parent_id).push(b);
  }
  return byParent;
}

// 売れたときに減らす品目を求める。作り置きしない品目（make_on_order）は構成品まで分解する
export function explode(itemId, qty, items, byParent, out = new Map(), depth = 0) {
  if (depth > MAX_DEPTH) throw new Error('構成が循環しています');
  const item = items.get(itemId);
  const parts = byParent.get(itemId);
  if (item?.make_on_order && parts?.length) {
    for (const p of parts) explode(p.child_id, qty * p.qty, items, byParent, out, depth + 1);
  } else {
    out.set(itemId, (out.get(itemId) || 0) + qty);
  }
  return out;
}

// いまの在庫で何個出せるか。作り置きしない品目は、構成品の在庫から作れる数
export function available(itemId, items, byParent) {
  const need = explode(itemId, 1, items, byParent);
  let n = Infinity;
  for (const [id, q] of need) {
    if (q <= 0) continue;
    n = Math.min(n, Math.floor(round((items.get(id)?.qty || 0) / q)));
  }
  return n === Infinity ? 0 : Math.max(0, n);
}

// 構成品から積み上げた1単位の原価
export function rollupCost(itemId, items, byParent, depth = 0) {
  if (depth > MAX_DEPTH) throw new Error('構成が循環しています');
  const parts = byParent.get(itemId);
  if (!parts?.length) return items.get(itemId)?.unit_cost || 0;
  return round(parts.reduce((sum, p) => {
    const child = items.get(p.child_id);
    const c = child?.make_on_order && byParent.get(p.child_id)?.length ? rollupCost(p.child_id, items, byParent, depth + 1) : child?.unit_cost || 0;
    return sum + c * p.qty;
  }, 0));
}

// child を parent の構成に入れると循環するか（child の下に parent がいないか）
export function wouldCycle(parentId, childId, byParent) {
  const stack = [childId];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (id === parentId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const p of byParent.get(id) || []) stack.push(p.child_id);
  }
  return false;
}

// 小数の誤差を落とす（g の在庫を 0.1g 単位で扱えるくらいに）
export const round = (n) => Math.round(n * 1e6) / 1e6;

// 移動平均で新しい単価を出す
export function movingAverage(oldQty, oldCost, addQty, addCost) {
  if (!(addQty > 0) || addCost == null || !Number.isFinite(addCost)) return oldCost;
  const base = Math.max(0, oldQty);
  if (base + addQty <= 0) return addCost;
  return round((base * oldCost + addQty * addCost) / (base + addQty));
}
