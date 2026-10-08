/* 教材の入れ物。data/u01.js 〜 u16.js が HIST.addUnit で単元を足す（形式は data/SCHEMA.md）。
 * アプリ本体は ../history/app.js と ../history/style.css を日本史版と共用する。 */
window.HIST = {
  app: {
    name: "せかいしドリル", key: "sekaishi:v1",
    welcomeTitle: "世界の歴史を、<br>クイズで4周しよう",
    welcomeLead: "はにわ先生といっしょに、古代オリエントから現代まで。<br>中学のことばから始めて、大学受験の一問まで少しずつ。",
    footer: "内容は中学〜高校の教科書（歴史総合・世界史探究）と大学入試の範囲にそっています。まちがいに気づいたら知らせてください。",
    finale: "4周完走！ もう受験の世界史はこわくない",
  },
  units: [],
  addUnit: function (u) { this.units.push(u); },
  /* 通史を4周する。1周＝1ステージ。ステージの番号＝教材のレベル(lv) */
  stages: [
    { lv: 1, name: "入門", title: "世界の大きな流れをつかむ", color: "#2fae66", icon: "🌱", grades: "中学・はじめての世界史" },
    { lv: 2, name: "基礎", title: "地域と時代をつなげる", color: "#2f86d9", icon: "📘", grades: "高1・歴史総合" },
    { lv: 3, name: "共通テスト", title: "共通テストで点がとれる", color: "#8a55d6", icon: "🎓", grades: "高2〜高3・世界史探究" },
    { lv: 4, name: "難関大", title: "難関大の一問を落とさない", color: "#c2410c", icon: "🌍", grades: "国公立二次・難関私大" },
  ],
};
