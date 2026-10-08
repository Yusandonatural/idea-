/* 教材の入れ物。data/u01.js 〜 u15.js が HIST.addUnit で単元を足す（形式は data/SCHEMA.md）。 */
window.HIST = {
  app: {
    name: "れきしドリル", key: "rekishi:v1",
    welcomeTitle: "日本の歴史を、<br>クイズで4周しよう",
    welcomeLead: "はにわ先生といっしょに、旧石器から現代まで。<br>小学6年生のことばから始めて、大学受験の一問まで少しずつ。",
    footer: "内容は小学校〜高校の教科書と大学入試の範囲にそっています。まちがいに気づいたら知らせてください。",
    finale: "4周完走！ もう受験の日本史はこわくない",
  },
  units: [],
  addUnit: function (u) { this.units.push(u); },
  /* 通史を4周する。1周＝1ステージ。ステージの番号＝教材のレベル(lv) */
  stages: [
    { lv: 1, name: "小学6年", title: "人物とできごとでつかむ", color: "#2fae66", icon: "🌱", grades: "小6〜中1" },
    { lv: 2, name: "中学", title: "流れとしくみがわかる", color: "#2f86d9", icon: "📘", grades: "中学・高校入試" },
    { lv: 3, name: "高校", title: "共通テストで点がとれる", color: "#8a55d6", icon: "🎓", grades: "高1〜高3・共通テスト" },
    { lv: 4, name: "受験", title: "難関大の一問を落とさない", color: "#d9452b", icon: "🏯", grades: "国公立二次・難関私大" },
  ],
};
