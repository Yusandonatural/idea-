import { available, BATCH_KINDS, EXTRA_LABELS, explode, extrasOf, indexBom, KINDS, movingAverage, round, standardCost } from '../public/core.js';

export class InputError extends Error {}

export const now = () => Date.now();

export async function loadGraph(env, { withArchived = true } = {}) {
  const { results: rows } = await env.DB.prepare(`SELECT * FROM items ${withArchived ? '' : 'WHERE archived = 0'} ORDER BY kind, name`).all();
  const { results: bom } = await env.DB.prepare('SELECT parent_id, child_id, qty FROM bom').all();
  const items = new Map(rows.map((r) => [r.id, r]));
  return { rows, items, bom, byParent: indexBom(bom) };
}

// 一覧用：作れる数・積み上げ原価・補充の要否をつける
export async function listItems(env) {
  const g = await loadGraph(env);
  return {
    items: g.rows.map((r) => ({
      ...r,
      available: available(r.id, g.items, g.byParent),
      standard_cost: g.byParent.get(r.id)?.length || extrasOf(r).length ? standardCost(r.id, g.items, g.byParent) : null,
      low: r.reorder_point != null && r.qty < r.reorder_point,
    })),
    bom: g.bom,
  };
}

const num = (v, label, { min = -Infinity, allowNull = false } = {}) => {
  if (allowNull && (v === null || v === undefined || v === '')) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min) throw new InputError(`${label}の数が正しくありません`);
  return round(n);
};

// 加工費など：[{label, amount}]（1単位あたりの円）
function readExtras(v, old) {
  if (v === undefined) return old ?? null;
  const list = Array.isArray(v) ? v : [];
  if (list.length > 12) throw new InputError('加工費などは12行までです');
  const out = list.map((e) => {
    const label = String(e?.label ?? '').trim().slice(0, 20) || 'その他';
    return { label, amount: num(e?.amount, label, { min: 0 }) };
  }).filter((e) => e.amount > 0 || EXTRA_LABELS.includes(e.label));
  return out.length ? JSON.stringify(out) : null;
}

export function readItem(body, old = {}) {
  const name = String(body.name ?? old.name ?? '').trim().slice(0, 120);
  if (!name) throw new InputError('品目名を入れてください');
  const kind = body.kind ?? old.kind;
  if (!KINDS[kind]) throw new InputError('種類を選んでください');
  return {
    name,
    kind,
    unit: String(body.unit ?? old.unit ?? '個').trim().slice(0, 10) || '個',
    unit_cost: num(body.unit_cost ?? old.unit_cost ?? 0, '単価', { min: 0 }),
    price: num(body.price !== undefined ? body.price : old.price, '販売価格', { min: 0, allowNull: true }),
    cost_extras: readExtras(body.cost_extras, old.cost_extras),
    reorder_point: num(body.reorder_point !== undefined ? body.reorder_point : old.reorder_point, '補充の目安', { min: 0, allowNull: true }),
    make_on_order: (body.make_on_order ?? old.make_on_order) ? 1 : 0,
    push_to_shopify: (body.push_to_shopify ?? old.push_to_shopify) ? 1 : 0,
    sku: String(body.sku ?? old.sku ?? '').trim().slice(0, 60) || null,
    note: String(body.note ?? old.note ?? '').slice(0, 2000) || null,
    archived: (body.archived ?? old.archived) ? 1 : 0,
  };
}

