import { currentUser, hashPassword, login, logoutCookie, sameOrigin, verifyPassword } from './auth.js';
import { randomId } from './crypto.js';
import { describe, platforms } from './platforms/index.js';
import { AiError, DEFAULT_BRAND, generate } from './ai.js';
import { check, makeCtx, publishPost, refreshTokens, runDue } from './publish.js';
import { encryptCreds, getPost, loadAccount, loadHashtagSets, now, publicAccount, saveCredentials } from './store.js';
import { parseTags, tagsIn, withAutoTags } from '../public/hashtags.js';

const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_VIDEO = 95 * 1024 * 1024; // Workers が1回に受け取れるのは100MBまで
const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
};
const MEDIA_KEY = /^[a-f0-9]{32}\.(jpg|png|webp|gif|mp4|mov|webm)$/;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
const fail = (message, status = 400) => json({ error: message }, status);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function cleanCreds(platform, input) {
  const p = platforms[platform];
  if (!p) throw new HttpError(400, '未対応のSNSです');
  const out = {};
  for (const f of p.fields) {
    const v = String(input?.[f.key] ?? f.default ?? '').trim();
    if (!v && !f.optional) throw new HttpError(400, `${f.label} を入力してください`);
    if (f.options && !f.options.some(([val]) => val === v)) throw new HttpError(400, `${f.label} の値が不正です`);
    if (v) out[f.key] = v;
  }
  return out;
}

async function verifyCreds(env, platform, creds, origin) {
  try {
    return await platforms[platform].verify(creds, makeCtx(env, origin));
  } catch (e) {
    throw new HttpError(400, `接続できませんでした：${e.message}`);
  }
}

// 本文・画像・投稿先を受け取って検証する（作成と編集で共通）
async function readPostInput(env, body) {
  const text = String(body.body ?? '');
  const media = (Array.isArray(body.media) ? body.media : []).map((m) => ({
    key: String(m.key), type: String(m.type), size: Number(m.size) || 0, alt: String(m.alt ?? '').slice(0, 1000),
  }));
  if (media.some((m) => !MEDIA_KEY.test(m.key))) throw new HttpError(400, '画像・動画の指定が不正です');
  const targets = Array.isArray(body.targets) ? body.targets : [];
  if (!targets.length) throw new HttpError(400, '投稿先を1つ以上選んでください');
  const rows = [];
  for (const t of targets) {
    const acc = await env.DB.prepare('SELECT id, platform, name FROM accounts WHERE id = ?').bind(Number(t.account_id)).first();
    if (!acc) throw new HttpError(400, 'アカウントが見つかりません');
    const own = typeof t.body === 'string' && t.body !== '' ? t.body : null;
    const title = typeof t.title === 'string' && t.title.trim() ? t.title.trim() : null;
    rows.push({ account_id: acc.id, body: own, title, platform: acc.platform, name: acc.name });
  }
  const mode = body.mode;
  if (mode !== 'draft') {
    const sets = await loadHashtagSets(env);
    const problems = rows.map((r) => {
      const msg = check(r.platform, withAutoTags(r.platform, r.body ?? text, sets, platforms[r.platform].limits.text), media, r.title);
      return msg && `${r.name}：${msg}`;
    }).filter(Boolean);
    if (problems.length) throw new HttpError(400, problems.join('\n'));
  }
  let scheduledAt = null;
  if (mode === 'schedule') {
    scheduledAt = Date.parse(body.scheduled_at);
    if (!Number.isFinite(scheduledAt)) throw new HttpError(400, '予約日時を指定してください');
    if (scheduledAt < now() - 60_000) throw new HttpError(400, '予約日時が過去になっています');
  } else if (mode !== 'now' && mode !== 'draft') {
    throw new HttpError(400, 'mode は now / schedule / draft のどれかです');
  }
  return { text, media, rows, mode, scheduledAt };
}

const MAX_MEMBERS = 20;

function readHashtagSet(body) {
  const name = String(body?.name ?? '').trim().slice(0, 40);
  if (!name) throw new HttpError(400, 'セットの名前を入れてください');
  const tags = parseTags(Array.isArray(body?.tags) ? body.tags.join(' ') : body?.tags).slice(0, 30);
  if (!tags.length) throw new HttpError(400, 'ハッシュタグを1つ以上入れてください');
  const auto = (Array.isArray(body?.auto_platforms) ? body.auto_platforms : []).map(String).filter((p) => platforms[p]);
  return { name, tags, auto_platforms: [...new Set(auto)] };
}

