import { call } from './http.js';
import { post, waitReady } from './meta.js';

const API = 'https://graph.threads.net/v1.0';

export default {
  id: 'threads',
  label: 'Threads',
  color: '#101010',
  limits: { text: 500, images: 20, requiresImage: false, imageTypes: ['image/jpeg', 'image/png'], publicMedia: true },
  fields: [
    { key: 'user_id', label: 'Threads ユーザーID' },
    { key: 'access_token', label: '長期アクセストークン', secret: true, help: 'Meta for Developers の Threads API アプリで発行（60日有効。毎日自動で延長します）' },
  ],
  refreshable: true,
  async refresh(c) {
    const r = await call(`${API.replace('/v1.0', '')}/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(c.access_token)}`);
    return { ...c, access_token: r.access_token, expires_at: Date.now() + r.expires_in * 1000 };
  },
  async verify(c) {
    const me = await call(`${API}/${c.user_id}?fields=username&access_token=${encodeURIComponent(c.access_token)}`);
    return { name: '@' + me.username };
  },
  async publish({ text, media }, c, ctx) {
    const tok = c.access_token;
    const u = `${API}/${c.user_id}`;
    let creation;
    if (media.length === 0) {
      creation = await post(`${u}/threads`, { media_type: 'TEXT', text, access_token: tok });
    } else if (media.length === 1) {
      creation = await post(`${u}/threads`, { media_type: 'IMAGE', image_url: ctx.mediaUrl(media[0]), text, alt_text: media[0].alt || undefined, access_token: tok });
    } else {
      const children = [];
      for (const m of media) {
        const ch = await post(`${u}/threads`, { media_type: 'IMAGE', image_url: ctx.mediaUrl(m), is_carousel_item: true, alt_text: m.alt || undefined, access_token: tok });
        children.push(ch.id);
      }
      for (const id of children) await waitReady(`${API}/${id}?fields=status,error_message&access_token=${encodeURIComponent(tok)}`, 'status');
      creation = await post(`${u}/threads`, { media_type: 'CAROUSEL', children: children.join(','), text, access_token: tok });
    }
    await waitReady(`${API}/${creation.id}?fields=status,error_message&access_token=${encodeURIComponent(tok)}`, 'status');
    const pub = await post(`${u}/threads_publish`, { creation_id: creation.id, access_token: tok });
    let url = null;
    try {
      url = (await call(`${API}/${pub.id}?fields=permalink&access_token=${encodeURIComponent(tok)}`)).permalink;
    } catch {}
    return { id: pub.id, url };
  },
};
