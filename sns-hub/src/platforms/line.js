import { call } from './http.js';

const API = 'https://api.line.me/v2/bot';

export default {
  id: 'line',
  label: 'LINE公式',
  color: '#06c755',
  aiGuide: 'LINE公式アカウントの一斉配信（友だち向けのお知らせ）。冒頭に【】で見出し、要点を短く、絵文字は控えめに1〜2個、最後にURL。200〜400字。',
  limits: { text: 5000, images: 4, requiresImage: false, imageTypes: ['image/jpeg', 'image/png'], publicMedia: true },
  note: '友だち全員に一斉配信します（月の無料通数を消費します）',
  fields: [
    { key: 'channel_access_token', label: 'チャネルアクセストークン（長期）', secret: true, help: 'LINE Developers → Messaging API 設定 で発行' },
  ],
  async verify(c) {
    const me = await call(`${API}/info`, { headers: { authorization: `Bearer ${c.channel_access_token}` } });
    return { name: me.displayName };
  },
  async publish({ text, media, idempotencyKey }, c, ctx) {
    const messages = [];
    if (text.trim()) messages.push({ type: 'text', text });
    for (const m of media) messages.push({ type: 'image', originalContentUrl: ctx.mediaUrl(m), previewImageUrl: ctx.mediaUrl(m) });
    const res = await fetch(`${API}/message/broadcast`, {
      method: 'POST',
      headers: { authorization: `Bearer ${c.channel_access_token}`, 'content-type': 'application/json', 'x-line-retry-key': idempotencyKey },
      body: JSON.stringify({ messages: messages.slice(0, 5) }),
    });
    // 409 は同じ配信がすでに受け付け済み（再試行で二重送信しない）
    if (!res.ok && res.status !== 409) {
      const d = await res.json().catch(() => ({}));
      throw new Error(`${res.status} ${d.message || res.statusText}${d.details ? ' ' + JSON.stringify(d.details) : ''}`);
    }
    return { id: res.headers.get('x-line-request-id'), url: null };
  },
};
