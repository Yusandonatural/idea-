import { call, form } from './http.js';

const API = 'https://www.googleapis.com/youtube/v3';

async function accessToken(c) {
  const r = await call('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: form({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token, grant_type: 'refresh_token' }),
  });
  return r.access_token;
}

// YouTube のタイトルは100字まで、< > は使えない
export function ytTitle(title, text) {
  const t = (title || text.split('\n').find((l) => l.trim()) || '無題').replace(/[<>]/g, '').trim();
  return [...t].slice(0, 100).join('');
}

export default {
  id: 'youtube',
  label: 'YouTube',
  color: '#ff0000',
  limits: { text: 5000, title: 100, images: 0, videos: 1, requiresVideo: true, ignoreImages: true, imageTypes: [], videoTypes: ['video/mp4', 'video/quicktime', 'video/webm'] },
  note: '動画を1本アップロードします（画像は使いません）。タイトル未入力なら本文の1行目を使います',
  aiGuide: 'YouTube動画。titleは検索されやすい具体的な言葉で40字前後（100字以内）。textは概要欄：1〜2文の要約→内容の説明→関連リンク→最後にハッシュタグ3つ。',
  fields: [
    { key: 'client_id', label: 'OAuth クライアントID' },
    { key: 'client_secret', label: 'OAuth クライアントシークレット', secret: true },
    { key: 'refresh_token', label: 'リフレッシュトークン', secret: true, help: 'Google Cloud で YouTube Data API v3 を有効にし、youtube.upload 権限で取得する（README 参照）' },
    { key: 'privacy', label: '公開設定', options: [['public', '公開'], ['unlisted', '限定公開'], ['private', '非公開']], default: 'public' },
  ],
  async verify(c) {
    const tok = await accessToken(c);
    const r = await call(`${API}/channels?part=snippet&mine=true`, { headers: { authorization: `Bearer ${tok}` } });
    if (!r.items?.length) throw new Error('このアカウントにYouTubeチャンネルがありません');
    return { name: r.items[0].snippet.title };
  },
  async publish({ text, title, media }, c, ctx) {
    const video = media.find((m) => m.type.startsWith('video/'));
    if (!video) throw new Error('YouTube は動画が必要です');
    const tok = await accessToken(c);
    const obj = await ctx.openMedia(video);
    const meta = {
      snippet: { title: ytTitle(title, text), description: text.replace(/[<>]/g, ''), categoryId: '22', defaultLanguage: 'ja' },
      status: { privacyStatus: c.privacy || 'public', selfDeclaredMadeForKids: false },
    };
    // 再開可能アップロード：先に情報を送り、返ってきたURLに動画本体を送る
    const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tok}`,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-type': obj.type,
        'x-upload-content-length': String(obj.size),
      },
      body: JSON.stringify(meta),
    });
    const location = init.headers.get('location');
    if (!init.ok || !location) {
      const d = await init.json().catch(() => ({}));
      throw new Error(`${init.status} ${d.error?.message || 'アップロードを始められませんでした'}`);
    }
    const r = await call(location, {
      method: 'PUT',
      headers: { 'content-type': obj.type, 'content-length': String(obj.size) },
      body: obj.body,
    });
    return { id: r.id, url: `https://youtu.be/${r.id}` };
  },
};
