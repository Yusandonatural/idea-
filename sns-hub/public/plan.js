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

// ── 引き継ぎ書「SNS運用Webアプリ」（2026-10）：毎日の運用のための型 ──

// 次の一歩（投稿ごとに1つだけ置く着地先）。5つの入り口は yusando.com のページ
export const NEXT_STEPS = [
  { key: 'buy', label: '買う', path: '/pages/kau' },
  { key: 'learn', label: '学ぶ', path: '/pages/shiru' },
  { key: 'visit', label: '体験する', path: '/pages/tazuneru' },
  { key: 'drink', label: '飲む', path: '/pages/nomu' },
  { key: 'grow', label: '広がる', path: '/pages/orosu' },
  { key: 'line', label: 'LINE登録' },
  { key: 'mail', label: 'メルマガ登録' },
  { key: 'none', label: '今回は置かない' },
];
export const nextStepOf = (key) => NEXT_STEPS.find((s) => s.key === key) ?? null;
// 柱ごとの既定の着地先
export const PILLAR_NEXT = { field: 'buy', sado: 'learn', words: 'line', people: 'visit', product: 'buy' };

// UTM付きリンク（入り口・媒体・キャンペーンから作る）
export function entranceUrl(stepKey, platformId, campaign = 'sns') {
  const s = nextStepOf(stepKey);
  if (!s?.path) return null;
  return withUtm(platformId, `https://yusando.com${s.path}`, { campaign });
}

// 媒体別の制作ルール：系統（言葉・映像・写真）・素材元・作り方・出す日・次の一歩、使うSNS
export const CHANNEL_RULES = [
  { key: 'ig_reel', label: 'Instagram リール', stream: '映像', source: '水曜撮影＋長尺の切り出し', how: '30〜60秒、冒頭2秒に音・手元・湯気、字幕入り', days: '月・水・金', next: '5つの入り口、商品タグ', platforms: ['instagram', 'facebook'] },
  { key: 'ig_carousel', label: 'Instagram カルーセル', stream: '言葉', source: '音声メモの要点', how: 'Claudeが5〜8枚の構成を作成', days: '火・土', next: '保存を促す一文、商品タグ', platforms: ['instagram'] },
  { key: 'ig_story', label: 'Instagram ストーリーズ', stream: '写真', source: '毎日のスマホ撮影', how: '加工なし1〜3枚、週1回は質問箱', days: '毎日', next: 'リンクスタンプでLINE登録・商品', platforms: [] },
  { key: 'facebook', label: 'Facebook', stream: '映像', source: 'Instagramのリール', how: '自動クロス投稿', days: 'Instagramと同時', next: '同上', platforms: ['facebook'] },
  { key: 'yt_long', label: 'YouTube 長尺', stream: '映像', source: 'Riverside収録', how: '10〜20分、チャプターと説明文をClaudeが作成', days: '水', next: '概要欄にブログ・商品・LINE', platforms: ['youtube'] },
  { key: 'yt_short', label: 'YouTube ショート', stream: '映像', source: 'リールと同じ動画', how: 'そのまま転用', days: '月・木・土', next: '長尺へ誘導', platforms: ['youtube'] },
  { key: 'podcast', label: 'ポッドキャスト', stream: '映像', source: '長尺と同じ収録の音声', how: '音声を書き出し、ショーノート作成', days: '水', next: 'ショーノートにブログ・LINE', platforms: [] },
  { key: 'blog', label: 'ブログ・note', stream: '言葉', source: '音声メモ', how: '書き言葉化（朝のお話しスキル）', days: '水', next: '商品・体験ページ', platforms: ['shopify_blog', 'note'] },
  { key: 'threads', label: 'Threads・X', stream: '言葉', source: '音声メモの一言', how: '140字前後を週分まとめて作る', days: '毎日', next: '週1回だけブログやリールへ', platforms: ['threads', 'x'] },
  { key: 'tiktok', label: 'TikTok', stream: '映像', source: 'リールと同じ動画', how: '転用、キャプションを短く', days: '週3', next: 'プロフィールのリンク', platforms: ['tiktok'] },
  { key: 'pinterest', label: 'Pinterest', stream: '写真', source: '撮影素材の写真', how: '縦長写真＋英語タイトル', days: '週5（予約）', next: '英語ページ・米国向け商品', platforms: ['pinterest'] },
  { key: 'line', label: 'LINE公式', stream: '言葉', source: '今週一番売りたいもの', how: '1通1テーマ、写真1枚＋短文＋クーポンや予約', days: '隔週火', next: '商品・予約ページ', platforms: ['line'] },
  { key: 'newsletter', label: 'メルマガ', stream: '言葉', source: 'ブログ＋今週の投稿', how: '週のまとめ＋商品', days: '隔週木', next: '商品・ギフト特集', platforms: ['newsletter'] },
  { key: 'red', label: '小紅書', stream: '写真', source: '撮影素材の写真', how: '写真4〜9枚＋中国語の短文', days: '週2', next: '海外向けページ（試験）', platforms: ['red'] },
];
export const ruleOf = (key) => CHANNEL_RULES.find((r) => r.key === key) ?? null;

