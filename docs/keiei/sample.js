// 経営評定：架空のサンプルデータ（実在の会社の数字ではありません）。
// 初回起動時と「サンプルに戻す」で使う。毎回同じ数字になるよう、乱数は固定の種から作る。
(function (root, factory) {
  var logic = typeof module === "object" && module.exports ? require("./logic.js") : root.KEIEI;
  var api = factory(logic);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KEIEI_SAMPLE = api;
})(typeof self !== "undefined" ? self : this, function (L) {
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
      "2025-12": "ギフト商戦で収入（売上）が山。法人の注文が好調。",
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
      chronicle.push({ kind: "close", ym: ym, sales: sales, op: op, rate: target ? sales / target : null, note: notes[ym] || "" });
    }

    return {
      v: 3,
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
      kokuPerA: 1000,
      targetKoku: 1000000,
      // 圃場：自領のほか、獲得・開墾中・調略中・狙いの土地もある（国取り）
      fields: [
        { id: "f1", name: "東の茶畑", area: 120, crop: "茶・やぶきた", general: "g3", memo: "一番茶の主力。南向きで霜に強い。", slot: 0, status: "own", since: "2025-10", harvestKg: 15600 },
        { id: "f2", name: "川沿いの茶畑", area: 85, crop: "茶・さえみどり", general: "g2", memo: "被覆栽培で玉露風に仕上げる。", slot: 1, status: "own", since: "2025-10", harvestKg: 9800 },
        { id: "f3", name: "山の上の茶園", area: 60, crop: "茶・おくみどり", general: "g1", memo: "朝霧が出る。手摘みの限定品用。", slot: 2, status: "own", since: "2025-10", harvestKg: 5400 },
        { id: "f4", name: "南斜面の畑", area: 45, crop: "茶・べにふうき（紅茶用）", general: "", memo: "昨年借りた畑。担当を決めたい。", slot: 3, status: "clearing", since: "2026-03", landlord: "h2", terms: "10年契約。更新時に見直し。", rent: 90000, clearCost: 350000 },
        { id: "f5", name: "試験圃場", area: 12, crop: "在来種ほか", general: "g5", memo: "新しい品種を少しずつ試す。", slot: 4, status: "own", since: "2025-10", harvestKg: 1100 },
        { id: "f6", name: "裏の畑", area: 30, crop: "茶・やぶきた（ほうじ茶用）", general: "g4", memo: "番茶・ほうじ茶の原料。", slot: 5, status: "own", since: "2025-10", harvestKg: 3300 },
        { id: "f7", name: "北の耕作放棄地", area: 150, crop: "（未定）", general: "g1", memo: "茶の木が残っている。再生できれば大きい。", slot: 6, status: "aim", since: "2026-10", landlord: "h3", terms: "持ち主は高齢。親戚と相談中とのこと。" },
        { id: "f8", name: "峠の茶園跡", area: 80, crop: "茶・在来種", general: "g1", memo: "道が細く、運搬に工夫がいる。", slot: 7, status: "talk", since: "2026-06", landlord: "h2", terms: "地代は年12万円で打診中。", rent: 120000, clearCost: 600000 },
        { id: "f9", name: "駅裏の空き畑", area: 25, crop: "茶・つゆひかり（予定）", general: "g4", memo: "体験摘み取りの会場にも使いたい。", slot: 8, status: "got", since: "2026-09", landlord: "h4", terms: "5年契約。", rent: 40000, clearCost: 150000 }
      ],
      // 諸家（取引先・地主など）。名前もアドレスも架空（example.com）
      houses: [
        { id: "h1", name: "茶舗 山科園", kind: "trade", contact: "山科 様", email: "info@yamashina-en.example.com", friend: 4, general: "g1", last: "2026-09-02", memo: "卸の一番のお得意様。年末に贈答用の追加注文あり。" },
        { id: "h2", name: "森川 喜一郎", kind: "landlord", contact: "森川 喜一郎", email: "morikawa@example.com", friend: 3, general: "g1", last: "2026-10-20", memo: "南斜面の畑・峠の茶園跡の持ち主。電話より手紙を好む。" },
        { id: "h3", name: "大野 フミ", kind: "landlord", contact: "大野 フミ", email: "", friend: 2, general: "g1", last: "2026-07-15", memo: "北の耕作放棄地の持ち主。メールは使わない。" },
        { id: "h4", name: "駅前不動産", kind: "landlord", contact: "西田", email: "nishida@ekimae-fudosan.example.com", friend: 3, general: "g4", last: "2026-09-28", memo: "駅裏の空き畑の管理。" },
        { id: "h5", name: "町役場 農林課", kind: "gov", contact: "農林課 ご担当者", email: "nourin@town.example.com", friend: 3, general: "g5", last: "2026-08-10", memo: "耕作放棄地の再生の補助金について相談。" },
        { id: "h6", name: "カフェ 灯", kind: "trade", contact: "佐伯", email: "hello@tomoshibi-cafe.example.com", friend: 5, general: "g2", last: "2026-11-05", memo: "定期便の法人契約。新商品の試飲に協力的。" },
        { id: "h7", name: "みどり通信", kind: "press", contact: "編集部", email: "henshu@midori-tsushin.example.com", friend: 3, general: "", last: "", memo: "地域の情報誌。新茶の時期に取材の打診をしたい。" }
      ],
      letters: [
        { id: "l1", date: "2026-11-05", house: "h6", subject: "新茶ティーバッグ試作のご案内（悠三堂）", body: "カフェ 灯\n佐伯様\n\nいつもお世話になっております。悠三堂の香坂でございます。\n新茶のティーバッグを試作いたしましたので、お店で試飲いただけないかと思いご連絡しました。\n来週お持ちしてもよろしいでしょうか。\n\n悠三堂\n香坂 りん" },
        { id: "l2", date: "2026-10-20", house: "h2", subject: "畑の境界確認の御礼（悠三堂）", body: "森川 喜一郎様\n\n先日は南斜面の畑の境界確認にお立ち会いいただき、誠にありがとうございました。\n開墾の進み具合は、あらためてご報告いたします。\n\n悠三堂\n青葉 誠之助" },
        { id: "l3", date: "2026-09-28", house: "h4", subject: "駅裏の畑のご契約の御礼（悠三堂）", body: "駅前不動産\n西田様\n\nこのたびは駅裏の畑のご契約、誠にありがとうございました。\n整備が済みましたら、体験摘み取りの会にもぜひお越しください。\n\n悠三堂\n村雨 新兵衛" }
      ],
      bugyo: L ? L.defaultBugyo() : [],
      reports: [
        { id: "r1", bugyo: "b4", date: "2026-11-10", request: "峠の茶園跡について、地主の森川様に交渉を進めたい旨の書状を書いてほしい。", report: "件名：峠の茶園跡についてのご相談（悠三堂）\n\n森川 喜一郎様\n\n朝夕冷え込む季節となりました。いつも大変お世話になっております。悠三堂の青葉でございます。\n先日は南斜面の畑の境界確認にお立ち会いいただき、ありがとうございました。おかげさまで開墾も順調に進んでおります。\n\nさて、以前ご相談いたしました峠の茶園跡について、あらためてお話を進めさせていただけないかと存じ、ご連絡いたしました。地代や運搬の道の整備など、森川様のご意向をうかがいながら決めさせていただければ幸いです。\n\n来月の上旬に一度ご挨拶に伺いたく存じますが、ご都合のよい日をお知らせいただけますでしょうか。\n\nどうぞよろしくお願い申し上げます。\n\n悠三堂\n青葉 誠之助" }
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
      chronicle: chronicle.concat([{ kind: "event", ym: "2026-09", date: "2026-09-28", text: "駅裏の空き畑を獲得、2.5万石（2反5a）" }])
    };
  }

  return { build: build };
});
