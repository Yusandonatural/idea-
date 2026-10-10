/* 入口ページ（kids/）に並べるアプリ。アプリを増やすときは1つ足す。
 * id は KidsPoints.award({ app: id }) に渡すのと同じもの。url が null のものは「じゅんびちゅう」と出る。
 * 同じサイト内の url（../history/ など）は、まだ公開されていなければ 自動で「じゅんびちゅう」になる。
 * points:false のアプリは ポイント表示を出さない（記録はそれぞれのアプリ側にある）。 */
window.KIDS_APPS = [
  { id: "study", name: "まいにち30ぷん", kana: "えいご・さんすう", desc: "10ぷん べんきょうして ゲームの じかんを もらおう", icon: "📚", color: "#2f855a",
    url: "https://yusandonatural.github.io/family/study/" },
  { id: "eikaiwa", name: "えいかいわ", kana: "えいかいわコース", desc: "ようじから 中3まで 45ステップで えいごで はなせるように", icon: "🗣️", color: "#7c5cd6",
    url: "https://yusandonatural.github.io/family/eikaiwa/" },
  { id: "hyakunin", name: "百人一首", kana: "ひゃくにんいっしゅ", desc: "100しゅを 5つの まきで おぼえる", icon: "🎴", color: "#d9485f",
    url: "../hyakunin/" },
  { id: "nihonshi", name: "日本史", kana: "れきしドリル", desc: "きゅうせっきから げんだいまで クイズで 5しゅう", icon: "📜", color: "#b7791f",
    url: "../history/" },
  { id: "sekaishi", name: "世界史", kana: "せかいしドリル", desc: "こだいオリエントから げんだいまで クイズで 5しゅう", icon: "🌍", color: "#2b6cb0",
    url: "../world/" },
  { id: "chiri", name: "地理", kana: "ちりドリル", desc: "ちずの よみかたから せかいの ちいきまで クイズで 5しゅう", icon: "🗺️", color: "#319795",
    url: "../geo/" },
  { id: "kozukai", name: "おてつだい こづかい帳", kana: "おてつだい・おこづかい", desc: "おてつだいを きろくして おこづかいを ためる", icon: "🪙", color: "#dd6b20",
    url: "https://yusandonatural.github.io/family/", points: false },
];
/* 一覧にないアプリから来たポイントや、共通のポイントの見せ方 */
window.KIDS_APP_EXTRA = {
  bonus: { name: "まいにちボーナス", icon: "🌅", color: "#dd6b20" },
};
