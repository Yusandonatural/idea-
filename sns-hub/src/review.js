// 投稿ごとの反応を集め、Claude に「反応のまとめ」と「次回へのアドバイス」を書いてもらう
import { z } from 'zod';
import { askClaude, DEFAULT_BRAND } from './ai.js';
import { platforms } from './platforms/index.js';
import { makeCtx } from './publish.js';
import { getPost, getSetting, loadAccount, now } from './store.js';
import { baselines, METRICS, ratioTo } from '../public/insights.js';
import { pillarOf } from '../public/plan.js';

const DAY = 86400e3;

// 反応を取れる先（API で投稿した先）の数字を取り直す。手で入れた数字は上書きしない
export async function collectMetrics(env, post, origin) {
  const ctx = makeCtx(env, origin);
  const todo = post.targets.filter((t) => t.status === 'ok' && t.remote_id && platforms[t.platform]?.metrics && !t.metrics?.manual);
  await Promise.all(todo.map(async (t) => {
    try {
      const acc = await loadAccount(env, t.account_id);
      const m = await platforms[t.platform].metrics(t.remote_id, acc.credentials, ctx);
      await env.DB.prepare('UPDATE targets SET metrics = ?, metrics_at = ?, metrics_error = NULL WHERE id = ?').bind(JSON.stringify(m), now(), t.id).run();
    } catch (e) {
      await env.DB.prepare('UPDATE targets SET metrics_error = ? WHERE id = ?').bind(String(e.message || e).slice(0, 500), t.id).run();
    }
  }));
  return todo.length;
}

// アカウントごとの「いつも」（この投稿より前の、数字のある投稿の中央値）
export async function loadBaselines(env, accountIds, beforePostId = null) {
  if (!accountIds.length) return {};
  const { results } = await env.DB.prepare(
    `SELECT t.account_id, t.metrics FROM targets t JOIN posts p ON p.id = t.post_id
     WHERE t.metrics IS NOT NULL AND t.account_id IN (${accountIds.map(() => '?').join(',')}) ${beforePostId ? 'AND p.id < ?' : ''}
     ORDER BY p.published_at DESC LIMIT 2000`,
  ).bind(...accountIds, ...(beforePostId ? [beforePostId] : [])).all();
  return baselines(results.map((r) => ({ account_id: r.account_id, metrics: JSON.parse(r.metrics) })));
}

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const jst = (ms) => {
  const d = new Date(ms + 9 * 3600e3);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WD[d.getUTCDay()]}）${d.getUTCHours()}時台`;
};
const fmtMetrics = (m) => METRICS.filter(({ key }) => m?.[key] != null).map(({ key, label }) => `${label}${m[key]}`).join('・') || '数字なし';

export function buildReviewPrompt({ brand, post, base }) {
  const p = pillarOf(post.pillar);
  const media = post.media.length
    ? post.media.some((m) => m.type.startsWith('video/')) ? '動画' : `画像${post.media.length}枚`
    : 'なし';
  const lines = post.targets.filter((t) => t.status === 'ok' || t.status === 'manual').map((t) => {
    const b = base[t.account_id];
    const ratio = ratioTo(t.metrics, b);
    const text = [...(t.sent ?? t.body ?? post.body)].slice(0, 1200).join('');
    return `## ${platforms[t.platform]?.label ?? t.platform}（${t.account_name}）
- 数字：${t.metrics ? fmtMetrics(t.metrics) : 'まだ取れていない'}
- いつも（直近${b?.n ?? 0}件の中央値）：${b?.n ? fmtMetrics(b) : '比べる過去の投稿がまだない'}${ratio != null ? `\n- 反応の点数（いいね＋コメント・シェア・保存×3）はいつもの${ratio.toFixed(2)}倍` : ''}
${t.title ? `- 題名：${t.title}\n` : ''}- 本文：
${text}`;
  });
  const system = `あなたは小さなお茶の生産者のSNS運用を手伝うアドバイザーです。1回の投稿の反応を見て、次の投稿で何を変えるとよいかを具体的に伝えます。

# 書き手について
${brand || DEFAULT_BRAND}

