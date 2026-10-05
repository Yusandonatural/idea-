// Threads と Instagram は「コンテナを作る → 処理完了を待つ → 公開」という同じ流れ
import { call, form, sleep } from './http.js';

export async function waitReady(statusUrl, field, { tries = 20, interval = 3000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const s = await call(statusUrl);
    const v = s[field];
    if (v === 'FINISHED' || v === 'PUBLISHED') return;
    if (v === 'ERROR' || v === 'EXPIRED') throw new Error(`メディアの処理に失敗しました: ${s.error_message || v}`);
    await sleep(interval);
  }
  throw new Error('メディアの処理が時間内に終わりませんでした');
}

export async function post(url, params) {
  return call(url, { method: 'POST', body: form(params) });
}