// 週間スケジュールの投稿枠（0=日曜）。この型から先の4週間の枠を並べる
// every: 'odd'/'even' は隔週（その年の週番号の奇数・偶数）、monthly は月の第1週だけ
export const WEEKLY_SLOTS = {
  0: [{ rule: 'ig_reel', label: 'インスタライブ（月1）', monthly: true }],
  1: [{ rule: 'ig_reel', pillar: 'field', label: 'リール：畑と季節' }, { rule: 'yt_short', label: 'YouTube ショート' }, { rule: 'threads', label: 'Threads' }, { rule: 'pinterest', label: 'Pinterest' }],
  2: [{ rule: 'ig_carousel', pillar: 'product', label: 'カルーセル：商品と淹れ方' }, { rule: 'line', label: 'LINE（隔週）', every: 'even' }],
  3: [{ rule: 'ig_reel', pillar: 'sado', label: 'リール：自然茶道' }, { rule: 'yt_long', label: 'YouTube 長尺' }, { rule: 'podcast', label: 'ポッドキャスト' }, { rule: 'blog', label: 'ブログ' }],
  4: [{ rule: 'ig_story', label: 'ストーリーズ質問箱' }, { rule: 'yt_short', label: 'YouTube ショート' }, { rule: 'newsletter', label: 'メルマガ（隔週）', every: 'odd' }],
  5: [{ rule: 'ig_reel', pillar: 'people', label: 'リール：人と暮らし' }, { rule: 'threads', label: 'Threads' }],
  6: [{ rule: 'ig_carousel', pillar: 'words', label: 'カルーセル：思想と言葉' }, { rule: 'yt_short', label: 'YouTube ショート' }, { rule: 'pinterest', label: 'Pinterest' }],
};
export const DAILY_SLOTS = [{ rule: 'ig_story', label: 'ストーリーズ 1〜3枚' }];

// 'YYYY-MM-DD' の扱い（日付だけを扱うので UTC で計算する）
const parseDay = (s) => new Date(`${s}T00:00:00Z`);
export const dayStr = (d) => d.toISOString().slice(0, 10);
export function addDays(s, n) {
  const d = parseDay(s);
  d.setUTCDate(d.getUTCDate() + n);
  return dayStr(d);
}
export const weekdayOf = (s) => parseDay(s).getUTCDay();
export function mondayOf(s) {
  const wd = weekdayOf(s);
  return addDays(s, wd === 0 ? -6 : 1 - wd);
}
function isoWeek(s) {
  const d = parseDay(s);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - y) / 86400e3 + 1) / 7);
}

// その日の投稿枠。id は「日付:曜日の何番目」で、投稿とひも付ける鍵になる
export function slotsOn(s) {
  const wd = weekdayOf(s);
  const wk = isoWeek(s);
  const day = parseDay(s).getUTCDate();
  const list = (WEEKLY_SLOTS[wd] ?? []).map((x, i) => ({ ...x, id: `${s}:${wd}${i}` }))
    .filter((x) => (x.every === 'even' ? wk % 2 === 0 : x.every === 'odd' ? wk % 2 === 1 : true) && (!x.monthly || day <= 7));
  return [...list, ...DAILY_SLOTS.map((x, i) => ({ ...x, id: `${s}:d${i}` }))].map((x) => ({ ...x, date: s }));
}

// 週次ワークフロー（週1回まとめて作り、毎日少しずつ出す）。weekday: null は毎日
export const WORKFLOW = [
  { step: 0, weekday: null, name: '素材', about: '朝の音声メモ、作業風景をストーリーズに1〜3枚', owner: '礒﨑さん', screen: '今日 →「素材から展開」に文字起こしを貼る' },
  { step: 1, weekday: 1, name: '企画（30分）', about: '先週の数字を見る、伸びた型を確認、5本柱の割り振り、長尺1本・リール3本のネタ選び', owner: '礒﨑さん＋スタッフ', screen: '今日 → 先週の数字と伸びた投稿、今週の枠' },
  { step: 2, weekday: 3, name: '撮影（半日）', about: '畑・茶室で撮影、Riverside収録、冒頭2秒用の音・手元・湯気カット', owner: '礒﨑さん＋スタッフ', screen: '予約・下書き → 今週のリール台本' },
  { step: 3, weekday: 4, name: '分解', about: '音声メモからブログ・台本・Threads・カルーセル・メルマガ・LINE・英仏中キャプションの下書き', owner: 'Claude', screen: '今日 →「素材から展開」で一括作成' },
  { step: 4, weekday: 5, name: '編集・予約', about: '長尺編集、見どころ30〜60秒を3本、UTMと次の一歩を入れて翌週分を予約、TikTok・ショート・Pinterestへ転用', owner: 'スタッフ', screen: '予約・下書き → 投稿カードを予約、複製で転用' },
  { step: 5, weekday: 0, name: '振り返り（15分）', about: 'KPI記録、続ける型とやめる型を1つずつ決める', owner: '礒﨑さん', screen: '数字 → 今週の数字と続ける型・やめる型' },
];

