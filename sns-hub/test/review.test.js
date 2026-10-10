import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1, stubFetch } from './d1.js';
import { baselines, cleanMetrics, engagement, ratioTo } from '../public/insights.js';
import { buildReviewPrompt, collectMetrics, loadBaselines, runReviews } from '../src/review.js';
import { buildPrompt } from '../src/ai.js';
import { encryptCreds, getPost } from '../src/store.js';

test('反応の点数・いつもとの比較・手入力の整理', () => {
  assert.equal(engagement({ likes: 10, comments: 2, saves: 1 }), 19);
  assert.equal(engagement({ views: 100 }), null);
  const b = baselines([1, 2, 3, 4].map((i) => ({ account_id: 7, metrics: { likes: i * 10 } })));
  assert.equal(b[7].n, 4);
  assert.equal(b[7].engagement, 25);
  assert.equal(ratioTo({ likes: 50 }, b[7]), 2);
  assert.equal(ratioTo({ likes: 50 }, { n: 2, engagement: 10 }), null); // 2件では比べない
  assert.deepEqual(cleanMetrics({ views: '1200', likes: '', comments: -1, shares: 'x', saves: 3.6 }), { views: 1200, saves: 4 });
});

test('ふりかえりの依頼文に数字・いつも・本文が入る', () => {
  const post = {
    pillar: 'field', published_at: Date.parse('2026-10-08T11:00:00Z'), media: [{ type: 'video/mp4' }], body: '共通',
    targets: [
      { account_id: 1, platform: 'instagram', account_name: '悠三堂', status: 'ok', sent: '茶畑の朝', metrics: { views: 900, likes: 60, comments: 3 } },
      { account_id: 2, platform: 'tiktok', account_name: 'TikTok', status: 'manual', body: null, metrics: null },
      { account_id: 3, platform: 'x', account_name: 'X', status: 'error', metrics: null },
    ],
  };
  const { system, user } = buildReviewPrompt({ brand: '', post, base: { 1: { n: 5, engagement: 30, likes: 25, comments: 2 } } });
  assert.match(system, /自然栽培/);
  assert.match(user, /10月8日（木）20時台/);
  assert.match(user, /柱：畑と季節/);
  assert.match(user, /画像・動画：動画/);
  assert.match(user, /再生・表示900・いいね60・コメント3/);
  assert.match(user, /いつもの2\.30倍/);
  assert.match(user, /## TikTok（TikTok）\n- 数字：まだ取れていない/);
  assert.doesNotMatch(user, /## X/);
  assert.match(user, /本文：\n茶畑の朝/);
});

test('書き分けの依頼文に、最近のアドバイスが入る', () => {
  const { user } = buildPrompt({ brand: '', source: 'メモ', platformIds: ['x'], advice: ['1行目に音の描写を置く'] });
  assert.match(user, /ふりかえりで出た改善点[^\n]*\n {2}- 1行目に音の描写を置く/);
});

test('公開1日後の投稿の数字を集め、手入力の数字は上書きしない', async () => {
  const e = { DB: fakeD1(), APP_SECRET: 'test-secret-test-secret', GRAPH_VERSION: 'v23.0', PUBLIC_URL: 'https://example.com' };
  const creds = await encryptCreds(e, { user_id: '1', access_token: 'tok' });
  await e.DB.prepare(`INSERT INTO accounts (id, platform, name, credentials, created_at, updated_at) VALUES (1, 'instagram', 'ig', ?, 0, 0), (2, 'tiktok', 'tt', ?, 0, 0)`).bind(creds, creds).run();
  const t = Date.now() - 30 * 3600e3;
  await e.DB.prepare(`INSERT INTO posts (id, body, status, published_at, created_at, updated_at) VALUES (1, '本文', 'done', ?, 0, 0)`).bind(t).run();
  await e.DB.prepare(`INSERT INTO targets (post_id, account_id, status, remote_id) VALUES (1, 1, 'ok', '999'), (1, 2, 'manual', NULL)`).run();
  await e.DB.prepare(`UPDATE targets SET metrics = '{"views":50,"manual":true}' WHERE account_id = 2`).run();
  const f = stubFetch([
    ['/999?fields=like_count', { like_count: 12, comments_count: 3 }],
    ['/999/insights', { data: [{ name: 'reach', values: [{ value: 400 }] }, { name: 'views', values: [{ value: 800 }] }, { name: 'saved', values: [{ value: 5 }] }, { name: 'shares', values: [{ value: 1 }] }] }],
  ]);
  try {
    await runReviews(e); // AI の鍵がないので数字だけ
  } finally {
    f.restore();
  }
  const post = await getPost(e, 1);
  assert.deepEqual(post.targets[0].metrics, { likes: 12, comments: 3, reach: 400, views: 800, saves: 5, shares: 1 });
  assert.deepEqual(post.targets[1].metrics, { views: 50, manual: true });
  assert.equal(post.review, null);
  const base = await loadBaselines(e, [1]);
  assert.equal(base[1].n, 1);
  // インサイトの権限がなくても、いいね・コメントは取れる
  const g = stubFetch([['/999?fields=like_count', { like_count: 20, comments_count: 1 }], ['/insights', { error: { message: 'no perm' } }, 400]]);
  try {
    assert.equal(await collectMetrics(e, post), 1);
  } finally {
    g.restore();
  }
  assert.deepEqual((await getPost(e, 1)).targets[0].metrics, { likes: 20, comments: 1 });
});
