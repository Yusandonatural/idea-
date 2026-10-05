// SNSごとの文字数の数え方。ブラウザ（public/app.js）からも同じファイルを読み込む
const URL_RE = /https?:\/\/[^\s<>"'「」『』（）]+/g;

function graphemes(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    let n = 0;
    for (const _ of new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text)) n++;
    return n;
  }
  return [...text].length;
}

// X：日本語・絵文字は2、半角英数は1、URLは一律23として、合計280まで
function xWeight(text) {
  let n = 0;
  const rest = text.replace(URL_RE, () => {
    n += 23;
    return '';
  });
  const segs = typeof Intl !== 'undefined' && Intl.Segmenter
    ? [...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(rest)].map((s) => s.segment)
    : [...rest];
  for (const g of segs) {
    const cp = g.codePointAt(0);
    const light = g.length === 1 && (cp <= 4351 || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247));
    n += light ? 1 : 2;
  }
  return n;
}

// Mastodon：URLは一律23
function mastodonLen(text) {
  let n = 0;
  const rest = text.replace(URL_RE, () => {
    n += 23;
    return '';
  });
  return n + [...rest].length;
}

export const counters = {
  x: xWeight,
  bluesky: graphemes,
  mastodon: mastodonLen,
  threads: (t) => [...t].length,
  instagram: (t) => [...t].length,
  facebook: (t) => [...t].length,
  line: (t) => [...t].length,
};

export function countFor(platform, text) {
  return (counters[platform] ?? ((t) => [...t].length))(text ?? '');
}
