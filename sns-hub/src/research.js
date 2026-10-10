// 競合チェック・話題の投稿：見張る相手（アカウント・ハッシュタグ・キーワード）の最近の投稿と反応を集める
// Instagram は Facebook ページ経由で登録した Instagram アカウント、YouTube は APIキーか登録済みの YouTube アカウントで読む
import { call } from './platforms/http.js';
import { accessToken } from './platforms/youtube.js';
import { loadAccount, now } from './store.js';

export const KINDS = {
  ig_user: { label: 'Instagram アカウント', source: 'instagram' },
  ig_tag: { label: 'Instagram ハッシュタグ', source: 'instagram' },
  yt_channel: { label: 'YouTube チャンネル', source: 'youtube' },
  yt_query: { label: 'YouTube キーワード', source: 'youtube' },
};
export const MAX_WATCHES = 30;
export const MAX_IG_TAGS = 10; // Instagram は7日間に調べられるハッシュタグが30種類まで

export class ResearchError extends Error {}

export function normalizeWatch(kind, raw) {
  let v = String(raw ?? '').trim();
  if (kind === 'ig_user') {
    v = v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@/, '');
    if (!/^[A-Za-z0-9._]{1,30}$/.test(v)) throw new ResearchError('Instagram のユーザー名（@のあとの英数字）か、プロフィールのURLを入れてください');
    return v.toLowerCase();
  }
  if (kind === 'ig_tag') {
    v = v.replace(/^[#＃]/, '').replace(/\s+/g, '');
    if (!v || [...v].length > 100 || /[#＃@!$%^&*()+=[\]{};:'",.<>/?\\|`~、。]/.test(v)) throw new ResearchError('ハッシュタグを1つ入れてください（例：日本茶）');
    return v.toLowerCase();
  }
  if (kind === 'yt_channel') {
    const m = v.match(/youtube\.com\/(?:channel\/(UC[\w-]{22})|(@[\w.-]+))/i);
    if (m) v = m[1] || m[2];
    if (/^UC[\w-]{22}$/.test(v)) return v;
    if (!v.startsWith('@')) v = '@' + v;
    if (!/^@[\w.-]{3,30}$/.test(v)) throw new ResearchError('YouTube チャンネルの @ハンドル か URL を入れてください');
    return v.toLowerCase();
  }
  if (kind === 'yt_query') {
    v = v.replace(/\s+/g, ' ');
    if (!v || [...v].length > 60) throw new ResearchError('調べる言葉を60字以内で入れてください');
    return v;
  }
  throw new ResearchError('種類の指定が不正です');
}

// ── Instagram ──
async function igCreds(env) {
  const { results } = await env.DB.prepare(`SELECT id FROM accounts WHERE platform = 'instagram' AND enabled = 1 ORDER BY id`).all();
  for (const r of results) {
    const a = await loadAccount(env, r.id).catch(() => null); // 鍵が読めないアカウントは飛ばす
    if (a?.credentials.api_host === 'graph.facebook.com') return a.credentials;
  }
  return null;
}

const IG_NEED = 'Instagram の調査には、Facebook ページ経由（APIホスト graph.facebook.com）で登録した Instagram アカウントが必要です';
const IG_FIELDS = 'id,caption,like_count,comments_count,media_type,media_url,permalink,timestamp';
const graph = (env) => `https://graph.facebook.com/${env.GRAPH_VERSION || 'v23.0'}`;

function igItem(m, author) {
  return {
    item_id: String(m.id),
    url: m.permalink ?? null,
    caption: m.caption ?? '',
    thumb: m.thumbnail_url || (m.media_type === 'IMAGE' ? m.media_url : null) || null,
    media_type: m.media_product_type === 'REELS' ? 'reel' : String(m.media_type ?? '').toLowerCase() || null,
    posted_at: Date.parse(m.timestamp) || null,
    likes: m.like_count ?? null,
    comments: m.comments_count ?? null,
    views: null,
    duration: null,
    author,
  };
}

async function igUser(env, value) {
  const c = await igCreds(env);
  if (!c) throw new ResearchError(IG_NEED);
  const fields = `business_discovery.username(${value}){username,name,followers_count,media_count,profile_picture_url,media.limit(30){${IG_FIELDS},media_product_type,thumbnail_url}}`;
  let r;
  try {
    r = await call(`${graph(env)}/${c.user_id}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(c.access_token)}`);
  } catch (e) {
    throw new ResearchError(`@${value} を読めませんでした（ビジネス/クリエイターアカウントだけ調べられます）：${e.message}`);
  }
  const bd = r.business_discovery;
  return {
    info: { name: bd.name || bd.username, followers: bd.followers_count ?? null, posts: bd.media_count ?? null, picture: bd.profile_picture_url ?? null },
    items: (bd.media?.data ?? []).map((m) => igItem(m, '@' + bd.username)),
  };
}

async function igTag(env, value, info) {
  const c = await igCreds(env);
  if (!c) throw new ResearchError(IG_NEED);
  const tok = encodeURIComponent(c.access_token);
  let hid = info?.hashtag_id;
  if (!hid) {
    const s = await call(`${graph(env)}/ig_hashtag_search?user_id=${c.user_id}&q=${encodeURIComponent(value)}&access_token=${tok}`);
    hid = s.data?.[0]?.id;
    if (!hid) throw new ResearchError(`#${value} は見つかりませんでした`);
  }
  const r = await call(`${graph(env)}/${hid}/top_media?user_id=${c.user_id}&fields=${IG_FIELDS}&limit=30&access_token=${tok}`);
  return { info: { name: '#' + value, hashtag_id: hid }, items: (r.data ?? []).map((m) => igItem(m, null)) };
}

// ── YouTube ──
const YT = 'https://www.googleapis.com/youtube/v3';
const YT_NEED = 'YouTube の調査には、Cloudflare のシークレット YOUTUBE_API_KEY か、登録済みの YouTube アカウント（youtube.readonly 付き）が必要です';

async function ytAuth(env) {
  if (env.YOUTUBE_API_KEY) return { key: env.YOUTUBE_API_KEY, headers: {} };
  const row = await env.DB.prepare(`SELECT id FROM accounts WHERE platform = 'youtube' AND enabled = 1 ORDER BY id LIMIT 1`).first();
  if (!row) return null;
  const a = await loadAccount(env, row.id);
  return { headers: { authorization: `Bearer ${await accessToken(a.credentials)}` } };
}

async function yt(auth, path, params) {
  const q = new URLSearchParams(params);
  if (auth.key) q.set('key', auth.key);
  try {
    return await call(`${YT}/${path}?${q}`, { headers: auth.headers });
  } catch (e) {
    if (e.status === 403 && !auth.key) throw new ResearchError(`YouTube の読み取り権限がありません（リフレッシュトークンに youtube.readonly を付けるか、YOUTUBE_API_KEY を設定）：${e.message}`);
    throw e;
  }
}

export function isoSeconds(d) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(d ?? ''));
  if (!m) return null;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

const num = (v) => (v == null ? null : Number(v));

async function ytVideos(auth, ids) {
  if (!ids.length) return [];
  const r = await yt(auth, 'videos', { part: 'snippet,statistics,contentDetails', id: ids.join(','), maxResults: '50' });
  return (r.items ?? []).map((v) => {
    const duration = isoSeconds(v.contentDetails?.duration);
    const t = v.snippet?.thumbnails ?? {};
    return {
      item_id: v.id,
      url: duration != null && duration <= 180 ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`,
      caption: v.snippet?.title ?? '',
      thumb: (t.medium || t.high || t.default)?.url ?? null,
      media_type: duration != null && duration <= 180 ? 'short' : 'video',
      posted_at: Date.parse(v.snippet?.publishedAt) || null,
      likes: num(v.statistics?.likeCount),
      comments: num(v.statistics?.commentCount),
      views: num(v.statistics?.viewCount),
      duration,
      author: v.snippet?.channelTitle ?? null,
    };
  });
}

async function ytChannel(env, value) {
  const auth = await ytAuth(env);
  if (!auth) throw new ResearchError(YT_NEED);
  const ch = await yt(auth, 'channels', { part: 'snippet,statistics,contentDetails', ...(value.startsWith('UC') ? { id: value } : { forHandle: value }) });
  const c = ch.items?.[0];
  if (!c) throw new ResearchError(`${value} のチャンネルが見つかりませんでした`);
  const uploads = c.contentDetails?.relatedPlaylists?.uploads;
  const pl = uploads ? await yt(auth, 'playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: '30' }) : { items: [] };
  return {
    info: {
      name: c.snippet?.title ?? value,
      followers: c.statistics?.hiddenSubscriberCount ? null : num(c.statistics?.subscriberCount),
      posts: num(c.statistics?.videoCount),
      picture: c.snippet?.thumbnails?.default?.url ?? null,
    },
    items: await ytVideos(auth, (pl.items ?? []).map((i) => i.contentDetails.videoId)),
  };
}

async function ytQuery(env, value) {
  const auth = await ytAuth(env);
  if (!auth) throw new ResearchError(YT_NEED);
  // 直近30日に日本で出た動画を、再生数の多い順に
  const s = await yt(auth, 'search', {
    part: 'id', type: 'video', q: value, order: 'viewCount', maxResults: '30',
    publishedAfter: new Date(now() - 30 * 86400e3).toISOString(), regionCode: 'JP', relevanceLanguage: 'ja',
  });
  return { info: { name: value }, items: await ytVideos(auth, (s.items ?? []).map((i) => i.id.videoId).filter(Boolean)) };
}

const FETCH = { ig_user: igUser, ig_tag: igTag, yt_channel: ytChannel, yt_query: ytQuery };

export async function researchStatus(env) {
  const ig = !!(await igCreds(env));
  const ytOk = !!env.YOUTUBE_API_KEY || !!(await env.DB.prepare(`SELECT 1 FROM accounts WHERE platform = 'youtube' AND enabled = 1 LIMIT 1`).first());
  return { instagram: ig ? null : IG_NEED, youtube: ytOk ? null : YT_NEED };
}

const jstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

export async function refreshWatch(env, watch) {
  const prev = watch.info ? (typeof watch.info === 'string' ? JSON.parse(watch.info) : watch.info) : null;
  let got;
  try {
    got = await FETCH[watch.kind](env, watch.value, prev);
  } catch (e) {
    await env.DB.prepare('UPDATE watches SET last_error = ?, fetched_at = ? WHERE id = ?').bind(e.message, now(), watch.id).run();
    throw e;
  }
  const t = now();
  const stmts = [
    env.DB.prepare('DELETE FROM watch_items WHERE watch_id = ?').bind(watch.id),
    ...got.items.map((it) => env.DB.prepare(
      `INSERT OR REPLACE INTO watch_items (watch_id, item_id, url, caption, thumb, media_type, posted_at, likes, comments, views, duration, author, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(watch.id, it.item_id, it.url, String(it.caption).slice(0, 2000), it.thumb, it.media_type, it.posted_at, it.likes, it.comments, it.views, it.duration, it.author, t)),
    env.DB.prepare('UPDATE watches SET info = ?, last_error = NULL, fetched_at = ? WHERE id = ?').bind(JSON.stringify(got.info), t, watch.id),
  ];
  if (got.info.followers != null) {
    stmts.push(env.DB.prepare('INSERT OR REPLACE INTO watch_stats (watch_id, day, followers, posts) VALUES (?, ?, ?, ?)')
      .bind(watch.id, jstDay(t), got.info.followers, got.info.posts ?? null));
  }
  await env.DB.batch(stmts);
  return got;
}

// フォロワーの増え方：この1週間ほどで一番古い記録と最新の差
export function growthOf(stats) {
  if (stats.length < 2) return null;
  const first = stats[0];
  const last = stats[stats.length - 1];
  const days = Math.round((Date.parse(last.day) - Date.parse(first.day)) / 86400e3);
  return days > 0 ? { diff: last.followers - first.followers, days } : null;
}

export async function listResearch(env) {
  const [{ results: watches }, { results: items }, { results: stats }] = await Promise.all([
    env.DB.prepare('SELECT * FROM watches ORDER BY id').all(),
    env.DB.prepare('SELECT * FROM watch_items ORDER BY posted_at DESC LIMIT 2000').all(),
    env.DB.prepare('SELECT * FROM watch_stats WHERE day >= ? ORDER BY day').bind(jstDay(now() - 8 * 86400e3)).all(),
  ]);
  return {
    status: await researchStatus(env),
    watches: watches.map((w) => ({
      ...w,
      info: w.info ? JSON.parse(w.info) : null,
      growth: growthOf(stats.filter((s) => s.watch_id === w.id && s.followers != null)),
    })),
    items,
  };
}

// 毎日：古い順に少しずつ更新（Workers の外部呼び出し回数に収まるように）
export async function refreshResearch(env, limit = 15) {
  const { results } = await env.DB.prepare('SELECT * FROM watches ORDER BY fetched_at IS NOT NULL, fetched_at LIMIT ?').bind(limit).all();
  for (const w of results) {
    try {
      await refreshWatch(env, w);
    } catch {}
  }
  await env.DB.prepare('DELETE FROM watch_stats WHERE day < ?').bind(jstDay(now() - 180 * 86400e3)).run();
}
