import { isAuthed, login, logoutCookie, sameOrigin } from './auth.js';
import { randomId } from './crypto.js';
import { describe, platforms } from './platforms/index.js';
import { check, makeCtx, publishPost, refreshTokens, runDue } from './publish.js';
import { encryptCreds, getPost, loadAccount, now, publicAccount, saveCredentials } from './store.js';

const MAX_IMAGE = 8 * 1024 * 1024;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

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
    const v = String(input?.[f.key] ?? '').trim();
    if (!v && !f.optional) throw new HttpError(400, `${f.label} を入力してください`);
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
  if (media.some((m) => !/^[a-f0-9]{32}\.(jpg|png|webp|gif)$/.test(m.key))) throw new HttpError(400, '画像の指定が不正です');
  const targets = Array.isArray(body.targets) ? body.targets : [];
  if (!targets.length) throw new HttpError(400, '投稿先を1つ以上選んでください');
  const rows = [];
  for (const t of targets) {
    const acc = await env.DB.prepare('SELECT id, platform, name FROM accounts WHERE id = ?').bind(Number(t.account_id)).first();
    if (!acc) throw new HttpError(400, 'アカウントが見つかりません');
    const own = typeof t.body === 'string' && t.body !== '' ? t.body : null;
    rows.push({ account_id: acc.id, body: own, platform: acc.platform, name: acc.name });
  }
  const mode = body.mode;
  if (mode !== 'draft') {
    const problems = rows.map((r) => {
      const msg = check(r.platform, r.body ?? text, media);
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

async function writeTargets(env, postId, rows) {
  await env.DB.prepare('DELETE FROM targets WHERE post_id = ?').bind(postId).run();
  await env.DB.batch(rows.map((r) =>
    env.DB.prepare('INSERT INTO targets (post_id, account_id, body) VALUES (?, ?, ?)').bind(postId, r.account_id, r.body)));
}

async function api(req, env, url) {
  const path = url.pathname.replace(/^\/api/, '');
  const method = req.method;
  const body = method === 'POST' || method === 'PATCH'
    ? (req.headers.get('content-type') || '').includes('application/json') ? await req.json().catch(() => ({})) : null
    : null;

  if (path === '/login' && method === 'POST') {
    const cookie = await login(env, body?.password);
    if (!cookie) {
      await new Promise((r) => setTimeout(r, 800));
      return fail('合言葉が違います', 401);
    }
    return json({ ok: true }, 200, { 'set-cookie': cookie });
  }
  if (path === '/logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': logoutCookie() });
  if (!(await isAuthed(req, env))) return fail('ログインしてください', 401);
  if (method !== 'GET' && !sameOrigin(req)) return fail('不正なリクエストです', 403);

  if (path === '/me') return json({ ok: true });
  if (path === '/platforms') return json(describe());

  // ── アカウント ──
  if (path === '/accounts' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM accounts ORDER BY id').all();
    return json(results.map(publicAccount));
  }
  if (path === '/accounts' && method === 'POST') {
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
      await env.DB.batch([
        env.DB.prepare('DELETE FROM targets WHERE account_id = ?').bind(id),
        env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(id),
      ]);
      return json({ ok: true });
    }
  }

  // ── 画像 ──
  if (path === '/media' && method === 'POST') {
    const fd = await req.formData();
    const file = fd.get('file');
    if (!file || typeof file === 'string') return fail('画像を選んでください');
    if (!EXT[file.type]) return fail('JPEG / PNG / WebP / GIF の画像を選んでください');
    if (file.size > MAX_IMAGE) return fail('画像は8MBまでです');
    const key = `${randomId()}.${EXT[file.type]}`;
    await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    return json({ key, type: file.type, size: file.size, url: `/m/${key}` });
  }

  // ── 投稿 ──
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
      'INSERT INTO posts (body, media, status, scheduled_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    ).bind(input.text, JSON.stringify(input.media), status, input.scheduledAt, now(), now()).first();
    await writeTargets(env, post.id, input.rows);
    if (input.mode === 'now') return json(await publishPost(env, post.id, url.origin));
    return json(await getPost(env, post.id));
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
      await env.DB.prepare('UPDATE posts SET body = ?, media = ?, status = ?, scheduled_at = ?, updated_at = ? WHERE id = ?')
        .bind(input.text, JSON.stringify(input.media), status, input.scheduledAt, now(), id).run();
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
      const mm = url.pathname.match(/^\/m\/([a-f0-9]{32}\.(?:jpg|png|webp|gif))$/);
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
