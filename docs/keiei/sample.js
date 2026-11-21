// 経営評定：架空のサンプルデータ（実在の会社の数字ではありません）。
// 初回起動時と「サンプルに戻す」で使う。毎回同じ数字になるよう、乱数は固定の種から作る。
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KEIEI_SAMPLE = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function rng(seed) {
    var x = seed >>> 0;
    return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
  }
  function addM(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + "-" + String(m + 1).padStart(2, "0");
  }
  var r1000 = function (v) { return Math.round(v / 1000) * 1000; };

  // 月ごとの季節の波（1月〜12月）。新茶の5月と年末ギフトの12月が山。
  var SEASON = [0.85, 0.8, 0.95, 1.05, 1.35, 1.15, 1.0, 0.9, 0.95, 1.0, 1.05, 1.4];

  var CASTLES = [
    { id: "c1", name: "オンラインショップ", slot: 0, base: 1150000, costR: 0.38, tgt: 1.03, stock: 2.2, rep: 42, grow: 0.004 },
    { id: "c2", name: "卸（茶舗・カフェ）", slot: 1, base: 820000, costR: 0.56, tgt: 1.02, stock: 3.0, rep: 86, grow: -0.004 },
    { id: "c3", name: "茶道教室", slot: 2, base: 320000, costR: 0.18, tgt: 1.0, stock: 0, rep: 91, grow: 0.002, flat: true },
    { id: "c4", name: "イベント出店", slot: 3, base: 260000, costR: 0.45, tgt: 0.98, stock: 1.2, rep: null, grow: 0.0, jumpy: true },
    { id: "c5", name: "定期便", slot: 4, base: 430000, costR: 0.4, tgt: 1.05, stock: 0.9, rep: 79, grow: 0.012, flat: true },
    { id: "c6", name: "法人ギフト", slot: 5, base: 180000, costR: 0.5, tgt: 1.0, stock: 1.5, rep: 64, grow: 0.0, gift: true }
  ];

  function build() {
    var rand = rng(20261021);
    var first = "2025-10", current = "2026-10";
    var months = {}, chronicle = [];
    var cash = 4300000;
    var notes = {
      "2025-10": "秋の茶会の注文が戻り、まずまずの滑り出し。",
      "2025-11": "年末ギフトの仕込みで在庫を厚くした。",
      "2025-12": "ギフト商戦で石高（売上）が山。法人の注文が好調。",
      "2026-01": "年明けは静か。定期便の申込が少しずつ増える。",
      "2026-02": "一年で一番の谷。経費を見直した。",
      "2026-03": "卒業・送別の贈答で持ち直す。",
      "2026-04": "新茶の予約受付を開始。",
      "2026-05": "新茶で過去最高の月。発送が追いつかず残業。",
      "2026-06": "新茶の勢いが続く。卸先が1軒増えた。",
      "2026-07": "お中元で法人ギフトが伸びた。",
      "2026-08": "暑さで店頭が落ち込み、通販に助けられた。",
      "2026-09": "卸の注文がやや細る。次の手を考える月。"
    };
    for (var i = 0; ; i++) {
      var ym = addM(first, i);
      var mo = +ym.slice(5, 7);
      var mc = {}, sales = 0, cost = 0, target = 0;
      CASTLES.forEach(function (c) {
        var season = c.flat ? 1 + (SEASON[mo - 1] - 1) * 0.25 : SEASON[mo - 1];
        if (c.gift) season = mo === 12 ? 4.2 : mo === 7 ? 2.6 : mo === 6 || mo === 11 ? 1.4 : 0.7;
        var noise = c.jumpy ? 0.55 + rand() * 0.9 : 0.93 + rand() * 0.14;
        var s = c.base * season * (1 + c.grow * i) * noise;
        var t = c.base * season * (1 + c.grow * i) * c.tgt;
        if (c.jumpy) t = c.base * (mo === 10 || mo === 11 || mo === 5 ? 1.5 : 0.9);
        var cr = c.costR * (0.96 + rand() * 0.08);
        var rep = c.rep === null ? null : Math.round(c.rep + (rand() - 0.5) * 4);
        mc[c.id] = { sales: r1000(s), cost: r1000(s * cr), target: r1000(t), stock: r1000(c.base * c.costR * c.stock * (0.85 + rand() * 0.3)), repeat: rep };
      });
      // 物語のための手直し（今月＝2026年10月）
      if (ym === "2026-09") { mc.c5.repeat = 78; mc.c2.sales = r1000(mc.c2.target * 0.84); }
      if (ym === current) {
        mc.c1.sales = r1000(mc.c1.target * 1.06);
        mc.c2.sales = r1000(mc.c2.target * 0.68); mc.c2.cost = r1000(mc.c2.sales * 0.6); mc.c2.stock = 2350000;
        mc.c3.sales = r1000(mc.c3.target * 1.02);
        mc.c4.sales = r1000(mc.c4.target * 0.83);
        mc.c5.sales = r1000(mc.c5.target * 0.95); mc.c5.repeat = 71;
        mc.c6.sales = r1000(mc.c6.target * 1.1);
      }
      CASTLES.forEach(function (c) { sales += mc[c.id].sales; cost += mc[c.id].cost; target += mc[c.id].target; });
      var sga = r1000(1420000 + sales * 0.06 + (rand() - 0.5) * 60000);
      var op = sales - cost - sga;
      cash = r1000(cash + op * 0.6 - 120000);
      months[ym] = { c: mc, sga: sga, cash: cash };
      if (ym === current) break;
      chronicle.push({ ym: ym, sales: sales, op: op, rate: target ? sales / target : null, note: notes[ym] || "" });
    }

    return {
      v: 1,
      name: "悠三堂",
      current: current,
      seq: 100,
      castles: CASTLES.map(function (c) { return { id: c.id, name: c.name, slot: c.slot }; }),
      months: months,
      generals: [
        { id: "g1", name: "青葉 誠之助", role: "家老", tou: 78, bu: 55, chi: 70, sei: 82, castle: "c2" },
        { id: "g2", name: "香坂 りん", role: "侍大将", tou: 62, bu: 72, chi: 88, sei: 58, castle: "c1" },
        { id: "g3", name: "白川 千代", role: "茶頭", tou: 70, bu: 60, chi: 66, sei: 74, castle: "c3" },
        { id: "g4", name: "村雨 新兵衛", role: "足軽大将", tou: 48, bu: 84, chi: 50, sei: 44, castle: "c6" },
        { id: "g5", name: "水沢 小夜", role: "勘定奉行", tou: 64, bu: 40, chi: 62, sei: 91, castle: "c5" }
      ],
      measures: [
        { id: "m1", title: "新茶ティーバッグの試作", kind: "kaikon", castle: "c1", general: "g2", cost: 180000, due: "2026-11-30", status: "doing" },
        { id: "m2", title: "年末ギフトのDM送付", kind: "shogyo", castle: "c6", general: "g4", cost: 120000, due: "2026-11-15", status: "todo" },
        { id: "m3", title: "焙煎機の入れ替え", kind: "fushin", castle: "c2", general: "g1", cost: 450000, due: "2026-12-20", status: "todo" },
        { id: "m4", title: "カフェ3店舗への商談", kind: "gaiko", castle: "c2", general: "g1", cost: 0, due: "2026-09-30", status: "doing" },
        { id: "m5", title: "秋のクラフト市への出店申込", kind: "choryaku", castle: "c4", general: "", cost: 30000, due: "2026-10-10", status: "done" },
        { id: "m6", title: "発送担当アルバイトの採用", kind: "jinji", castle: "", general: "g5", cost: 60000, due: "2026-12-31", status: "todo" },
        { id: "m7", title: "定期便の解約理由アンケート", kind: "shogyo", castle: "c5", general: "g5", cost: 20000, due: "2026-10-31", status: "doing" }
      ],
      chronicle: chronicle
    };
  }

  return { build: build };
});
