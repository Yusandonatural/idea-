import { platforms } from './platforms/index.js';
import { getPost, loadAccount, now, saveCredentials } from './store.js';
import { countFor } from '../public/textlen.js';

export function makeCtx(env, origin) {
  const base = (env.PUBLIC_URL || origin || '').replace(/\/$/, '');
  return {
    env,
    mediaUrl: (m) => `${base}/m/${m.key}`,
    async loadMedia(m) {
      const obj = await env.MEDIA.get(m.key);
      if (!obj) throw new Error(`画像が見つかりません: ${m.key}`);
      return { data: await obj.arrayBuffer(), type: obj.httpMetadata?.contentType || m.type };
    },
  };
}

// 投稿の前に、SNSごとの制限に合っているかを確かめる
export function check(platformId, text, media) {
  const p = platforms[platformId];
  if (!p) return `未対応のSNSです: ${platformId}`;
  const n = countFor(platformId, text);
  if (n > p.limits.text) return `${p.label}の文字数制限（${p.limits.text}）を超えています：${n}`;
  if (!text.trim() && !media.length) return '本文も画像もありません';
  if (p.limits.requiresImage && !media.length) return `${p.label}は画像が必要です`;
  if (media.length > p.limits.images) return `${p.label}の画像は${p.limits.images}枚までです`;
  const bad = media.find((m) => !p.limits.imageTypes.includes(m.type));
  if (bad) return `${p.label}は ${bad.type} の画像に対応していません（${p.limits.imageTypes.join(', ')}）`;
  return null;
}

async function publishTarget(env, ctx, post, t) {
  const account = await loadAccount(env, t.account_id);
  if (!account) throw new Error('アカウントが削除されています');
  if (!account.enabled) throw new Error('アカウントが停止中です');
  const p = platforms[account.platform];
  const text = t.body ?? post.body;
  const problem = check(account.platform, text, post.media);
  if (problem) throw new Error(problem);
  return p.publish({ text, media: post.media, idempotencyKey: `sns-hub-${post.id}-${t.id}` }, account.credentials, ctx);
}

// 予約・下書き・失敗した投稿を公開する。すでに成功したSNSには二度投稿しない
export async function publishPost(env, postId, origin) {
  const claimed = await env.DB.prepare(
    `UPDATE posts SET status = 'publishing', updated_at = ? WHERE id = ? AND status IN ('draft','scheduled','partial','failed')`,
  ).bind(now(), postId).run();
  if (!claimed.meta.changes) throw new Error('この投稿は公開できない状態です（公開中か、公開済み）');

  const post = await getPost(env, postId);
  const ctx = makeCtx(env, origin);
  const todo = post.targets.filter((t) => t.status !== 'ok');

  await Promise.all(todo.map(async (t) => {
    try {
      const r = await publishTarget(env, ctx, post, t);
      await env.DB.prepare(`UPDATE targets SET status = 'ok', remote_id = ?, url = ?, error = NULL, published_at = ? WHERE id = ?`)
        .bind(r.id ?? null, r.url ?? null, now(), t.id).run();
    } catch (e) {
      await env.DB.prepare(`UPDATE targets SET status = 'error', error = ? WHERE id = ?`)
        .bind(String(e.message || e).slice(0, 1000), t.id).run();
    }
  }));

  const { results } = await env.DB.prepare('SELECT status FROM targets WHERE post_id = ?').bind(postId).all();
  const ok = results.filter((r) => r.status === 'ok').length;
  const status = ok === results.length ? 'done' : ok > 0 ? 'partial' : 'failed';
  await env.DB.prepare('UPDATE posts SET status = ?, published_at = ?, updated_at = ? WHERE id = ?')
    .bind(status, ok ? now() : null, now(), postId).run();
  return getPost(env, postId);
}

// 毎分：時刻が来た予約投稿を公開。途中で止まった投稿は失敗扱いに戻す
export async function runDue(env) {
  await env.DB.prepare(
    `UPDATE posts SET status = 'failed', updated_at = ? WHERE status = 'publishing' AND updated_at < ?`,
  ).bind(now(), now() - 15 * 60 * 1000).run();
  await env.DB.prepare(
    `UPDATE targets SET status = 'error', error = '公開処理が途中で止まりました。再試行してください'
     WHERE status = 'pending' AND post_id IN (SELECT id FROM posts WHERE status = 'failed')`,
  ).run();

  const { results } = await env.DB.prepare(
    `SELECT id FROM posts WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 20`,
  ).bind(now()).all();
  for (const { id } of results) {
    try {
      await publishPost(env, id);
    } catch (e) {
      console.error('publish failed', id, e);
    }
  }
}

// 毎日：期限のあるトークン（Threads・Instagram）を延長
export async function refreshTokens(env) {
  const { results } = await env.DB.prepare('SELECT id, platform FROM accounts WHERE enabled = 1').all();
  for (const row of results) {
    const p = platforms[row.platform];
    if (!p?.refreshable) continue;
    try {
      const a = await loadAccount(env, row.id);
      await saveCredentials(env, row.id, await p.refresh(a.credentials));
      await env.DB.prepare('UPDATE accounts SET last_error = NULL WHERE id = ?').bind(row.id).run();
    } catch (e) {
      await env.DB.prepare('UPDATE accounts SET last_error = ? WHERE id = ?')
        .bind(`トークンの延長に失敗：${e.message}`, row.id).run();
    }
  }
}
