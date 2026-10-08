import { platforms } from './platforms/index.js';
import { getPost, loadAccount, loadHashtagSets, now, saveCredentials } from './store.js';
import { withAutoTags } from '../public/hashtags.js';
import { countFor } from '../public/textlen.js';

export const isVideo = (m) => m.type.startsWith('video/');

export function makeCtx(env, origin) {
  const base = (env.PUBLIC_URL || origin || '').replace(/\/$/, '');
  async function get(m) {
    const obj = await env.MEDIA.get(m.key);
    if (!obj) throw new Error(`ファイルが見つかりません: ${m.key}`);
    return obj;
  }
  return {
    env,
    mediaUrl: (m) => `${base}/m/${m.key}`,
    async loadMedia(m) {
      const obj = await get(m);
      return { data: await obj.arrayBuffer(), type: obj.httpMetadata?.contentType || m.type };
    },
    // 大きな動画はメモリに載せず、そのまま流して送る
    async openMedia(m) {
      const obj = await get(m);
      return { body: obj.body, size: obj.size, type: obj.httpMetadata?.contentType || m.type };
    },
  };
}

// そのSNSに送るファイルだけに絞る（動画に対応しないSNSには動画を送らない、など）
export function mediaFor(platformId, media) {
  const l = platforms[platformId]?.limits ?? {};
  if (l.ignoreMedia) return [];
  return media.filter((m) => (isVideo(m) ? (l.videos ?? 0) > 0 : !l.ignoreImages));
}

// 投稿の前に、SNSごとの制限に合っているかを確かめる
export function check(platformId, text, media, title) {
  const p = platforms[platformId];
  if (!p) return `未対応のSNSです: ${platformId}`;
  const l = p.limits;
  const n = countFor(platformId, text);
  if (n > l.text) return `${p.label}の文字数制限（${l.text}）を超えています：${n}`;
  if (title && l.title && [...title].length > l.title) return `${p.label}のタイトルは${l.title}字までです`;
  const m = mediaFor(platformId, media);
  const images = m.filter((x) => !isVideo(x));
  const videos = m.filter(isVideo);
  if (!text.trim() && !m.length) return '本文も画像もありません';
  if (l.requiresImage && !images.length) return `${p.label}は画像が必要です`;
  if (l.requiresVideo && !videos.length) return `${p.label}は動画が必要です`;
  if (images.length > l.images) return `${p.label}の画像は${l.images}枚までです`;
  if (videos.length > (l.videos ?? 0)) return `${p.label}の動画は${l.videos}本までです`;
  const bad = images.find((x) => !l.imageTypes.includes(x.type)) || videos.find((x) => !(l.videoTypes ?? []).includes(x.type));
  if (bad) return `${p.label}は ${bad.type} に対応していません（${[...l.imageTypes, ...(l.videoTypes ?? [])].join(', ')}）`;
  return null;
}

const DONE = ['ok', 'manual'];

async function publishTarget(env, ctx, post, t, sets) {
  const account = await loadAccount(env, t.account_id);
  if (!account) throw new Error('アカウントが削除されています');
  if (!account.enabled) throw new Error('アカウントが停止中です');
  const p = platforms[account.platform];
  // セットで「自動で付ける」にしたハッシュタグを足す（文字数に収まる分だけ）
  const text = withAutoTags(account.platform, t.body ?? post.body, sets, p.limits.text);
  const problem = check(account.platform, text, post.media, t.title);
  if (problem) throw new Error(problem);
  const r = await p.publish(
    { text, title: t.title || null, media: mediaFor(account.platform, post.media), idempotencyKey: `sns-hub-${post.id}-${t.id}` },
    account.credentials, ctx,
  );
  return { ...r, sent: text };
}

// 予約・下書き・失敗した投稿を公開する。すでに成功したSNSには二度投稿しない
export async function publishPost(env, postId, origin) {
  const claimed = await env.DB.prepare(
    `UPDATE posts SET status = 'publishing', updated_at = ? WHERE id = ? AND status IN ('draft','scheduled','partial','failed')`,
  ).bind(now(), postId).run();
  if (!claimed.meta.changes) throw new Error('この投稿は公開できない状態です（公開中か、公開済み）');

  const post = await getPost(env, postId);
  const ctx = makeCtx(env, origin);
  const sets = await loadHashtagSets(env);
  const todo = post.targets.filter((t) => !DONE.includes(t.status));

  await Promise.all(todo.map(async (t) => {
    try {
      const r = await publishTarget(env, ctx, post, t, sets);
      await env.DB.prepare(`UPDATE targets SET status = ?, remote_id = ?, url = ?, sent = ?, error = NULL, published_at = ? WHERE id = ?`)
        .bind(r.manual ? 'manual' : 'ok', r.id ?? null, r.url ?? null, r.sent, now(), t.id).run();
    } catch (e) {
      await env.DB.prepare(`UPDATE targets SET status = 'error', error = ? WHERE id = ?`)
        .bind(String(e.message || e).slice(0, 1000), t.id).run();
    }
  }));

  const { results } = await env.DB.prepare('SELECT status FROM targets WHERE post_id = ?').bind(postId).all();
  const ok = results.filter((r) => DONE.includes(r.status)).length;
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
