import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1, stubFetch } from './d1.js';
import { growthOf, isoSeconds, listResearch, normalizeWatch, refreshWatch, ResearchError } from '../src/research.js';
import { isBuzz, scoreItems, searchLinks, SORTS } from '../public/buzz.js';
import { encryptCreds } from '../src/store.js';

test('見張る相手の入力を整える', () => {
  assert.equal(normalizeWatch('ig_user', '@Yusando.Natural.Tea'), 'yusando.natural.tea');
  assert.equal(normalizeWatch('ig_user', 'https://www.instagram.com/some_tea/?hl=ja'), 'some_tea');
  assert.throws(() => normalizeWatch('ig_user', 'あいう'), ResearchError);
  assert.equal(normalizeWatch('ig_tag', '#日本茶'), '日本茶');
  assert.equal(normalizeWatch('ig_tag', '＃Japanese Tea'), 'japanesetea');
  assert.throws(() => normalizeWatch('ig_tag', '日本茶、緑茶'), ResearchError);
  assert.equal(normalizeWatch('yt_channel', 'https://www.youtube.com/@TeaChannel/videos'), '@teachannel');
  assert.equal(normalizeWatch('yt_channel', 'UCabcdefghijklmnopqrstuv'), 'UCabcdefghijklmnopqrstuv');
  assert.equal(normalizeWatch('yt_channel', 'teachan'), '@teachan');
  assert.equal(normalizeWatch('yt_query', ' 日本茶   淹れ方 '), '日本茶 淹れ方');
  assert.throws(() => normalizeWatch('nope', 'x'), ResearchError);
});

test('動画の長さ・フォロワーの増え方', () => {
  assert.equal(isoSeconds('PT1M5S'), 65);
  assert.equal(isoSeconds('PT2H'), 7200);
  assert.equal(isoSeconds('P1DT1S'), 86401);
  assert.equal(growthOf([{ day: '2026-10-01', followers: 100 }, { day: '2026-10-08', followers: 130 }]).diff, 30);
  assert.equal(growthOf([{ day: '2026-10-01', followers: 100 }]), null);
});

test('いつもの何倍・勢い・話題の判定', () => {
  const now = Date.parse('2026-10-10T00:00:00Z');
  const day = 86400e3;
  const items = [
    { watch_id: 1, item_id: 'a', likes: 10, comments: 0, posted_at: now - 2 * day },
    { watch_id: 1, item_id: 'b', likes: 12, comments: 1, posted_at: now - 3 * day },
    { watch_id: 1, item_id: 'c', likes: 100, comments: 10, posted_at: now - day / 2 },
    { watch_id: 2, item_id: 'v', views: 5000, likes: 1, comments: 0, posted_at: now - 10 * day },
  ];
  const s = scoreItems(items, [{ id: 1, info: { followers: 1000 } }, { id: 2, info: null }], now);
  const c = s.find((x) => x.item_id === 'c');
  assert.equal(c.reaction, 130);
  assert.ok(c.ratio > 8 && isBuzz(c));
  assert.equal(c.per_day, 130); // 1日未満は1日として数える
  assert.equal(c.rate, 0.11);
  const v = s.find((x) => x.item_id === 'v');
  assert.equal(v.reaction, 5000);
  assert.equal(v.rate, null);
  assert.equal(isBuzz(s.find((x) => x.item_id === 'a')), false);
  assert.equal([...s].sort(SORTS.per_day.fn)[0].item_id, 'v');
});

test('検索リンク', () => {
  const l = searchLinks('#日本茶');
  assert.ok(l.find((x) => x.id === 'tiktok').url.endsWith(encodeURIComponent('日本茶')));
  assert.match(l.find((x) => x.id === 'x').url, /min_faves%3A100/);
  assert.deepEqual(searchLinks('  '), []);
});

const env = () => ({ DB: fakeD1(), APP_SECRET: 'test-secret-test-secret', GRAPH_VERSION: 'v23.0' });

