import { currentUser, LoginError, loginWithGoogle, loginWithPassword, logoutCookie, sameOrigin } from './auth.js';
import { getSetting, InputError, listBatches, listItems, loadGraph, now, postBatch, putSetting, readItem, reverseBatch, valuation } from './inventory.js';
import { importProducts, loadCreds, pushInventory, runSync, saveCreds, shopHost, syncOrders, unmappedLines, verify } from './shopify.js';
import { KINDS, rollupCost, round, wouldCycle } from '../public/core.js';
import STATIC from './static.gen.js';

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
const fail = (message, status = 400) => json({ error: message }, status);

const MAX_MEMBERS = 30;
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email ?? null, role: u.role });

// 'YYYY-MM-DD'（日本時間）のその日の終わり
export function endOfDayJst(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return null;
  const t = Date.parse(`${s}T23:59:59.999+09:00`);
  return Number.isFinite(t) ? t : null;
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

function checkEmail(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 200) throw new InputError('Google アカウントのメールアドレスを正しく入れてください');
  return s;
}

async function shopifyStatus(env) {
  const creds = await loadCreds(env).catch(() => null);
  return {
    connected: !!creds,
    shop: creds ? shopHost(creds.shop) : null,
    mode: creds ? (creds.access_token ? 'token' : 'client') : null,
    shop_name: await getSetting(env, 'shop_name'),
    locations: (await getSetting(env, 'locations')) || [],
    location_id: await getSetting(env, 'location_id'),
    orders_since: await getSetting(env, 'orders_since'),
    last_sync: await getSetting(env, 'last_sync'),
    unmapped: creds ? await unmappedLines(env) : [],
  };
}

