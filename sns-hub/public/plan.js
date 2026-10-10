// 「悠三堂 SNSフル活用プラン」（2026-10）の中身。投稿の柱・お茶ごよみ・週間スケジュール・UTM
// 画面（app.js）とサーバー（ai.js・publish.js）で同じものを使う

// 投稿の柱：週の中で回す5つのテーマと、比率の目安・主な導線
export const PILLARS = [
  { key: 'field', label: '畑と季節', ratio: 30, link: '買う', about: '茶畑、天日干し、森のお茶作り、水田部', color: '#5c8a3a' },
  { key: 'sado', label: '自然茶道', ratio: 20, link: '学ぶ・飲む', about: '一服の所作、茶室、茶道具、古美術', color: '#8a6d3b' },
  { key: 'words', label: '思想と言葉', ratio: 20, link: 'ポッドキャスト・LINE', about: '朝のお話し、自然経営、火と水と土', color: '#4a6fa5' },
  { key: 'people', label: '人と暮らし', ratio: 15, link: '体験する', about: '家族、インターン、援農、古民家カフェ工事', color: '#b5651d' },
  { key: 'product', label: '商品と淹れ方', ratio: 15, link: '買う', about: '淹れ方、飲み比べ、ギフト、抹茶ブランド', color: '#9c3d54' },
];
export const pillarOf = (key) => PILLARS.find((p) => p.key === key) ?? null;

// 四季のお茶ごよみ（月 → 季節の作業・発信テーマ・販売や集客の山）
export const SEASONS = {
  1: { work: '休み', theme: '新年の一服、今年の目標、思想回', peak: '初売り、定期便の案内' },
  2: { work: '準備・春番茶', theme: '畑の準備、決算と自然経営', peak: '春のツアー予約開始' },
  3: { work: '春番茶', theme: '芽吹き、春番茶', peak: '新茶予約開始' },
  4: { work: '白茶', theme: '白茶づくり', peak: '新茶予約・ツアー' },
  5: { work: '森のお茶作り（紅茶・釜炒り茶・ウーロン茶・煎茶）', theme: '一番茶、密着ライブ', peak: '新茶発売（年間最大の山）' },
  6: { work: '碾茶', theme: '碾茶・抹茶づくり', peak: '抹茶ブランドの山' },
  7: { work: 'ほうじ茶用番茶', theme: '夏の水出し、ほうじ茶', peak: '夏ギフト・水出し' },
  8: { work: '休み', theme: '舞台裏、家族、インターンの声', peak: '再投稿・過去回の総集編' },
  9: { work: '発酵番茶（あかばんちゃ・くろばんちゃ）', theme: '発酵番茶、天日干し', peak: '秋の新商品' },
  10: { work: 'はなばんちゃ', theme: '秋の番茶、カフェ工事の進捗', peak: '秋冬ギフト予約開始' },
  11: { work: '三年番茶', theme: '三年番茶の仕込み、冬の養生', peak: 'ギフト・お歳暮、ふるさと納税' },
  12: { work: '三年番茶', theme: '一年の振り返り、茶事', peak: 'ギフト最盛期、ふるさと納税駆け込み' },
};

// 週間投稿スケジュール（0=日曜）
export const WEEKLY = {
  0: { instagram: 'インスタライブ（月1）または休み', youtube: '', other: '', work: '翌週の振り返り（15分）', pillar: null },
  1: { instagram: 'リール：畑と季節', youtube: 'ショート', other: 'Threads、Pinterest', work: '週の投稿予約をまとめて設定', pillar: 'field' },
  2: { instagram: 'カルーセル：淹れ方・商品', youtube: '', other: 'LINE配信（隔週）', work: '', pillar: 'product' },
  3: { instagram: 'リール：自然茶道', youtube: '長尺公開', other: 'ポッドキャスト配信、ブログ公開', work: '撮影日（畑・茶室）', pillar: 'sado' },
  4: { instagram: 'ストーリーズで質問箱', youtube: 'ショート', other: 'メルマガ（隔週）', work: '', pillar: null },
  5: { instagram: 'リール：人と暮らし', youtube: '', other: 'Threads', work: '編集日（Riverside・DaVinci）', pillar: 'people' },
  6: { instagram: 'カルーセル：思想と言葉', youtube: 'ショート', other: 'Pinterest', work: '', pillar: 'words' },
};

// 媒体別の売上を見るため、yusando.com へのリンクに UTM を付ける
const UTM_SOURCE = { x: 'x', instagram: 'instagram', threads: 'threads', facebook: 'facebook', line: 'line', bluesky: 'bluesky', mastodon: 'mastodon',
  youtube: 'youtube', shopify_blog: 'blog', note: 'note', newsletter: 'newsletter', pinterest: 'pinterest', tiktok: 'tiktok', red: 'xiaohongshu' };
const UTM_MEDIUM = { newsletter: 'email', line: 'line', shopify_blog: 'blog' };
const URL_RE = /https?:\/\/[^\s<>"'「」『』（）、。]+/g;

export function withUtm(platformId, text, { campaign = 'sns' } = {}) {
  return String(text ?? '').replace(URL_RE, (raw) => {
    const url = raw.replace(/[.,;:!?)]+$/, '');
    const tail = raw.slice(url.length);
    let u;
    try {
      u = new URL(url);
    } catch {
      return raw;
    }
    if (!/(^|\.)yusando\.com$/i.test(u.hostname) || u.searchParams.has('utm_source')) return raw;
    u.searchParams.set('utm_source', UTM_SOURCE[platformId] ?? platformId);
    u.searchParams.set('utm_medium', UTM_MEDIUM[platformId] ?? 'social');
    u.searchParams.set('utm_campaign', campaign);
    return u.toString() + tail;
  });
}