test('Instagram の競合アカウントを集めて保存する（Facebook 経由のアカウントで）', async () => {
  const e = env();
  const add = async (creds) => e.DB.prepare('INSERT INTO accounts (platform, name, credentials, created_at, updated_at) VALUES (?, ?, ?, 0, 0)')
    .bind('instagram', 'ig', await encryptCreds(e, creds)).run();
  const w = { id: 1, kind: 'ig_user', value: 'rival', info: null };
  await e.DB.prepare(`INSERT INTO watches (id, kind, value, created_at) VALUES (1, 'ig_user', 'rival', 0)`).run();
  // Instagram ログインのトークンしかないと読めない
  await add({ user_id: '1', access_token: 't', api_host: 'graph.instagram.com' });
  await assert.rejects(refreshWatch(e, w), /graph\.facebook\.com/);
  await add({ user_id: '178', access_token: 'tok' });
  await e.DB.prepare(`UPDATE accounts SET credentials = ? WHERE id = 2`).bind(await encryptCreds(e, { user_id: '178', access_token: 'tok', api_host: 'graph.facebook.com' })).run();
  const f = stubFetch([['business_discovery', {
    business_discovery: {
      username: 'rival', name: 'ライバル茶園', followers_count: 1200, media_count: 50,
      media: { data: [
        { id: 'm1', caption: '新茶', like_count: 40, comments_count: 2, media_type: 'VIDEO', media_product_type: 'REELS', thumbnail_url: 'https://cdn/t.jpg', permalink: 'https://instagram.com/p/m1', timestamp: '2026-10-08T01:00:00+0000' },
        { id: 'm2', caption: '茶畑', like_count: 10, comments_count: 0, media_type: 'IMAGE', media_url: 'https://cdn/i.jpg', permalink: 'https://instagram.com/p/m2', timestamp: '2026-10-05T01:00:00+0000' },
      ] },
    },
  }]]);
  try {
    await refreshWatch(e, w);
    assert.match(f.calls[0], /^https:\/\/graph\.facebook\.com\/v23\.0\/178\?fields=business_discovery/);
  } finally {
    f.restore();
  }
  const r = await listResearch(e);
  assert.equal(r.watches[0].info.followers, 1200);
  assert.equal(r.watches[0].last_error, null);
  assert.equal(r.items.length, 2);
  const m1 = r.items.find((i) => i.item_id === 'm1');
  assert.equal(m1.media_type, 'reel');
  assert.equal(m1.thumb, 'https://cdn/t.jpg');
  assert.equal(r.items.find((i) => i.item_id === 'm2').thumb, 'https://cdn/i.jpg');
  assert.equal(r.status.instagram, null);
  assert.match(r.status.youtube, /YOUTUBE_API_KEY/);
});

test('YouTube のチャンネルを APIキーで集める', async () => {
  const e = { ...env(), YOUTUBE_API_KEY: 'k' };
  await e.DB.prepare(`INSERT INTO watches (id, kind, value, created_at) VALUES (1, 'yt_channel', '@tea', 0)`).run();
  const f = stubFetch([
    ['/channels?', { items: [{ id: 'UC1', snippet: { title: 'お茶ch' }, statistics: { subscriberCount: '900', videoCount: '12' }, contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] }],
    ['/playlistItems?', { items: [{ contentDetails: { videoId: 'v1' } }, { contentDetails: { videoId: 'v2' } }] }],
    ['/videos?', { items: [
      { id: 'v1', snippet: { title: '淹れ方', publishedAt: '2026-10-01T00:00:00Z', channelTitle: 'お茶ch', thumbnails: { medium: { url: 'https://i.ytimg.com/1.jpg' } } }, statistics: { viewCount: '3000', likeCount: '50', commentCount: '4' }, contentDetails: { duration: 'PT45S' } },
      { id: 'v2', snippet: { title: '茶畑', publishedAt: '2026-09-01T00:00:00Z' }, statistics: { viewCount: '100' }, contentDetails: { duration: 'PT12M' } },
    ] }],
  ]);
  try {
    await refreshWatch(e, { id: 1, kind: 'yt_channel', value: '@tea', info: null });
    assert.match(f.calls[0], /forHandle=%40tea/);
    assert.match(f.calls[0], /key=k/);
  } finally {
    f.restore();
  }
  const r = await listResearch(e);
  const v1 = r.items.find((i) => i.item_id === 'v1');
  assert.equal(v1.media_type, 'short');
  assert.equal(v1.url, 'https://www.youtube.com/shorts/v1');
  assert.equal(v1.views, 3000);
  assert.equal(r.items.find((i) => i.item_id === 'v2').likes, null);
  assert.equal(r.watches[0].info.followers, 900);
});