async function api(req, env, url) {
  const path = url.pathname.replace(/^\/api/, '');
  const method = req.method;
  const body = ['POST', 'PATCH', 'PUT'].includes(method) ? await req.json().catch(() => ({})) : null;

  if (path === '/auth-config' && method === 'GET') {
    return json({
      firebase: env.FIREBASE_PROJECT_ID ? { apiKey: env.FIREBASE_API_KEY, authDomain: env.FIREBASE_AUTH_DOMAIN, projectId: env.FIREBASE_PROJECT_ID } : null,
      password_login: !!env.ADMIN_PASSWORD,
    });
  }
  if (path === '/login/google' && method === 'POST') {
    try {
      const r = await loginWithGoogle(env, body?.idToken);
      return json({ ok: true, user: publicUser(r.user) }, 200, { 'set-cookie': r.cookie });
    } catch (e) {
      if (e instanceof LoginError) return fail(e.message, 403);
      throw e;
    }
  }
  if (path === '/login' && method === 'POST') {
    const r = await loginWithPassword(env, body?.password);
    if (!r) {
      await new Promise((res) => setTimeout(res, 800));
      return fail('合言葉が違います', 401);
    }
    return json({ ok: true, user: publicUser(r.user) }, 200, { 'set-cookie': r.cookie });
  }
  if (path === '/logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': logoutCookie() });

  const user = await currentUser(req, env);
  if (!user) return fail('ログインしてください', 401);
  if (method !== 'GET' && !sameOrigin(req)) return fail('不正なリクエストです', 403);
  const isAdmin = user.role === 'admin';
  const adminOnly = () => fail('この操作は管理者だけができます', 403);

  if (path === '/me' && method === 'GET') return json({ user: publicUser(user) });

  // ── 品目 ──
  if (path === '/items' && method === 'GET') return json(await listItems(env));
  if (path === '/items' && method === 'POST') {
    const it = readItem(body);
    const t = now();
    const r = await env.DB.prepare(`INSERT INTO items (name, kind, unit, unit_cost, reorder_point, make_on_order, push_to_shopify, sku, note, archived, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?) RETURNING id`)
      .bind(it.name, it.kind, it.unit, it.unit_cost, it.reorder_point, it.make_on_order, it.push_to_shopify, it.sku, it.note, t, t).first();
    return json({ id: r.id });
  }
  let m = path.match(/^\/items\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    const old = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
    if (!old) return fail('品目が見つかりません', 404);
    if (method === 'PATCH') {
      const it = readItem(body, old);
      if (it.push_to_shopify && !old.shopify_inventory_item_id) return fail('Shopify の商品と結びついた品目だけ反映できます');
      await env.DB.prepare(`UPDATE items SET name = ?, kind = ?, unit = ?, unit_cost = ?, reorder_point = ?, make_on_order = ?, push_to_shopify = ?, sku = ?, note = ?, archived = ?, updated_at = ? WHERE id = ?`)
        .bind(it.name, it.kind, it.unit, it.unit_cost, it.reorder_point, it.make_on_order, it.push_to_shopify, it.sku, it.note, it.archived, now(), id).run();
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      if (!isAdmin) return adminOnly();
      const used = await env.DB.prepare('SELECT 1 FROM moves WHERE item_id = ? LIMIT 1').bind(id).first();
      if (used) return fail('入出庫の記録がある品目は消せません。「使わない」にしてください', 409);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM bom WHERE parent_id = ? OR child_id = ?').bind(id, id),
        env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id),
      ]);
      return json({ ok: true });
    }
  }
  m = path.match(/^\/items\/(\d+)\/bom$/);
  if (m && method === 'PUT') {
    const id = Number(m[1]);
    const g = await loadGraph(env);
    if (!g.items.has(id)) return fail('品目が見つかりません', 404);
    const parts = new Map();
    for (const p of Array.isArray(body?.parts) ? body.parts : []) {
      const child = Number(p.child_id);
      const q = round(Number(p.qty));
      if (!g.items.has(child)) return fail('構成品が見つかりません');
      if (child === id) return fail('自分自身は構成に入れられません');
      if (!(q > 0)) return fail(`${g.items.get(child).name}の使う量を入れてください`);
      parts.set(child, round((parts.get(child) || 0) + q));
    }
    // 循環チェックは、この品目の構成を差し替えたあとの形で行う
    g.byParent.set(id, []);
    for (const child of parts.keys()) {
      if (wouldCycle(id, child, g.byParent)) return fail(`${g.items.get(child).name}の構成に${g.items.get(id).name}が入っているので、循環します`);
    }
    await env.DB.batch([
      env.DB.prepare('DELETE FROM bom WHERE parent_id = ?').bind(id),
      ...[...parts].map(([child, q]) => env.DB.prepare('INSERT INTO bom (parent_id, child_id, qty) VALUES (?, ?, ?)').bind(id, child, q)),
    ]);
    return json({ ok: true });
  }
  m = path.match(/^\/items\/(\d+)\/rollup$/);
  if (m && method === 'POST') {
    const id = Number(m[1]);
    const g = await loadGraph(env);
    if (!g.byParent.get(id)?.length) return fail('構成が入っていません');
    const cost = rollupCost(id, g.items, g.byParent);
    await env.DB.prepare('UPDATE items SET unit_cost = ?, updated_at = ? WHERE id = ?').bind(cost, now(), id).run();
    return json({ unit_cost: cost });
  }

  // ── 伝票（入出庫） ──
  if (path === '/batches' && method === 'GET') {
    return json(await listBatches(env, { before: url.searchParams.get('before'), itemId: url.searchParams.get('item'), limit: 50 }));
  }
  if (path === '/batches' && method === 'POST') return json(await postBatch(env, body, user.name));
  m = path.match(/^\/batches\/(\d+)\/reverse$/);
  if (m && method === 'POST') return json({ id: await reverseBatch(env, Number(m[1]), user.name) });

  // ── 在庫評価（決算の在庫計上） ──
  if ((path === '/valuation' || path === '/valuation.csv') && method === 'GET') {
    const date = url.searchParams.get('date');
    const at = date ? endOfDayJst(date) : now();
    if (!at) return fail('基準日が正しくありません');
    const v = await valuation(env, at);
    if (path === '/valuation') return json(v);
    const rows = [['勘定科目', '種類', '品目', '数量', '単位', '単価', '金額']];
    for (const r of v.rows) rows.push([KINDS[r.kind].account, KINDS[r.kind].label, r.name, r.qty, r.unit, r.unit_cost, r.value]);
    rows.push([]);
    for (const [k, total] of Object.entries(v.totals)) rows.push([KINDS[k].account, '小計', '', '', '', '', total]);
    rows.push(['合計', '', '', '', '', '', v.total]);
    return new Response(toCsv(rows), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="tanaoroshi-${date || 'now'}.csv"` },
    });
  }

  // ── Shopify ──
  if (path === '/shopify' && method === 'GET') return json(await shopifyStatus(env));
  if (path === '/shopify' && method === 'PUT') {
    if (!isAdmin) return adminOnly();
    const shop = shopHost(body?.shop);
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) return fail('ストアのドメインは「◯◯.myshopify.com」の形で入れてください');
    const creds = body?.access_token
      ? { shop, access_token: String(body.access_token).trim() }
      : { shop, client_id: String(body?.client_id ?? '').trim(), client_secret: String(body?.client_secret ?? '').trim() };
    if (!creds.access_token && !(creds.client_id && creds.client_secret)) return fail('アクセストークン、またはクライアントIDとシークレットを入れてください');
    await putSetting(env, 'shopify_token', null);
    let info;
    try {
      info = await verify(env, creds);
    } catch (e) {
      return fail(`接続できませんでした：${e.message}`);
    }
    await saveCreds(env, creds);
    await putSetting(env, 'shop_name', info.shop);
    await putSetting(env, 'locations', info.locations);
    if (!(await getSetting(env, 'location_id'))) {
      const loc = info.locations.find((l) => l.fulfillsOnlineOrders) || info.locations[0];
      if (loc) await putSetting(env, 'location_id', loc.id);
    }
    // 注文はつないだ時点から取り込む（それより前は「取り込み開始日時」で変えられる）
    if (!(await getSetting(env, 'orders_since'))) await putSetting(env, 'orders_since', new Date().toISOString());
    return json(await shopifyStatus(env));
  }
  if (path === '/shopify' && method === 'DELETE') {
    if (!isAdmin) return adminOnly();
    await env.DB.prepare("DELETE FROM settings WHERE key IN ('shopify', 'shopify_token')").run();
    return json({ ok: true });
  }
  if (path === '/shopify/settings' && method === 'PATCH') {
    if (!isAdmin) return adminOnly();
    if (body?.location_id !== undefined) {
      const locs = (await getSetting(env, 'locations')) || [];
      if (!locs.some((l) => l.id === body.location_id)) return fail('ロケーションが見つかりません');
      await putSetting(env, 'location_id', body.location_id);
      // ロケーションを変えたら、次回はすべて送り直す
      await env.DB.prepare('UPDATE items SET pushed_qty = NULL').run();
    }
    if (body?.orders_since !== undefined) {
      const t = Date.parse(body.orders_since);
      if (!Number.isFinite(t)) return fail('日時が正しくありません');
      await putSetting(env, 'orders_since', new Date(t).toISOString());
    }
    return json(await shopifyStatus(env));
  }
  try {
    if (path === '/shopify/import' && method === 'POST') return json(await importProducts(env));
    if (path === '/shopify/sync' && method === 'POST') {
      const orders = await syncOrders(env);
      await putSetting(env, 'last_sync', { at: now(), orders });
      return json({ orders, status: await shopifyStatus(env) });
    }
    if (path === '/shopify/push' && method === 'POST') return json(await pushInventory(env, { force: !!body?.force }));
  } catch (e) {
    if (e instanceof InputError) throw e;
    return fail(`Shopify とのやりとりで失敗しました：${e.message}`, 502);
  }

  // ── メンバー（管理者だけ） ──
  if (path === '/members' && method === 'GET') {
    if (!isAdmin) return adminOnly();
    return json((await env.DB.prepare('SELECT id, email, name, role, disabled, last_login_at FROM users ORDER BY id').all()).results);
  }
  if (path === '/members' && method === 'POST') {
    if (!isAdmin) return adminOnly();
    if ((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n >= MAX_MEMBERS) return fail(`メンバーは${MAX_MEMBERS}人までです`);
    const email = checkEmail(body?.email);
    const name = String(body?.name ?? '').trim().slice(0, 40);
    if (!name) return fail('名前を入れてください');
    if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) return fail('そのメールアドレスはもう登録されています');
    await env.DB.prepare('INSERT INTO users (email, name, role, created_at) VALUES (?, ?, ?, ?)').bind(email, name, body?.role === 'admin' ? 'admin' : 'staff', now()).run();
    return json({ ok: true });
  }
  m = path.match(/^\/members\/(\d+)$/);
  if (m) {
    if (!isAdmin) return adminOnly();
    const id = Number(m[1]);
    if (method === 'PATCH') {
      const role = body?.role === 'admin' ? 'admin' : 'staff';
      await env.DB.prepare('UPDATE users SET role = ?, disabled = ?, session_version = session_version + 1 WHERE id = ?').bind(role, body?.disabled ? 1 : 0, id).run();
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
  }

  return fail('見つかりません', 404);
}

function serveStatic(req, url) {
  const file = STATIC[url.pathname === '/' ? '/index.html' : url.pathname];
  if (!file || (req.method !== 'GET' && req.method !== 'HEAD')) return new Response('Not found', { status: 404 });
  const headers = { 'content-type': file.type, etag: file.etag, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' };
  if (file.type.startsWith('text/html')) headers['x-robots-tag'] = 'noindex, nofollow';
  if (req.headers.get('if-none-match') === file.etag) return new Response(null, { status: 304, headers });
  return new Response(req.method === 'HEAD' ? null : file.body, { headers });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, env, url);
      return serveStatic(req, url);
    } catch (e) {
      if (e instanceof InputError) return fail(e.message, 400);
      console.error(e);
      return fail(`サーバーエラー：${e.message}`, 500);
    }
  },

  // 10分ごと：Shopify の注文を取り込み、在庫数を反映する
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSync(env));
  },
};
