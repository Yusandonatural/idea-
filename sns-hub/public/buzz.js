// 話題の投稿の見分け方（画面とテストで共通）
// 再生数があれば再生数、なければ いいね＋コメント×3 を「反応」とする
export function reaction(item) {
  if (item.views != null) return item.views;
  if (item.likes == null && item.comments == null) return null;
  return (item.likes || 0) + 3 * (item.comments || 0);
}

const DAY = 86400e3;

export function median(nums) {
  const a = nums.filter((n) => n != null && Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

// 同じ見張り先の中で「いつもの何倍」か、1日あたりの勢い、フォロワーあたりの反応率を付ける
export function scoreItems(items, watches, now = Date.now()) {
  const byWatch = new Map();
  for (const it of items) {
    const list = byWatch.get(it.watch_id) ?? [];
    list.push(it);
    byWatch.set(it.watch_id, list);
  }
  const followers = new Map(watches.map((w) => [w.id, w.info?.followers ?? null]));
  const out = [];
  for (const [wid, list] of byWatch) {
    const med = median(list.map(reaction));
    for (const it of list) {
      const r = reaction(it);
      const days = it.posted_at ? Math.max((now - it.posted_at) / DAY, 1) : null;
      const f = followers.get(wid);
      out.push({
        ...it,
        reaction: r,
        ratio: r != null && med ? r / med : null,
        per_day: r != null && days ? r / days : null,
        rate: f && it.views == null && r != null ? ((it.likes || 0) + (it.comments || 0)) / f : null,
      });
    }
  }
  return out;
}

export const isBuzz = (it) => it.ratio != null && it.ratio >= 2 && it.reaction >= 10;

export const SORTS = {
  per_day: { label: '勢い（1日あたり）', fn: (a, b) => (b.per_day ?? -1) - (a.per_day ?? -1) },
  ratio: { label: 'いつもの何倍', fn: (a, b) => (b.ratio ?? -1) - (a.ratio ?? -1) },
  reaction: { label: '反応の多さ', fn: (a, b) => (b.reaction ?? -1) - (a.reaction ?? -1) },
  new: { label: '新しい順', fn: (a, b) => (b.posted_at ?? 0) - (a.posted_at ?? 0) },
};

// APIで取れないSNSは、検索ページへのリンクを用意する
export function searchLinks(q) {
  const s = String(q ?? '').trim().replace(/^[#@]/, '');
  if (!s) return [];
  const e = encodeURIComponent(s);
  const tag = encodeURIComponent(s.replace(/\s+/g, ''));
  return [
    { id: 'tiktok', label: 'TikTok', url: `https://www.tiktok.com/search?q=${e}` },
    { id: 'instagram', label: 'Instagram', url: `https://www.instagram.com/explore/tags/${tag}/` },
    { id: 'youtube', label: 'YouTube（再生数順）', url: `https://www.youtube.com/results?search_query=${e}&sp=CAM%253D` },
    { id: 'x', label: 'X（いいね100以上）', url: `https://x.com/search?q=${encodeURIComponent(`${s} min_faves:100`)}&f=top` },
    { id: 'threads', label: 'Threads', url: `https://www.threads.com/search?q=${e}&serp_type=default` },
    { id: 'red', label: '小紅書', url: `https://www.xiaohongshu.com/search_result?keyword=${e}` },
    { id: 'note', label: 'note', url: `https://note.com/search?q=${e}&context=note&mode=search` },
  ];
}
