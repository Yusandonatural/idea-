// ハッシュタグの読み取り・自動追加。ブラウザ（app.js）とサーバー（publish.js）で同じものを使う
import { countFor } from './textlen.js';

const TAG_RE = /[#＃]([\p{L}\p{N}_ー・]+)/gu;

// 「日本茶, #自然栽培　奈良」→ ['#日本茶', '#自然栽培', '#奈良']（重複は除く）
export function parseTags(input) {
  const out = [];
  const seen = new Set();
  for (const raw of String(input ?? '').split(/[\s,、，]+/)) {
    const word = raw.replace(/^[#＃]+/, '').replace(/[^\p{L}\p{N}_ー・]/gu, '');
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push('#' + word);
  }
  return out;
}

// 文章に含まれるハッシュタグ（小文字で比較用）
export function tagsIn(text) {
  return [...String(text ?? '').matchAll(TAG_RE)].map((m) => '#' + m[1]);
}

// そのSNSに自動で付けるタグ（文章にすでにあるものは除き、文字数に収まる分だけ）
export function autoTagsFor(platformId, text, sets, limit) {
  const have = new Set(tagsIn(text).map((t) => t.toLowerCase()));
  const add = [];
  for (const set of sets ?? []) {
    if (!(set.auto_platforms ?? []).includes(platformId)) continue;
    for (const tag of set.tags) {
      const key = tag.toLowerCase();
      if (have.has(key)) continue;
      const next = joinTags(text, [...add, tag]);
      if (limit && countFor(platformId, next) > limit) continue;
      have.add(key);
      add.push(tag);
    }
  }
  return add;
}

export function joinTags(text, tags) {
  if (!tags.length) return text;
  const base = String(text ?? '').replace(/\s+$/, '');
  return base ? `${base}\n\n${tags.join(' ')}` : tags.join(' ');
}

// 自動タグを付けた最終的な文章
export function withAutoTags(platformId, text, sets, limit) {
  return joinTags(text, autoTagsFor(platformId, text, sets, limit));
}

// 文章の末尾にタグを足す（すでにあるものは足さない）
export function appendTags(text, tags) {
  const have = new Set(tagsIn(text).map((t) => t.toLowerCase()));
  const add = tags.filter((t) => !have.has(t.toLowerCase()));
  if (!add.length) return text;
  const base = String(text ?? '').replace(/\s+$/, '');
  // 最後の行がすでにタグだけなら同じ行に続ける
  const lastLine = base.split('\n').pop() ?? '';
  if (lastLine && /^([#＃][^\s#＃]+\s*)+$/.test(lastLine)) return `${base} ${add.join(' ')}`;
  return joinTags(base, add);
}
