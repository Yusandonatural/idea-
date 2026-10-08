import { call } from './http.js';
import { post, waitReady } from './meta.js';

const api = (c, env) => `https://${c.api_host || 'graph.instagram.com'}/${env.GRAPH_VERSION || 'v23.0'}`;

export default {
  id: 'instagram',
  label: 'Instagram',
  color: '#e1306c',
  limits: { text: 2200, images: 10, requiresImage: true, imageTypes: ['image/jpeg'], publicMedia: true },
  fields: [
    { key: 'user_id', label: 'Instagram ユーザーID（プロアカウント）' },
    { key: 'access_token', label: '長期アクセストークン', secret: true, help: 'Instagram API（Instagramログイン）で発行。60日有効、毎日自動で延長します' },
    { key: 'api_host', label: 'APIホスト', placeholder: 'graph.instagram.com', optional: true, help: 'Facebookページ経由のトークンなら graph.facebook.com' },
  ],
  refreshable: true,
  async refresh(c) {
    if ((c.api_host || 'graph.instagram.com') !== 'graph.instagram.com') return c;
    const r = await call(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(c.access_token)}`);
    return { ...c, access_token: r.access_token, expires_at: Date.now() + r.expires_in * 1000 };
  },
  async verify(c, ctx) {
    const me = await call(`${api(c, ctx.env)}/${c.user_id}?fields=username&access_token=${encodeURIComponent(c.access_token)}`);
    return { name: '@' + me.username };
  },
  async publish({ text, media }, c, ctx) {
    if (!media.length) throw new Error('Instagram は画像が1枚以上必要です');
    const base = api(c, ctx.env);
    const tok = c.access_token;
    const status = (id) => `${base}/${id}?fields=status_code&access_token=${encodeURIComponent(tok)}`;
    let creation;
    if (media.length === 1) {
      creation = await post(`${base}/${c.user_id}/media`, { image_url: ctx.mediaUrl(media[0]), caption: text, alt_text: media[0].alt || undefined, access_token: tok });
    } else {
      const children = [];
      for (const m of media) {
        const ch = await post(`${base}/${c.user_id}/media`, { image_url: ctx.mediaUrl(m), is_carousel_item: true, alt_text: m.alt || undefined, access_token: tok });
        children.push(ch.id);
      }
      for (const id of children) await waitReady(status(id), 'status_code');
      creation = await post(`${base}/${c.user_id}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption: text, access_token: tok });
    }
    await waitReady(status(creation.id), 'status_code');
    const pub = await post(`${base}/${c.user_id}/media_publish`, { creation_id: creation.id, access_token: tok });
    let url = null;
    try {
      url = (await call(`${base}/${pub.id}?fields=permalink&access_token=${encodeURIComponent(tok)}`)).permalink;
    } catch {}
    return { id: pub.id, url };
  },
};
