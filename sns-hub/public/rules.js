// 投稿先ごとの画像・動画・文字数のルール。画面（app.js）とサーバー（publish.js）で同じものを使う
import { countFor } from './textlen.js';

export const isVideo = (m) => String(m?.type || '').startsWith('video/');

// そのSNSに送るファイルだけに絞る
export function mediaFor(limits, media) {
  const l = limits ?? {};
  if (l.ignoreMedia) return [];
  let m = media.filter((x) => (isVideo(x) ? (l.videos ?? 0) > 0 : !l.ignoreImages));
  // リール・動画投稿は動画1本だけ（画像とは混ぜない）
  if (l.videoExclusive && m.some(isVideo)) m = m.filter(isVideo).slice(0, 1);
  return m;
}

// 問題点の一覧（空なら投稿できる）
export function problems(platformId, limits, text, media, title) {
  const l = limits;
  const out = [];
  const n = countFor(platformId, text);
  if (n > l.text) out.push(`文字数制限（${l.text}）を超えています：${n}`);
  if (title && l.title && [...title].length > l.title) out.push(`タイトルは${l.title}字までです`);
  const m = mediaFor(l, media);
  const images = m.filter((x) => !isVideo(x));
  const videos = m.filter(isVideo);
  if (!String(text).trim() && !m.length) out.push('本文も画像もありません');
  if (l.requiresMedia && !m.length) out.push('画像か動画が必要です');
  if (l.requiresImage && !images.length) out.push('画像が必要です');
  if (l.requiresVideo && !videos.length) out.push('動画が必要です');
  if (images.length > l.images) out.push(`画像は${l.images}枚までです`);
  if (videos.length > (l.videos ?? 0)) out.push(`動画は${l.videos}本までです`);
  const bad = images.find((x) => !l.imageTypes.includes(x.type)) || videos.find((x) => !(l.videoTypes ?? []).includes(x.type));
  if (bad) out.push(`${bad.type} に対応していません（${[...l.imageTypes, ...(l.videoTypes ?? [])].join(', ')}）`);
  return out;
}

// 送られないファイルがあるときの一言
export function skippedNote(limits, media) {
  const l = limits ?? {};
  if (l.ignoreMedia) return media.length ? '画像・動画は使いません（文章だけ）' : '';
  const sent = mediaFor(l, media);
  if (sent.length === media.length) return '';
  if (l.videoExclusive && sent.some(isVideo)) return '動画1本だけをリール・動画として投稿します（画像は使いません）';
  return l.ignoreImages ? '画像は使いません' : '動画は送られません';
}