// キャンペーン（月で期間を持つ。from を過ぎたら通年のものもある）
export const CAMPAIGNS = [
  { name: '秋冬ギフト', when: '10月下旬〜12月', angle: '包装・手書き札・贈る人の声', dest: '買う', months: [10, 11, 12] },
  { name: 'ふるさと納税', when: '11月〜12月末', angle: '奈良・都祁の茶畑を応援', dest: 'ふるさと納税サイト', months: [11, 12] },
  { name: '定期便（お茶ごよみ便）', when: '2027年1月〜', angle: '四季で届くお茶の開封', dest: '買う', from: '2027-01-01' },
  { name: 'NATURAL MATCHA STANDARD', when: '2026年秋〜', angle: '白と黒・抹茶×禅・5th Place', dest: '専用ページ・海外', from: '2026-09-01' },
  { name: 'TEA TOUR・リトリート', when: '春・秋', angle: '参加者の一日', dest: '/pages/tea-tour', months: [3, 4, 5, 9, 10, 11] },
  { name: '日本自然茶協会セミナー', when: '通年', angle: '各回をスライドとYouTubeで', dest: '学ぶ', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { name: 'インスタライブ販売会', when: '年2回（新茶・限定品）', angle: '新茶・限定品を淹れて案内', dest: '買う', months: [5, 12] },
];
export function activeCampaigns(s) {
  const m = parseDay(s).getUTCMonth() + 1;
  return CAMPAIGNS.filter((c) => (c.from ? s >= c.from : c.months.includes(m)));
}

// 数値目標
export const TARGETS = {
  followers: { start: 4500, startDate: '2026-10-01', goal: 10000, deadline: '2027-02-28' },
  igSalesMonthly: 1000000,
  storeSalesMonthly: 2500000,
  listSignups: 3000,
};
// その日までにいるべきフォロワー数（開始から期限まで一直線）
export function followerPace(s) {
  const f = TARGETS.followers;
  const t = (parseDay(s) - parseDay(f.startDate)) / (parseDay(f.deadline) - parseDay(f.startDate));
  return Math.round(f.start + (f.goal - f.start) * Math.min(Math.max(t, 0), 1));
}

// 90日ロードマップ（「SNSフル活用 ToDo」より）の初期項目
export const ROADMAP = {
  '今週': ['プロフィールとリンクを5つの入り口へ', 'ハイライト並べ替え', 'LINE登録者数の確認', 'LINE登録特典の中身を決める', '秋冬ギフトリールの撮影計画', '鳳次郎ほうじ茶TBの公開状況確認'],
  '0〜30日': ['Instagramショッピング連携', 'LINE登録特典とリッチメニュー', '全リンクにUTM', 'DM自動返信', '秋冬ギフトのリール3本', 'ギフト特集ページ', 'ふるさと納税の告知素材', '週間スケジュールの担当者決め'],
  '31〜60日': ['週間スケジュール通りに運用', 'ふるさと納税・ギフトの集中投稿', 'YouTube長尺を週1', 'インスタライブ販売会を1回'],
  '61〜90日': ['伸びた型を3つに絞る', 'TikTok・Pinterest・Threadsへ転用開始', '英語キャプションと抹茶ブランド発信', '定期便の告知', '小紅書の判断'],
  'アプリ': ['未決事項を決める', '土台', '見る画面', '作る機能', '測る機能', '受け入れ確認'],
};

// 投稿カードの状態（下書きは アイデア／制作中 を選ぶ。予約・公開は投稿の状態から）
export const STAGES = { idea: 'アイデア', making: '制作中' };
export function cardState(p) {
  if (!p) return { key: 'empty', label: '未着手' };
  if (['done', 'partial'].includes(p.status)) return { key: 'done', label: '公開済み' };
  if (p.status === 'failed') return { key: 'failed', label: '失敗' };
  if (['scheduled', 'publishing'].includes(p.status)) return { key: 'scheduled', label: '予約済み' };
  return p.stage === 'idea' ? { key: 'idea', label: 'アイデア' } : { key: 'making', label: '制作中' };
}
