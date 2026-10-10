import { call } from './http.js';

const API = 'https://api.pinterest.com/v5';

export default {
  id: 'pinterest',
  label: 'Pinterest',
  color: '#e60023',
  limits: { text: 800, title: 100, images: 1, requiresImage: true, imageTypes: ['image/jpeg', 'image/png'], publicMedia: true },
  note: '縦長の写真（2:3 がおすすめ）1枚をピンにします。本文の最初の yusando.com のURLがピンのリンク先になります',
  aiGuide: 'Pinterest のピン（海外の抹茶・ウェルネス層向け）。titleは検索されやすい具体的な言葉で40字前後（英語の言葉を少し混ぜてもよい）。textは説明文：何の写真か・季節・お茶の楽しみ方を2〜3文、最後にURL。ハッシュタグは使わない。',
  fields: [
    { key: 'access_token', label: 'アクセストークン', secret: true, help: 'Pinterest Developers でアプリを作り、pins:write と boards:read の権限で発行（ビジネスアカウント）' },
    { key: 'board_id', label: 'ボードID', help: 'ピンを入れるボード。ボードを開いたURLの数字、または API の /v5/boards で確認' },
  ],
  async verify(c) {
    const me = await call(`${API}/user_account`, { headers: { authorization: `Bearer ${c.access_token}` } });
    const board = await call(`${API}/boards/${c.board_id}`, { headers: { authorization: `Bearer ${c.access_token}` } });
    return { name: `${me.username}／${board.name}` };
  },
  async publish({ text, title, media }, c, ctx) {
    const image = media.find((m) => m.type.startsWith('image/'));
    if (!image) throw new Error('Pinterest は画像が必要です');
    const link = (text.match(/https?:\/\/[^\s<>"'「」『』（）、。]+/) || [])[0];
    const r = await call(`${API}/pins`, {
      method: 'POST',
      headers: { authorization: `Bearer ${c.access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        board_id: c.board_id,
        title: (title || text.split('\n').find((l) => l.trim()) || '').slice(0, 100),
        description: text.slice(0, 800),
        link,
        alt_text: (image.alt || '').slice(0, 500) || undefined,
        media_source: { source_type: 'image_url', url: ctx.mediaUrl(image) },
      }),
    });
    return { id: r.id, url: `https://www.pinterest.com/pin/${r.id}/` };
  },
};
