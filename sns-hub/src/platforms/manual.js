// API で投稿できない先。文章だけ作って、コピーして手で貼る
function manual({ id, label, color, url, note, aiGuide, text, title }) {
  return {
    id, label, color, note, aiGuide, manual: true,
    limits: { text, title, images: 0, ignoreMedia: true, imageTypes: [] },
    fields: [],
    async verify() {
      return { name: label };
    },
    async publish() {
      return { manual: true, url };
    },
  };
}

export const note = manual({
  id: 'note',
  label: 'note',
  color: '#41c9b4',
  url: 'https://note.com/notes/new',
  text: 30000,
  title: 100,
  note: 'note には投稿用の公式APIがないため、文章を用意します。「コピー」してから note の編集画面に貼ってください',
  aiGuide: 'noteの記事。titleは読みたくなる具体的な一文（30〜40字）。textは体験や想いが伝わる読み物：導入→「## 見出し」で2〜3章→結び。2000〜3000字。空行で段落を分ける。',
});

export const tiktok = manual({
  id: 'tiktok',
  label: 'TikTok',
  color: '#111111',
  url: 'https://www.tiktok.com/upload',
  text: 2200,
  note: 'TikTok の投稿APIは審査が必要なため、説明文を用意します。リール用の動画を TikTok アプリで選び、「コピー」した説明文を貼ってください',
  aiGuide: 'TikTok の動画説明（若年層・海外への拡散）。1行目で引きつける短い一文、続けて2〜3行、最後にハッシュタグ3〜5個（#日本茶 #matcha など英語も可）。150字前後。',
});

export const red = manual({
  id: 'red',
  label: '小紅書（RED）',
  color: '#ff2442',
  url: 'https://creator.xiaohongshu.com/publish/publish',
  text: 1000,
  title: 20,
  note: '小紅書には公式の投稿APIがないため、中国語の文章を用意します。写真と一緒に、コピーして小紅書のアプリか作成ページに貼ってください',
  aiGuide: '小紅書（RED）の投稿。中国語圏（台湾・香港・中国本土）の茶愛好家向けに、すべて中国語（簡体字）で書く。titleは20字以内の目を引く見出し（絵文字1つ可）。textは発酵番茶・古美術・茶道具・自然栽培などの体験を、短い段落と絵文字少しで300〜500字、最後に話題タグ（#日本茶 #自然栽培 など中国語のタグ）を5個。',
});

export const newsletter = manual({
  id: 'newsletter',
  label: 'メルマガ',
  color: '#b5651d',
  url: null,
  text: 20000,
  title: 60,
  note: 'メルマガの下書きを作ります。件名と本文をコピーして配信サービスに貼ってください',
  aiGuide: 'お客さま向けメールマガジン。titleは件名（25〜35字、開きたくなる具体的な内容）。textは本文：「いつも悠三堂をご愛顧いただき、ありがとうございます。」で始め、季節のひとこと→本題→ご案内（URL）→結びの挨拶→署名「悠三堂 礒﨑遼太郎」。800〜1500字。',
});