// 伝票を1枚書く。在庫（items.qty）と単価も同じトランザクションで更新する
// lines: [{ item_id, qty（増減）, unit_cost? }]、costs: Map(item_id → 新しい単価)
async function writeBatch(env, { kind, at, ref, note, user }, lines, costs = new Map()) {
  if (!lines.length) throw new InputError('品目を1つ以上入れてください');
  const t = now();
  const stmts = [
    env.DB.prepare('INSERT INTO batches (kind, at, ref, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(kind, at, ref || null, note || null, user || null, t),
  ];
  // D1 の batch は1つのトランザクションなので、直前に入れた伝票は MAX(id) で指せる
  for (const l of lines) {
    stmts.push(env.DB.prepare('INSERT INTO moves (batch_id, item_id, qty, unit_cost, at) VALUES ((SELECT MAX(id) FROM batches), ?, ?, ?, ?)')
      .bind(l.item_id, l.qty, l.unit_cost ?? null, at));
    stmts.push(env.DB.prepare('UPDATE items SET qty = ROUND(qty + ?, 6), updated_at = ? WHERE id = ?').bind(l.qty, t, l.item_id));
  }
  for (const [id, c] of costs) stmts.push(env.DB.prepare('UPDATE items SET unit_cost = ? WHERE id = ?').bind(c, id));
  await env.DB.batch(stmts);
  return (await env.DB.prepare('SELECT MAX(id) AS id FROM batches').first()).id;
}

function readAt(v) {
  if (v === undefined || v === null || v === '') return now();
  const t = typeof v === 'number' ? v : Date.parse(v);
  if (!Number.isFinite(t)) throw new InputError('日付が正しくありません');
  return t;
}

function mergeLines(lines) {
  const m = new Map();
  for (const l of lines) {
    const cur = m.get(l.item_id);
    if (cur) cur.qty = round(cur.qty + l.qty);
    else m.set(l.item_id, { ...l });
  }
  return [...m.values()].filter((l) => l.qty !== 0);
}

// 画面から来る伝票：入荷・製造・棚卸・調整・廃棄
export async function postBatch(env, body, user) {
  const kind = body.kind;
  const g = await loadGraph(env);
  const at = readAt(body.at);
  const meta = { kind, at, ref: String(body.ref ?? '').slice(0, 120), note: String(body.note ?? '').slice(0, 2000), user };
  const getItem = (id) => {
    const it = g.items.get(Number(id));
    if (!it) throw new InputError('品目が見つかりません');
    return it;
  };
  const input = Array.isArray(body.lines) ? body.lines : [];
  const costs = new Map();
  let lines;

  if (kind === 'receive') {
    lines = input.map((l) => {
      const it = getItem(l.item_id);
      const qty = num(l.qty, it.name, { min: 0 });
      const unit_cost = num(l.unit_cost, `${it.name}の単価`, { min: 0, allowNull: true });
      if (unit_cost != null && qty > 0) costs.set(it.id, movingAverage(it.qty, costs.get(it.id) ?? it.unit_cost, qty, unit_cost));
      return { item_id: it.id, qty, unit_cost };
    });
  } else if (kind === 'produce') {
    // できたもの（+）と、使ったもの（-）。使ったものは画面で構成から計算して直せる
    const out = getItem(body.output_id);
    const outQty = num(body.output_qty, `${out.name}のできた量`, { min: 0 });
    if (!(outQty > 0)) throw new InputError('できた量を入れてください');
    const used = input.map((l) => {
      const it = getItem(l.item_id);
      if (it.id === out.id) throw new InputError('できたものと同じ品目は使えません');
      return { item_id: it.id, qty: -num(l.qty, it.name, { min: 0 }) };
    });
    // できたものの単価：使ったものの原価合計 ÷ できた量 を、いまの在庫と移動平均する
    const spent = used.reduce((s, l) => s + -l.qty * (g.items.get(l.item_id).unit_cost || 0), 0);
    if (spent > 0) costs.set(out.id, movingAverage(out.qty, out.unit_cost, outQty, round(spent / outQty)));
    lines = [{ item_id: out.id, qty: outQty, unit_cost: spent > 0 ? round(spent / outQty) : null }, ...used];
  } else if (kind === 'count') {
    // 数えた数との差を記録する
    lines = input.map((l) => {
      const it = getItem(l.item_id);
      return { item_id: it.id, qty: round(num(l.counted, it.name, { min: 0 }) - it.qty) };
    });
  } else if (kind === 'adjust' || kind === 'waste') {
    lines = input.map((l) => {
      const it = getItem(l.item_id);
      const q = num(l.qty, it.name);
      return { item_id: it.id, qty: kind === 'waste' ? -Math.abs(q) : q };
    });
  } else {
    throw new InputError('伝票の種類が正しくありません');
  }
  lines = mergeLines(lines);
  if (!lines.length && kind === 'count') return { id: null, changed: 0 };
  const id = await writeBatch(env, meta, lines, costs);
  return { id, changed: lines.length };
}

// Shopify の注文1件を出荷として記録する。lines: [{ item_id, qty }]（売れた品目）
export async function postSale(env, { at, ref, note, kind = 'sale' }, sold) {
  const g = await loadGraph(env);
  const need = new Map();
  for (const s of sold) explode(s.item_id, s.qty, g.items, g.byParent, need);
  const sign = kind === 'cancel' ? 1 : -1;
  const lines = mergeLines([...need].map(([item_id, q]) => ({ item_id, qty: round(sign * q) })));
  if (!lines.length) return null;
  return writeBatch(env, { kind, at, ref, note, user: 'Shopify' }, lines);
}

export async function listBatches(env, { limit = 50, before, itemId } = {}) {
  const where = [];
  const args = [];
  if (before) { where.push('b.id < ?'); args.push(Number(before)); }
  if (itemId) { where.push('b.id IN (SELECT batch_id FROM moves WHERE item_id = ?)'); args.push(Number(itemId)); }
  const { results: batches } = await env.DB.prepare(`SELECT b.* FROM batches b ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY b.id DESC LIMIT ?`)
    .bind(...args, Math.min(200, limit)).all();
  if (!batches.length) return [];
  const ids = batches.map((b) => b.id);
  const { results: moves } = await env.DB.prepare(`SELECT m.batch_id, m.item_id, m.qty, m.unit_cost, i.name, i.unit FROM moves m JOIN items i ON i.id = m.item_id WHERE m.batch_id IN (${ids.map(() => '?').join(',')}) ORDER BY m.id`)
    .bind(...ids).all();
  return batches.map((b) => ({ ...b, label: BATCH_KINDS[b.kind] || b.kind, moves: moves.filter((m) => m.batch_id === b.id) }));
}

// 伝票の取り消し：同じ数を逆向きに戻す（伝票は消さずに「取消」を残す）
export async function reverseBatch(env, id, user) {
  const b = await env.DB.prepare('SELECT * FROM batches WHERE id = ?').bind(id).first();
  if (!b) throw new InputError('伝票が見つかりません');
  if (b.note?.startsWith('取消済')) throw new InputError('この伝票はもう取り消しています');
  const { results } = await env.DB.prepare('SELECT item_id, qty FROM moves WHERE batch_id = ?').bind(id).all();
  const newId = await writeBatch(env, { kind: 'adjust', at: now(), ref: `#${id} の取消`, note: `${BATCH_KINDS[b.kind] || b.kind} #${id} を取り消し`, user },
    results.map((m) => ({ item_id: m.item_id, qty: round(-m.qty) })));
  await env.DB.prepare('UPDATE batches SET note = ? WHERE id = ?').bind(`取消済（#${newId}）${b.note ? ' ' + b.note : ''}`, id).run();
  return newId;
}

// 在庫評価（棚卸表）：基準日の終わりまでの入出庫を合計し、単価を掛ける
export async function valuation(env, at) {
  const { results } = await env.DB.prepare(`SELECT i.id, i.name, i.kind, i.unit, i.unit_cost, i.archived, COALESCE(SUM(m.qty), 0) AS qty
    FROM items i LEFT JOIN moves m ON m.item_id = i.id AND m.at <= ? GROUP BY i.id ORDER BY i.kind, i.name`).bind(at).all();
  const rows = results.map((r) => ({ ...r, qty: round(r.qty), value: Math.round(round(r.qty) * r.unit_cost) }))
    .filter((r) => r.qty !== 0);
  const totals = {};
  for (const k of Object.keys(KINDS)) totals[k] = 0;
  for (const r of rows) totals[r.kind] += Math.max(0, r.value);
  return { at, rows, totals, total: Object.values(totals).reduce((a, b) => a + b, 0) };
}

export async function getSetting(env, key, fallback = null) {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return r ? JSON.parse(r.value) : fallback;
}

export async function putSetting(env, key, value) {
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(value)).run();
}

// ある伝票の動きをそのまま逆向きに戻す（Shopify 注文のキャンセル）
export async function returnBatch(env, batchId, meta) {
  const { results } = await env.DB.prepare('SELECT item_id, qty FROM moves WHERE batch_id = ?').bind(batchId).all();
  if (!results.length) return null;
  return writeBatch(env, meta, results.map((m) => ({ item_id: m.item_id, qty: round(-m.qty) })));
}

// 標準原価（構成＋加工費など）を在庫単価にする
export async function applyStandardCosts(env, ids) {
  const g = await loadGraph(env);
  const t = now();
  const done = [];
  for (const id of ids.map(Number)) {
    const it = g.items.get(id);
    if (!it || !(g.byParent.get(id)?.length || extrasOf(it).length)) continue;
    done.push({ id, unit_cost: standardCost(id, g.items, g.byParent) });
  }
  for (let i = 0; i < done.length; i += 50) {
    await env.DB.batch(done.slice(i, i + 50).map((d) => env.DB.prepare('UPDATE items SET unit_cost = ?, updated_at = ? WHERE id = ?').bind(d.unit_cost, t, d.id)));
  }
  return done;
}
