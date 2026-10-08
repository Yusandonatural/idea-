/* 入口ページ（kids/）に並べるアプリ。アプリを増やすときは1つ足す。
 * id は KidsPoints.award({ app: id }) に渡すのと同じもの。url が null のものは「じゅんびちゅう」と出る。 */
window.KIDS_APPS = [
  { id: "hyakunin", name: "百人一首", kana: "ひゃくにんいっしゅ", icon: "🎴", color: "#d9485f", url: null },
  { id: "nihonshi", name: "日本史", kana: "にほんし", icon: "🏯", color: "#b7791f", url: null },
  { id: "study", name: "まいにち30ぷん", kana: "えいご・さんすう", icon: "📚", color: "#2f855a", url: "https://yusandonatural.github.io/family/study/" },
];
/* 一覧にないアプリから来たポイントや、共通のポイントの見せ方 */
window.KIDS_APP_EXTRA = {
  bonus: { name: "まいにちボーナス", icon: "🌅", color: "#dd6b20" },
};
