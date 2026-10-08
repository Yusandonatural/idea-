/* 教材の入れ物。data/u01.js 〜 u16.js が HIST.addUnit で単元を足す（形式は data/SCHEMA.md）。
 * アプリ本体は ../history/app.js と ../history/style.css を日本史版・世界史版と共用する。 */
window.HIST = {
  app: {
    name: "ちりドリル", key: "chiri:v1",
    welcomeTitle: "日本と世界の地理を、<br>クイズで5周しよう",
    welcomeLead: "はにわ先生といっしょに、地図の読み方から世界の地域まで。<br>小学5年生のことばから始めて、早慶の一問まで少しずつ。",
    footer: "内容は小学校〜高校の教科書（地理総合・地理探究）と大学入試の範囲にそっています。統計は2020年代の値をもとにしています。まちがいに気づいたら知らせてください。",
    finale: "5周完走！ もう受験の地理はこわくない",
    loopName: "全単元を5周", orderKind: "ならべかえ", orderAcross: false,
    tlName: "データ帳", tlIcon: "📊", searchHint: "地名・用語でさがす",
  },
  units: [],
  addUnit: function (u) { this.units.push(u); },
  /* 全単元を5周する。1周＝1ステージ。ステージの番号＝教材のレベル(lv) */
  stages: [
    { lv: 1, name: "小学", title: "地図となかよくなる", color: "#2fae66", icon: "🌱", grades: "小5〜中1" },
    { lv: 2, name: "中学", title: "地域の特色をつかむ", color: "#2f86d9", icon: "📘", grades: "中学・高校入試" },
    { lv: 3, name: "高校", title: "共通テストで点がとれる", color: "#8a55d6", icon: "🎓", grades: "地理総合・地理探究・共通テスト" },
    { lv: 4, name: "難関大", title: "統計と理由で差をつける", color: "#0f7c6b", icon: "🌏", grades: "国公立二次・MARCH・関関同立" },
    { lv: 5, name: "早慶", title: "早慶の一問を取りきる", color: "#22325a", icon: "💎", grades: "早稲田レベル（統計・地誌の細部）" },
  ],
};
