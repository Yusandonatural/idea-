// 自分の投稿の反応（画面・Worker・テストで共通）
export const METRICS = [
  { key: 'views', label: '再生・表示', icon: '▶' },
  { key: 'reach', label: 'リーチ', icon: '👁' },
  { key: 'likes', label: 'いいね', icon: '♥' },
  { key: 'comments', label: 'コメント', icon: '💬' },
  { key: 'shares', label: 'シェア', icon: '↻' },
  { key: 'saves', label: '保存', icon: '🔖' },
  { key: 'clicks', label: 'クリック', icon: '🔗' },
];

// 反応の点数：いいね＋（コメント・シェア・保存）×3。どれもなければ null
export function engagement(m) {
  if (!m) return null;
  const keys = ['likes', 'comments', 'shares', 'saves'];
  if (keys.every((k) => m[k] == null)) return null;
  return (m.likes || 0) + 3 * ((m.comments || 0) + (m.shares || 0) + (m.saves || 0));
}

export function cleanMetrics(input) {
  const out = {};
  for (const { key } of METRICS) {
    const v = input?.[key];
    if (v === '' || v == null) continue;
    const n = Math.round(Number(v));
    if (Number.isFinite(n) && n >= 0 && n < 1e12) out[key] = n;
  }
  return out;
}

const median = (a) => {
  const s = a.filter((n) => n != null).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// アカウントごとの「いつも」：直近の投稿（最大20件）の中央値
export function baselines(rows, size = 20) {
  const by = new Map();
  for (const r of rows) {
    const list = by.get(r.account_id) ?? [];
    if (list.length < size) list.push(r.metrics);
    by.set(r.account_id, list);
  }
  const out = {};
  for (const [id, list] of by) {
    const b = { n: list.length, engagement: median(list.map(engagement)) };
    for (const { key } of METRICS) b[key] = median(list.map((m) => m?.[key] ?? null));
    out[id] = b;
  }
  return out;
}

export function ratioTo(m, base) {
  const e = engagement(m);
  return e != null && base?.engagement && base.n >= 3 ? e / base.engagement : null;
}
