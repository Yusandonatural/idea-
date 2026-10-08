import { call } from './http.js';

const te = new TextEncoder();

// URL とハッシュタグをリンクにする（Bluesky は位置をUTF-8のバイト数で指定する）
export function facets(text) {
  const out = [];
  const byteAt = (i) => te.encode(text.slice(0, i)).length;
  for (const m of text.matchAll(/https?:\/\/[^\s<>"'「」『』（）、。]+/g)) {
    const url = m[0].replace(/[.,;:!?)]+$/, '');
    out.push({
      index: { byteStart: byteAt(m.index), byteEnd: byteAt(m.index + url.length) },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
    });
  }
  for (const m of text.matchAll(/(^|[\s　])([#＃])([^\s　#＃.,!?、。！？「」()（）]+)/gu)) {
    const start = m.index + m[1].length;
    const end = start + m[2].length + m[3].length;
    out.push({
      index: { byteStart: byteAt(start), byteEnd: byteAt(end) },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[3] }],
    });
  }
  return out;
}

async function session(c) {
  const service = (c.service || 'https://bsky.social').replace(/\/$/, '');
  const s = await call(`${service}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: c.identifier, password: c.app_password }),
  });
  return { service, ...s };
}

export default {
  id: 'bluesky',
  label: 'Bluesky',
  color: '#1185fe',
  limits: { text: 300, images: 4, requiresImage: false, imageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
  fields: [
    { key: 'identifier', label: 'ハンドル', placeholder: 'yusando.bsky.social' },
    { key: 'app_password', label: 'アプリパスワード', secret: true, help: '設定 → プライバシーとセキュリティ → アプリパスワード で作る' },
    { key: 'service', label: 'サーバー', placeholder: 'https://bsky.social', optional: true },
  ],
  async verify(c) {
    const s = await session(c);
    return { name: '@' + s.handle };
  },
  async publish({ text, media }, c, ctx) {
    const s = await session(c);
    const auth = { authorization: `Bearer ${s.accessJwt}` };
    const record = { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString(), langs: ['ja'] };
    const f = facets(text);
    if (f.length) record.facets = f;
    if (media.length) {
      const images = [];
      for (const m of media) {
        const { data, type } = await ctx.loadMedia(m);
        const up = await call(`${s.service}/xrpc/com.atproto.repo.uploadBlob`, {
          method: 'POST', headers: { ...auth, 'content-type': type }, body: data,
        });
        images.push({ image: up.blob, alt: m.alt || '' });
      }
      record.embed = { $type: 'app.bsky.embed.images', images };
    }
    const r = await call(`${s.service}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ repo: s.did, collection: 'app.bsky.feed.post', record }),
    });
    const rkey = r.uri.split('/').pop();
    return { id: r.uri, url: `https://bsky.app/profile/${s.handle}/post/${rkey}` };
  },
};
