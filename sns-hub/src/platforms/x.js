import { call } from './http.js';
import { oauth1Header } from '../oauth1.js';

const API = 'https://api.x.com/2';

async function signed(method, url, c, init = {}) {
  const authorization = await oauth1Header(method, url, c);
  return call(url, { ...init, method, headers: { ...(init.headers || {}), authorization } });
}

export default {
  id: 'x',
  label: 'X',
  color: '#000000',
  aiGuide: 'X（旧Twitter）。日本語は1字を2と数え合計280なので、日本語なら130字以内に収める。要点を1つに絞り、ハッシュタグは1〜2個。URLは23字として数える。',
  limits: { text: 280, images: 4, requiresImage: false, imageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
  fields: [
    { key: 'api_key', label: 'API Key（Consumer Key）' },
    { key: 'api_secret', label: 'API Key Secret', secret: true },
    { key: 'access_token', label: 'Access Token' },
    { key: 'access_token_secret', label: 'Access Token Secret', secret: true, help: 'developer.x.com のアプリで「Read and write」にしてから発行する' },
  ],
  async verify(c) {
    const me = await signed('GET', `${API}/users/me`, c);
    return { name: '@' + me.data.username };
  },
  async metrics(id, c) {
    const r = await signed('GET', `${API}/tweets/${encodeURIComponent(id)}?tweet.fields=public_metrics`, c);
    const m = r.data?.public_metrics ?? {};
    return { views: m.impression_count ?? null, likes: m.like_count ?? null, comments: m.reply_count ?? null, shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0), saves: m.bookmark_count ?? null };
  },
  async publish({ text, media }, c, ctx) {
    const mediaIds = [];
    for (const m of media) {
      const { data, type } = await ctx.loadMedia(m);
      const fd = new FormData();
      fd.append('media', new Blob([data], { type }), m.key);
      fd.append('media_category', type === 'image/gif' ? 'tweet_gif' : 'tweet_image');
      const up = await signed('POST', `${API}/media/upload`, c, { body: fd });
      mediaIds.push(up.data?.id ?? up.media_id_string);
    }
    const body = { text };
    if (mediaIds.length) body.media = { media_ids: mediaIds };
    const r = await signed('POST', `${API}/tweets`, c, {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { id: r.data.id, url: `https://x.com/i/web/status/${r.data.id}` };
  },
};