# 守ること
- 数字にもとづいて話す。数字がないSNSや、比べる過去の投稿が少ないときは、そう断ったうえで本文の書き方から助言する
- 1回の結果で決めつけない。「次はこれを試す」という形にする
- アドバイスは、次の投稿ですぐ試せる具体的なこと（1行目の書き方、投稿の時間帯、動画の長さ、ハッシュタグ、導線の置き方など）
- やわらかい「です・ます」調で、短く`;
  const user = `# 投稿
- 公開：${jst(post.published_at)}（公開から${Math.max(1, Math.round((now() - post.published_at) / 3600e3))}時間）
- 柱：${p ? p.label : '未設定'}
- 画像・動画：${media}

${lines.join('\n\n')}

# お願い
summary に反応のまとめ（2〜3文）、good に良かった点（1〜3個）、next に次回へのアドバイス（3個）、idea に次に試す投稿の案（1つ、1〜2文）を書いてください。`;
  return { system, user };
}

const ReviewSchema = z.object({
  summary: z.string(),
  good: z.array(z.string()),
  next: z.array(z.string()),
  idea: z.string(),
});

export async function reviewPost(env, postId, origin, { fetch = true } = {}) {
  let post = await getPost(env, postId);
  if (!post || !['done', 'partial'].includes(post.status)) throw new Error('公開済みの投稿だけふりかえれます');
  if (fetch) {
    await collectMetrics(env, post, origin);
    post = await getPost(env, postId);
  }
  if (!env.ANTHROPIC_API_KEY) return post; // AI がなくても数字は見られる
  const base = await loadBaselines(env, [...new Set(post.targets.map((t) => t.account_id))], postId);
  const { system, user } = buildReviewPrompt({ brand: await getSetting(env, 'brand'), post, base });
  const { out } = await askClaude(env, { system, user, Schema: ReviewSchema, maxTokens: 8000 });
  const review = {
    summary: out.summary.trim(),
    good: out.good.map((s) => s.trim()).filter(Boolean).slice(0, 3),
    next: out.next.map((s) => s.trim()).filter(Boolean).slice(0, 5),
    idea: out.idea.trim(),
  };
  await env.DB.prepare('UPDATE posts SET review = ?, review_at = ? WHERE id = ?').bind(JSON.stringify(review), now(), postId).run();
  return getPost(env, postId);
}

// 最近のふりかえりのアドバイス（投稿画面と、AI の書き分けで使う）
export async function recentAdvice(env, limit = 3) {
  const { results } = await env.DB.prepare('SELECT id, body, published_at, review, review_at FROM posts WHERE review IS NOT NULL ORDER BY review_at DESC LIMIT ?').bind(limit).all();
  return results.map((r) => ({ ...r, review: JSON.parse(r.review) }));
}

// 毎日：公開から8日以内の投稿の数字を取り直し、1日たった投稿をふりかえる
export async function runReviews(env, { targets = 20, reviews = 3 } = {}) {
  const { results } = await env.DB.prepare(
    `SELECT p.id FROM posts p JOIN targets t ON t.post_id = p.id
     WHERE p.status IN ('done','partial') AND p.published_at BETWEEN ? AND ? AND t.status = 'ok' AND t.remote_id IS NOT NULL
     GROUP BY p.id ORDER BY MIN(COALESCE(t.metrics_at, 0)) LIMIT ?`,
  ).bind(now() - 8 * DAY, now() - 20 * 3600e3, targets).all();
  let used = 0;
  for (const { id } of results) {
    if (used >= targets) break;
    used += await collectMetrics(env, await getPost(env, id));
  }
  if (!env.ANTHROPIC_API_KEY) return;
  const { results: due } = await env.DB.prepare(
    `SELECT id FROM posts WHERE status IN ('done','partial') AND review IS NULL AND published_at BETWEEN ? AND ?
     AND EXISTS (SELECT 1 FROM targets WHERE post_id = posts.id AND metrics IS NOT NULL) ORDER BY published_at LIMIT ?`,
  ).bind(now() - 8 * DAY, now() - 20 * 3600e3, reviews).all();
  for (const { id } of due) {
    try {
      await reviewPost(env, id, undefined, { fetch: false });
    } catch (e) {
      console.error('review failed', id, e);
    }
  }
}

