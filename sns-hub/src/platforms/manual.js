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
