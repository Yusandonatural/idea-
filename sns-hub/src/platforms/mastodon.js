import { call } from './http.js';

const base = (c) => c.instance.replace(/\/$/, '');

export default {
  id: 'mastodon',
  label: 'Mastodon',
  color: '#6364ff',
  limits: { text: 500, images: 4, requiresImage: false, imageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
  fields: [
    { key: 'instance', label: 'サーバーURL', placeholder: 'https://mastodon-japan.net' },
    { key: 'access_token', label: 'アクセストークン', secret: true, help: '設定 → 開発 → 新規アプリ（権限 write:statuses write:media read:accounts）' },
  ],
  async verify(c) {
    const me = await call(`${base(c)}/api/v1/accounts/verify_credentials`, { headers: { authorization: `Bearer ${c.access_token}` } });
    return { name: '@' + me.acct };
  },
  async publish({ text, media, idempotencyKey }, c, ctx) {
    const auth = { authorization: `Bearer ${c.access_token}` };
    const ids = [];
    for (const m of media) {
      const { data, type } = await ctx.loadMedia(m);
      const fd = new FormData();
      fd.append('file', new Blob([data], { type }), m.key);
      if (m.alt) fd.append('description', m.alt);
      const up = await call(`${base(c)}/api/v2/media`, { method: 'POST', headers: auth, body: fd });
      ids.push(up.id);
    }
    const r = await call(`${base(c)}/api/v1/statuses`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify({ status: text, media_ids: ids, visibility: 'public', language: 'ja' }),
    });
    return { id: r.id, url: r.url };
  },
};
