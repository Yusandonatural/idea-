/* 入口ページ（#/start）に並べる言語。
 * どのアプリも yusandonatural.github.io の上にあるので、この端末に保存された各言語の記録を
 * ここから読んで進み具合を表示できる（ログイン不要）。言語を増やすときは1つ足す。
 * summary(記録) → { started, day, done, xp, streak } */
(function () {
  function read(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } }
  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  /** 今日（今日がまだなら昨日）からさかのぼって、記録のある日が何日続いているか */
  function streak(days) {
    if (!days) return 0;
    var d = new Date(), n = 0;
    if (!days[ymd(d)]) d.setDate(d.getDate() - 1);
    while (days[ymd(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  window.LANGS = [
    {
      code: "zh", name: "中国語", native: "中文", flag: "🇨🇳", color: "green",
      url: "#/today",
      summary: function () {
        var S = read("lang90:zh");
        if (!S) return null;
        return { started: !!S.started, day: S.day || 1, done: Object.keys(S.finished || {}).length, xp: S.xp || 0, streak: streak(S.active) };
      },
    },
    {
      code: "fr", name: "フランス語", native: "Français", flag: "🇫🇷", color: "blue",
      url: "https://yusandonatural.github.io/french-90days/",
      summary: function () {
        var S = read("trois-formes-v2");
        if (!S) return null;
        var c = S.course, done = 0, day = 0;
        if (c) {
          for (var d = 1; d <= 90; d++) if (c.days[d] && c.days[d].done) done++;
          day = 90;
          for (var k = c.startDay; k <= 90; k++) if (!(c.days[k] && c.days[k].done)) { day = k; break; }
        }
        return { started: !!c, day: day, done: done, xp: S.xp || 0, streak: streak(S.days) };
      },
    },
  ];
})();
