import { call } from './http.js';
import { post } from './meta.js';

const api = (env) => `https://graph.facebook.com/${env.GRAPH_VERSION || 'v23.0'}`;

export default {
  id: 'facebook',
  label: 'Facebookページ',
  color: '#0866ff',
  limits: { text: 63206, images: 10, requiresImage: false, imageTypes: ['image/jpeg', 'image/png', 'image/gif'], publicMedia: true },
  fields: [
    { key: 'page_id', label: 'ページID' },
    { key: 'page_access_token', label: 'ページアクセストークン', secret: true, help: '長期ユーザートークンから取ったページトークンは期限なし（pages_manage_posts 権限）' },
  ],
  async verify(c, ctx) {
    const me = await call(`${api(ctx.env)}/${c.page_id}?fields=name&access_token=${encodeURIComponent(c.page_access_token)}`);
    return { name: me.name };
  },
  async publish({ text, media }, c, ctx) {
    const base = api(ctx.env);
    const tok = c.page_access_token;
    const params = { message: text, access_token: tok };
    // 画像は非公開でアップロードしてから、1つの投稿にまとめる
    for (const [i, m] of media.entries()) {
      const ph = await post(`${base}/${c.page_id}/photos`, { url: ctx.mediaUrl(m), published: false, alt_text_custom: m.alt || undefined, access_token: tok });
      params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: ph.id });
    }
    const r = await post(`${base}/${c.page_id}/feed`, params);
    return { id: r.id, url: `https://www.facebook.com/${r.id}` };
  },
};