const publicUser = (u) => ({ id: u.id, name: u.name, login: u.login, role: u.role });

function checkPassword(pw) {
  const s = String(pw ?? '');
  if (s.length < 8) throw new HttpError(400, 'パスワードは8文字以上にしてください');
  if (s.length > 200) throw new HttpError(400, 'パスワードが長すぎます');
  return s;
}

async function getSetting(env, key) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row?.value ?? null;
}

async function writeTargets(env, postId, rows) {
  await env.DB.prepare('DELETE FROM targets WHERE post_id = ?').bind(postId).run();
  await env.DB.batch(rows.map((r) =>
    env.DB.prepare('INSERT INTO targets (post_id, account_id, body, title) VALUES (?, ?, ?, ?)').bind(postId, r.account_id, r.body, r.title)));
}

async function api(req, env, url) {
  const path = url.pathname.replace(/^\/api/, '');
  const method = req.method;
  const body = ['POST', 'PATCH', 'PUT'].includes(method)
    ? (req.headers.get('content-type') || '').includes('application/json') ? await req.json().catch(() => ({})) : null
    : null;

  if (path === '/login' && method === 'POST') {
    const r = await login(env, body?.login, body?.password);
    if (!r) {
      await new Promise((res) => setTimeout(res, 800));
      return fail(body?.login ? 'ログインIDかパスワードが違います' : '合言葉が違います', 401);
    }
    return json({ ok: true, user: publicUser(r.user) }, 200, { 'set-cookie': r.cookie });
  }
  if (path === '/logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': logoutCookie() });
  const user = await currentUser(req, env);
  if (!user) return fail('ログインしてください', 401);
  if (method !== 'GET' && !sameOrigin(req)) return fail('不正なリクエストです', 403);
  const isAdmin = user.role === 'admin';
  const adminOnly = () => fail('この操作は管理者だけができます', 403);

  if (path === '/me' && method === 'GET') return json({ ok: true, user: publicUser(user) });
  if (path === '/me/password' && method === 'PATCH') {
    if (user.id === 0) return fail('オーナーの合言葉は Cloudflare の ADMIN_PASSWORD で変えてください');
    const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first();
    if (!(await verifyPassword(String(body?.current ?? ''), row.password_hash))) return fail('今のパスワードが違います');
    const next = checkPassword(body?.next);
    // パスワードを変えると、ほかの端末のログインは切れる（この端末はログインし直す）
    await env.DB.prepare('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?').bind(await hashPassword(next), user.id).run();
    return json({ ok: true, relogin: true }, 200, { 'set-cookie': logoutCookie() });
  }

  // ── メンバー（管理者だけ） ──
  if (path === '/members' && method === 'GET') {
    if (!isAdmin) return adminOnly();
    const { results } = await env.DB.prepare('SELECT id, login, name, role, disabled, last_login_at, created_at FROM users ORDER BY id').all();
    return json(results);
  }
  if (path === '/members' && method === 'POST') {
    if (!isAdmin) return adminOnly();
    const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n;
    if (count >= MAX_MEMBERS) return fail(`メンバーは${MAX_MEMBERS}人までです`);
    const loginId = String(body?.login ?? '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(loginId)) return fail('ログインIDは半角英数字（. _ - も可）で3〜32文字にしてください');
    const name = String(body?.name ?? '').trim().slice(0, 40);
    if (!name) return fail('名前を入力してください');
    const role = body?.role === 'admin' ? 'admin' : 'editor';
    const exists = await env.DB.prepare('SELECT 1 FROM users WHERE login = ?').bind(loginId).first();
    if (exists) return fail('そのログインIDはもう使われています');
    const r = await env.DB.prepare('INSERT INTO users (login, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id, login, name, role, disabled, last_login_at, created_at')
      .bind(loginId, name, await hashPassword(checkPassword(body?.password)), role, now()).first();
    return json(r);
  }
  let mem = path.match(/^\/members\/(\d+)$/);
  if (mem) {
    if (!isAdmin) return adminOnly();
    const id = Number(mem[1]);
    const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
    if (!target) return fail('メンバーが見つかりません', 404);
    if (id === user.id && (method === 'DELETE' || body?.disabled || body?.role === 'editor')) return fail('自分自身は停止・削除・権限変更できません');
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
    if (method === 'PATCH') {
      if (typeof body.name === 'string' && body.name.trim()) await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(body.name.trim().slice(0, 40), id).run();
      if (body.role === 'admin' || body.role === 'editor') await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(body.role, id).run();
      // 停止・パスワード再設定は、その人のログインを切る
      if (typeof body.disabled === 'boolean') await env.DB.prepare('UPDATE users SET disabled = ?, session_version = session_version + 1 WHERE id = ?').bind(body.disabled ? 1 : 0, id).run();
      if (body.password) await env.DB.prepare('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?').bind(await hashPassword(checkPassword(body.password)), id).run();
      return json(await env.DB.prepare('SELECT id, login, name, role, disabled, last_login_at, created_at FROM users WHERE id = ?').bind(id).first());
    }
  }
  if (path === '/platforms') return json(describe());

  // ── AI で書き分け・設定 ──
  if (path === '/settings' && method === 'GET') {
    const brand = await getSetting(env, 'brand');
    return json({ ai_enabled: !!env.ANTHROPIC_API_KEY, brand: brand ?? DEFAULT_BRAND, brand_is_default: brand == null });
  }
  if (path === '/settings' && method === 'PUT') {
    if (!isAdmin) return adminOnly();
    const brand = String(body?.brand ?? '').trim();
    if (brand) await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind('brand', brand.slice(0, 4000)).run();
    else await env.DB.prepare(`DELETE FROM settings WHERE key = 'brand'`).run();
    return json({ ok: true });
  }
  if (path === '/generate' && method === 'POST') {
    try {
      const brand = await getSetting(env, 'brand');
      return json(await generate(env, {
        brand,
        hashtagSets: await loadHashtagSets(env),
        source: String(body?.source ?? '').slice(0, 20000),
        platformIds: Array.isArray(body?.platforms) ? body.platforms.map(String) : [],
      }));
    } catch (e) {
      if (e instanceof AiError) return fail(e.message, 400);
      throw e;
    }
  }

  // ── アカウント ──
  if (path === '/accounts' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM accounts ORDER BY id').all();
    return json(results.map(publicAccount));
  }
  if (path === '/accounts' && method === 'POST') {
    if (!isAdmin) return adminOnly();
    const creds = cleanCreds(body.platform, body.credentials);
    const v = await verifyCreds(env, body.platform, creds, url.origin);
    const name = String(body.name || '').trim() || v.name;
    const r = await env.DB.prepare(
      'INSERT INTO accounts (platform, name, credentials, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING *',
    ).bind(body.platform, name, await encryptCreds(env, creds), now(), now()).first();
    return json(publicAccount(r));
  }
  let m = path.match(/^\/accounts\/(\d+)(\/verify)?$/);
  if (m) {
    const id = Number(m[1]);
    const acc = await loadAccount(env, id);
    if (!acc) return fail('アカウントが見つかりません', 404);
    if (m[2] && method === 'POST') {
      try {
        const v = await platforms[acc.platform].verify(acc.credentials, makeCtx(env, url.origin));
        await env.DB.prepare('UPDATE accounts SET last_error = NULL WHERE id = ?').bind(id).run();
        return json({ ok: true, name: v.name });
      } catch (e) {
        await env.DB.prepare('UPDATE accounts SET last_error = ? WHERE id = ?').bind(e.message, id).run();
        return fail(`接続できませんでした：${e.message}`);
      }
    }
    if (method === 'PATCH') {
      if (!isAdmin) return adminOnly();
      if (body.credentials) {
        // 空欄の項目は今の値を残す
        const merged = { ...acc.credentials };
        for (const [k, v] of Object.entries(body.credentials)) if (String(v).trim()) merged[k] = String(v).trim();
        const creds = cleanCreds(acc.platform, merged);
        await verifyCreds(env, acc.platform, creds, url.origin);
        await saveCredentials(env, id, creds);
        await env.DB.prepare('UPDATE accounts SET last_error = NULL WHERE id = ?').bind(id).run();
      }
      if (typeof body.name === 'string' && body.name.trim()) {
        await env.DB.prepare('UPDATE accounts SET name = ?, updated_at = ? WHERE id = ?').bind(body.name.trim(), now(), id).run();
      }
      if (typeof body.enabled === 'boolean') {
        await env.DB.prepare('UPDATE accounts SET enabled = ?, updated_at = ? WHERE id = ?').bind(body.enabled ? 1 : 0, now(), id).run();
      }
      return json(publicAccount(await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first()));
    }
    if (method === 'DELETE') {
      if (!isAdmin) return adminOnly();
      await env.DB.batch([
        env.DB.prepare('DELETE FROM targets WHERE account_id = ?').bind(id),
        env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(id),
      ]);
      return json({ ok: true });
    }
  }

  // ── ハッシュタグ（投稿担当も編集できる） ──
  if (path === '/hashtags' && method === 'GET') return json(await loadHashtagSets(env));
  if (path === '/hashtags/stats' && method === 'GET') {
    // 公開した投稿で使ったタグを数える（1つの投稿では1回と数える）
    const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 90, 1), 365);
    const { results } = await env.DB.prepare(
      `SELECT p.id, p.body, p.published_at, COALESCE(t.sent, t.body) AS tbody FROM posts p LEFT JOIN targets t ON t.post_id = p.id AND t.status IN ('ok','manual')
       WHERE p.status IN ('done','partial') AND p.published_at >= ? ORDER BY p.published_at DESC LIMIT 5000`,
    ).bind(now() - days * 86400e3).all();
    const perPost = new Map();
    for (const r of results) {
      const set = perPost.get(r.id) ?? { at: r.published_at, tags: new Set() };
      for (const tag of [...tagsIn(r.body), ...tagsIn(r.tbody)]) set.tags.add(tag);
      perPost.set(r.id, set);
    }
    const stats = new Map();
    for (const { at, tags } of perPost.values()) {
      for (const tag of tags) {
        const key = tag.toLowerCase();
        const s = stats.get(key) ?? { tag, count: 0, last_used: 0 };
        s.count++;
        s.last_used = Math.max(s.last_used, at);
        stats.set(key, s);
      }
    }
    return json({ days, posts: perPost.size, tags: [...stats.values()].sort((a, b) => b.count - a.count || b.last_used - a.last_used).slice(0, 60) });
  }
  if (path === '/hashtags' && method === 'POST') {
    const set = readHashtagSet(body);
    const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM hashtag_sets').first()).n;
    if (count >= 50) return fail('ハッシュタグのセットは50個までです');
    const r = await env.DB.prepare('INSERT INTO hashtag_sets (name, tags, auto_platforms, sort, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(set.name, JSON.stringify(set.tags), JSON.stringify(set.auto_platforms), count, user.name, now(), now()).first();
    return json((await loadHashtagSets(env)).find((s) => s.id === r.id));
  }
  const hs = path.match(/^\/hashtags\/(\d+)$/);
  if (hs) {
    const id = Number(hs[1]);
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM hashtag_sets WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
    if (method === 'PATCH') {
      const set = readHashtagSet(body);
      const r = await env.DB.prepare('UPDATE hashtag_sets SET name = ?, tags = ?, auto_platforms = ?, updated_by = ?, updated_at = ? WHERE id = ?')
        .bind(set.name, JSON.stringify(set.tags), JSON.stringify(set.auto_platforms), user.name, now(), id).run();
      if (!r.meta.changes) return fail('セットが見つかりません', 404);
      return json((await loadHashtagSets(env)).find((s) => s.id === id));
    }
  }

  // ── 画像 ──
  if (path === '/media' && method === 'POST') {
    const fd = await req.formData();
    const file = fd.get('file');
    if (!file || typeof file === 'string') return fail('画像を選んでください');
    if (!EXT[file.type]) return fail('JPEG / PNG / WebP / GIF の画像か、MP4 / MOV / WebM の動画を選んでください');
    const video = file.type.startsWith('video/');
    if (!video && file.size > MAX_IMAGE) return fail('画像は8MBまでです');
    if (video && file.size > MAX_VIDEO) return fail('動画は95MBまでです');
    const key = `${randomId()}.${EXT[file.type]}`;
    await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    return json({ key, type: file.type, size: file.size, url: `/m/${key}` });
  }

  // ── 投稿 ──
  if (path === '/posts' && method === 'GET' && url.searchParams.has('from')) {
    // カレンダー：予約は予約日時、公開済みは公開日時で並べる
    const from = Number(url.searchParams.get('from'));
    const to = Number(url.searchParams.get('to'));
    if (!Number.isFinite(from) || !Number.isFinite(to) || to - from > 62 * 86400e3) return fail('期間の指定が不正です');
    const { results } = await env.DB.prepare(
      `SELECT id FROM (SELECT id, CASE WHEN status IN ('done','partial','failed') THEN COALESCE(published_at, scheduled_at) ELSE scheduled_at END AS at FROM posts)
       WHERE at >= ? AND at < ? ORDER BY at LIMIT 500`,
    ).bind(from, to).all();
    return json(await Promise.all(results.map((r) => getPost(env, r.id))));
  }
  if (path === '/posts' && method === 'GET') {
    const status = url.searchParams.get('status');
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
    const where = status === 'queue' ? `WHERE status IN ('draft','scheduled','publishing')`
      : status === 'history' ? `WHERE status IN ('done','partial','failed')` : '';
    const order = status === 'queue' ? 'ORDER BY scheduled_at IS NULL, scheduled_at, id DESC' : 'ORDER BY COALESCE(published_at, updated_at) DESC';
    const { results } = await env.DB.prepare(`SELECT id FROM posts ${where} ${order} LIMIT ?`).bind(limit).all();
    return json(await Promise.all(results.map((r) => getPost(env, r.id))));
  }
  if (path === '/posts' && method === 'POST') {
    const input = await readPostInput(env, body);
    const status = input.mode === 'schedule' ? 'scheduled' : 'draft';
    const post = await env.DB.prepare(
      'INSERT INTO posts (body, media, status, scheduled_at, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    ).bind(input.text, JSON.stringify(input.media), status, input.scheduledAt, user.name, user.name, now(), now()).first();
    await writeTargets(env, post.id, input.rows);
    if (input.mode === 'now') return json(await publishPost(env, post.id, url.origin));
    return json(await getPost(env, post.id));
  }
  m = path.match(/^\/posts\/(\d+)\/schedule$/);
  if (m && method === 'PATCH') {
    // カレンダーでのドラッグなど、予約日時だけを動かす
    const at = Date.parse(body?.scheduled_at);
    if (!Number.isFinite(at)) return fail('予約日時を指定してください');
    if (at < now() - 60_000) return fail('予約日時が過去になっています');
    const r = await env.DB.prepare(`UPDATE posts SET scheduled_at = ?, updated_by = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'`)
      .bind(at, user.name, now(), Number(m[1])).run();
    if (!r.meta.changes) return fail('予約中の投稿だけ日時を動かせます', 409);
    return json(await getPost(env, Number(m[1])));
  }
  m = path.match(/^\/posts\/(\d+)(\/publish)?$/);
  if (m) {
    const id = Number(m[1]);
    const post = await getPost(env, id);
    if (!post) return fail('投稿が見つかりません', 404);
    if (m[2] && method === 'POST') {
      try {
        return json(await publishPost(env, id, url.origin));
      } catch (e) {
        return fail(e.message, 409);
      }
    }
    if (method === 'GET') return json(post);
    if (method === 'PATCH') {
      if (!['draft', 'scheduled'].includes(post.status)) return fail('公開後の投稿は編集できません', 409);
      const input = await readPostInput(env, body);
      const status = input.mode === 'schedule' ? 'scheduled' : 'draft';
      await env.DB.prepare('UPDATE posts SET body = ?, media = ?, status = ?, scheduled_at = ?, updated_by = ?, updated_at = ? WHERE id = ?')
        .bind(input.text, JSON.stringify(input.media), status, input.scheduledAt, user.name, now(), id).run();
      await writeTargets(env, id, input.rows);
      if (input.mode === 'now') return json(await publishPost(env, id, url.origin));
      return json(await getPost(env, id));
    }
    if (method === 'DELETE') {
      if (post.status === 'publishing') return fail('公開中は削除できません', 409);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM targets WHERE post_id = ?').bind(id),
        env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id),
      ]);
      return json({ ok: true });
    }
  }

  return fail('見つかりません', 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, env, url);
      // SNSが画像を取りに来る公開URL（推測できないランダムな名前）
      const mm = url.pathname.match(/^\/m\/([a-f0-9]{32}\.(?:jpg|png|webp|gif|mp4|mov|webm))$/);
      if (mm && (req.method === 'GET' || req.method === 'HEAD')) {
        const obj = await env.MEDIA.get(mm[1]);
        if (!obj) return new Response('Not found', { status: 404 });
        return new Response(req.method === 'HEAD' ? null : obj.body, {
          headers: {
            'content-type': obj.httpMetadata?.contentType || 'application/octet-stream',
            'content-length': String(obj.size),
            'cache-control': 'public, max-age=31536000, immutable',
            'x-robots-tag': 'noindex',
          },
        });
      }
      return env.ASSETS.fetch(req);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.message, e.status);
      console.error(e);
      return fail(`サーバーエラー：${e.message}`, 500);
    }
  },

  async scheduled(event, env, ctx) {
    if (event.cron === '0 18 * * *') ctx.waitUntil(refreshTokens(env));
    else ctx.waitUntil(runDue(env));
  },
};
