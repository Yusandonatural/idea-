// 経営評定：計算ロジック（損益・予実・資金繰り予測・進言・CSV）。
// DOM を使わないので、ブラウザ（window.KEIEI）でも Node（require）でも読める。
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KEIEI = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MAX_CASTLES = 12;

  // 進言のしきい値（ここを変えると判定が変わる）
  var TH = {
    totalRateDanger: 0.8,   // 全社の達成率がこれ未満 → 急
    castleRateWarn: 0.7,    // 城の達成率がこれ未満 → 要注意
    castleRateNote: 0.9,    // 城の達成率がこれ未満 → 参考
    marginDropPt: 3,        // 全社の粗利率が直近平均よりこのポイント下がった → 要注意
    castleMarginDropPt: 5,  // 城の粗利率の低下 → 参考
    cashMonthsDanger: 1,    // 手元資金が月の支出のこの月数未満 → 急
    cashMonthsWarn: 2,      // 手元資金が月の支出のこの月数未満 → 要注意
    stockMonthsOver: 3,     // 在庫が月の原価のこの月数を超える → 要注意
    stockMonthsShort: 0.5,  // 在庫が月の原価のこの月数未満 → 参考
    repeatDropPt: 5         // リピート率が前月よりこのポイント下がった → 要注意
  };

  var KINDS = [
    { key: "kaikon", name: "開墾", biz: "商品開発" },
    { key: "shogyo", name: "商業", biz: "販促" },
    { key: "fushin", name: "普請", biz: "設備" },
    { key: "gaiko", name: "外交", biz: "取引先" },
    { key: "choryaku", name: "調略", biz: "新規開拓" },
    { key: "jinji", name: "人事", biz: "採用・育成" }
  ];
  var STATUSES = [
    { key: "todo", name: "未着手" },
    { key: "doing", name: "進行中" },
    { key: "done", name: "完了" }
  ];
  var WAFU = ["睦月", "如月", "弥生", "卯月", "皐月", "水無月", "文月", "葉月", "長月", "神無月", "霜月", "師走"];

  // ---------- 小道具 ----------
  function num(v) {
    var n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) ? n : 0;
  }
  function numOrNull(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) ? n : null;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function div(a, b) { return b ? a / b : null; } // ゼロ除算は null

  // ---------- 月 ----------
  function isYM(s) { return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s); }
  function ymOf(date) {
    var d = date || new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function monthAdd(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return y + "-" + String(m + 1).padStart(2, "0");
  }
  function monthsBack(ym, n) { // ym を含めて n か月分（古い順）
    var out = [];
    for (var i = n - 1; i >= 0; i--) out.push(monthAdd(ym, -i));
    return out;
  }
  function monthLabel(ym) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    var era, ey;
    if (y > 2019 || (y === 2019 && m >= 5)) { era = "令和"; ey = y - 2018; }
    else if (y >= 1989) { era = "平成"; ey = y - 1988; }
    else { era = "昭和"; ey = y - 1925; }
    return {
      wareki: era + (ey === 1 ? "元" : ey) + "年",
      wafu: WAFU[m - 1],
      seireki: y + "年" + m + "月",
      short: m + "月"
    };
  }
  // 「2026/10」「2026年10月」「2026-10-01」なども受け付ける
  function parseYM(s) {
    if (typeof s !== "string") return null;
    var t = s.trim().replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); });
    var m = t.match(/^(\d{4})\s*[-\/年.]\s*(\d{1,2})/);
    if (!m) return null;
    var mo = +m[2];
    if (mo < 1 || mo > 12) return null;
    return m[1] + "-" + String(mo).padStart(2, "0");
  }

  // ---------- 数字の表示 ----------
  function fmtYen(n) {
    if (n === null || n === undefined || !isFinite(n)) return "—";
    var r = Math.round(n);
    return (r < 0 ? "-¥" : "¥") + Math.abs(r).toLocaleString("en-US");
  }
  function fmtMan(n) {
    if (n === null || n === undefined || !isFinite(n)) return "—";
    var a = Math.abs(n), s = n < 0 ? "-" : "";
    if (a >= 1e8) return s + trim(a / 1e8, a >= 1e9 ? 1 : 2) + "億";
    if (a >= 1e4) return s + trim(a / 1e4, a >= 1e6 ? 0 : 1) + "万";
    return s + Math.round(a).toLocaleString("en-US");
  }
  function trim(x, d) { return String(+x.toFixed(d)); }
  function fmtPct(r, d) {
    if (r === null || r === undefined || !isFinite(r)) return "—";
    return (r * 100).toFixed(d === undefined ? 0 : d) + "%";
  }

  // ---------- 状態 ----------
  function emptyState(ym) {
    var cur = isYM(ym) ? ym : ymOf();
    var s = { v: 1, name: "", current: cur, seq: 1, castles: [], months: {}, generals: [], measures: [], chronicle: [] };
    s.months[cur] = { c: {}, sga: 0, cash: 0 };
    return s;
  }

  function newId(state, prefix) {
    state.seq = (state.seq || 1) + 1;
    var id = prefix + state.seq;
    var all = [].concat(state.castles, state.generals, state.measures).map(function (x) { return x.id; });
    while (all.indexOf(id) >= 0) { state.seq++; id = prefix + state.seq; }
    return id;
  }

  function freeSlot(state) {
    var used = state.castles.map(function (c) { return c.slot; });
    for (var i = 0; i < MAX_CASTLES; i++) if (used.indexOf(i) < 0) return i;
    return -1;
  }

  function str(v, max) { return typeof v === "string" ? v.slice(0, max || 200) : (v === null || v === undefined ? "" : String(v).slice(0, max || 200)); }
  function clampAbility(v) { var n = Math.round(num(v)); return Math.max(1, Math.min(100, n || 1)); }

  // 取り込んだ JSON などを正しい形にそろえる。形式が違いすぎるときは例外。
  function normalize(obj) {
    if (!obj || typeof obj !== "object" || !Array.isArray(obj.castles) || !obj.months || typeof obj.months !== "object")
      throw new Error("経営評定のデータではありません");
    var s = emptyState(isYM(obj.current) ? obj.current : undefined);
    s.name = str(obj.name, 40);
    s.seq = Math.max(1, Math.floor(num(obj.seq)));
    var ids = {};
    obj.castles.forEach(function (c) {
      if (!c || typeof c !== "object" || s.castles.length >= MAX_CASTLES) return;
      var id = str(c.id, 40);
      if (!id || ids[id]) return;
      var name = str(c.name, 40).trim() || "名無しの城";
      ids[id] = 1;
      var slot = Math.floor(num(c.slot));
      if (slot < 0 || slot >= MAX_CASTLES || s.castles.some(function (x) { return x.slot === slot; })) slot = freeSlot(s);
      s.castles.push({ id: id, name: name, slot: slot });
    });
    Object.keys(obj.months).forEach(function (ym) {
      if (!isYM(ym)) return;
      var m = obj.months[ym] || {};
      var out = { c: {}, sga: num(m.sga), cash: num(m.cash) };
      var mc = m.c && typeof m.c === "object" ? m.c : {};
      s.castles.forEach(function (c) {
        var v = mc[c.id];
        if (!v || typeof v !== "object") return;
        out.c[c.id] = { sales: num(v.sales), cost: num(v.cost), target: num(v.target), stock: num(v.stock), repeat: numOrNull(v.repeat) };
      });
      s.months[ym] = out;
    });
    if (!s.months[s.current]) s.months[s.current] = { c: {}, sga: 0, cash: 0 };
    (Array.isArray(obj.generals) ? obj.generals : []).forEach(function (g) {
      if (!g || typeof g !== "object") return;
      var id = str(g.id, 40);
      if (!id || ids[id]) return;
      ids[id] = 1;
      s.generals.push({
        id: id, name: str(g.name, 40).trim() || "名無し", role: str(g.role, 40),
        tou: clampAbility(g.tou), bu: clampAbility(g.bu), chi: clampAbility(g.chi), sei: clampAbility(g.sei),
        castle: castleExists(s, g.castle) ? g.castle : ""
      });
    });
    (Array.isArray(obj.measures) ? obj.measures : []).forEach(function (m) {
      if (!m || typeof m !== "object") return;
      var id = str(m.id, 40);
      if (!id || ids[id]) return;
      ids[id] = 1;
      s.measures.push({
        id: id, title: str(m.title, 80).trim() || "名無しの施策",
        kind: KINDS.some(function (k) { return k.key === m.kind; }) ? m.kind : "shogyo",
        castle: castleExists(s, m.castle) ? m.castle : "",
        general: s.generals.some(function (g) { return g.id === m.general; }) ? m.general : "",
        cost: Math.max(0, num(m.cost)),
        due: typeof m.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(m.due) ? m.due : "",
        status: STATUSES.some(function (x) { return x.key === m.status; }) ? m.status : "todo"
      });
    });
    (Array.isArray(obj.chronicle) ? obj.chronicle : []).forEach(function (e) {
      if (!e || !isYM(e.ym)) return;
      s.chronicle.push({ ym: e.ym, sales: num(e.sales), op: num(e.op), rate: numOrNull(e.rate), note: str(e.note, 200) });
    });
    s.chronicle.sort(function (a, b) { return a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : 0; });
    return s;
  }
  function castleExists(s, id) { return !!id && s.castles.some(function (c) { return c.id === id; }); }

  function monthsSorted(state) { return Object.keys(state.months).filter(isYM).sort(); }

  // ---------- 計算 ----------
  function castleMonth(state, ym, cid) {
    var m = state.months[ym];
    var v = m && m.c && m.c[cid];
    return {
      sales: v ? num(v.sales) : 0, cost: v ? num(v.cost) : 0, target: v ? num(v.target) : 0,
      stock: v ? num(v.stock) : 0, repeat: v ? numOrNull(v.repeat) : null
    };
  }

  function castlePL(state, ym, cid) {
    var v = castleMonth(state, ym, cid);
    var gross = v.sales - v.cost;
    return {
      sales: v.sales, cost: v.cost, gross: gross, margin: div(gross, v.sales),
      target: v.target, rate: div(v.sales, v.target), diff: v.sales - v.target,
      stock: v.stock, repeat: v.repeat
    };
  }

  function companyPL(state, ym) {
    var m = state.months[ym] || { sga: 0, cash: 0 };
    var t = { sales: 0, cost: 0, target: 0, stock: 0 };
    state.castles.forEach(function (c) {
      var v = castleMonth(state, ym, c.id);
      t.sales += v.sales; t.cost += v.cost; t.target += v.target; t.stock += v.stock;
    });
    var gross = t.sales - t.cost, sga = num(m.sga);
    return {
      sales: t.sales, cost: t.cost, gross: gross, margin: div(gross, t.sales),
      sga: sga, op: gross - sga, target: t.target, rate: div(t.sales, t.target),
      stock: t.stock, cash: num(m.cash),
      hasData: t.sales !== 0 || t.cost !== 0 || sga !== 0
    };
  }

  function budgetActual(state, ym) {
    var rows = state.castles.map(function (c) {
      var p = castlePL(state, ym, c.id);
      return { id: c.id, name: c.name, target: p.target, sales: p.sales, rate: p.rate, diff: p.diff, margin: p.margin, status: castleStatus(p.rate, p.target) };
    });
    var co = companyPL(state, ym);
    return { rows: rows, total: { target: co.target, sales: co.sales, rate: co.rate, diff: co.sales - co.target, margin: co.margin, status: castleStatus(co.rate, co.target) } };
  }

  function castleStatus(rate, target) {
    if (!target) return { key: "none", label: "目標未定" };
    if (rate >= 1) return { key: "win", label: "攻略" };
    if (rate >= 0.8) return { key: "fight", label: "交戦中" };
    return { key: "lose", label: "苦戦" };
  }

  // 直近 n か月の推移（cid を省くと全社）
  function series(state, cid, endYm, n) {
    return monthsBack(endYm, n).map(function (ym) {
      var p = cid ? castlePL(state, ym, cid) : companyPL(state, ym);
      return { ym: ym, sales: p.sales, cost: p.cost, gross: p.gross, target: p.target, rate: p.rate, exists: !!state.months[ym] };
    });
  }

  // ym を含めて、数字の入った直近 n か月（新しい順）
  function dataMonths(state, ym, n) {
    var out = [];
    for (var i = 0; i < 36 && out.length < n; i++) {
      var k = monthAdd(ym, -i);
      if (state.months[k] && companyPL(state, k).hasData) out.push(k);
    }
    return out;
  }

  function avg(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : 0; }

  // 手元資金の今後 n か月予測：直近3か月（数字のある月）の営業利益の平均 − 未完了の施策の費用
  function forecastCash(state, ym, n) {
    n = n || 6;
    var dm = dataMonths(state, ym, 3);
    var avgNet = avg(dm.map(function (k) { return companyPL(state, k).op; }));
    var start = companyPL(state, ym).cash;
    var spend = {};
    state.measures.forEach(function (m) {
      if (m.status === "done" || !(m.cost > 0)) return;
      var due = m.due ? m.due.slice(0, 7) : monthAdd(ym, 1);
      if (due <= ym) due = monthAdd(ym, 1);
      spend[due] = (spend[due] || 0) + m.cost;
    });
    var cash = start, rows = [];
    for (var i = 1; i <= n; i++) {
      var k = monthAdd(ym, i);
      var ms = spend[k] || 0;
      cash += avgNet - ms;
      rows.push({ ym: k, net: avgNet, measures: ms, cash: cash });
    }
    return { start: start, avgNet: avgNet, basis: dm, rows: rows };
  }

  function monthlyOutflow(state, ym) {
    var dm = dataMonths(state, ym, 3);
    return avg(dm.map(function (k) { var p = companyPL(state, k); return p.cost + p.sga; }));
  }

  function avgCost(state, ym, cid) {
    var ks = monthsBack(ym, 3).filter(function (k) { return state.months[k]; });
    var vals = ks.map(function (k) { return castleMonth(state, k, cid).cost; }).filter(function (v) { return v > 0; });
    return avg(vals);
  }

  // ---------- 軍師の進言 ----------
  // lv: 3=急ぎ 2=要注意 1=参考 0=吉報
  var LV_NAMES = { 3: "急ぎ", 2: "要注意", 1: "参考", 0: "吉報" };

  function advise(state, ym) {
    ym = ym || state.current;
    var out = [];
    var add = function (lv, code, title, text, castle) { out.push({ lv: lv, code: code, title: title, text: text, castle: castle || "" }); };
    var co = companyPL(state, ym);

    if (!state.castles.length) {
      add(2, "nocastle", "城（事業）がまだありませぬ", "殿、まずは「帳簿」で城（事業・販路）を加え、数字を記してくだされ。");
      return finish(out);
    }

    var vacant = state.castles.filter(function (c) { return !state.generals.some(function (g) { return g.castle === c.id; }); });

    if (!co.hasData) {
      add(2, "nodata", "今月の帳簿が未記入です", "殿、" + monthLabel(ym).seireki + "の石高（売上）・原価・販管費がまだ空でございます。「帳簿」から記してくだされ。");
    } else {
      // 全社の目標
      if (co.target > 0 && co.rate < 1) {
        add(co.rate < TH.totalRateDanger ? 3 : 2, "total-target", "全軍の石高（売上）が目標の" + fmtPct(co.rate) + "",
          "目標 " + fmtYen(co.target) + " に対し、実績 " + fmtYen(co.sales) + "。あと " + fmtYen(co.target - co.sales) + " 足りませぬ。");
      }
      // 城ごとの目標
      state.castles.forEach(function (c) {
        var p = castlePL(state, ym, c.id);
        if (p.target > 0 && p.rate < TH.castleRateNote) {
          add(p.rate < TH.castleRateWarn ? 2 : 1, "castle-target", c.name + "の城、目標の" + fmtPct(p.rate) + "にとどまる",
            "売上 " + fmtYen(p.sales) + "／目標 " + fmtYen(p.target) + "。商業（販促）や調略（新規開拓）の手を打たれては。", c.id);
        }
      });
      // 粗利率の低下
      var prev = dataMonths(state, monthAdd(ym, -1), 3);
      var prevMargins = prev.map(function (k) { return companyPL(state, k).margin; }).filter(function (v) { return v !== null; });
      if (co.margin !== null && prevMargins.length) {
        var pm = avg(prevMargins);
        var drop = (pm - co.margin) * 100;
        if (drop >= TH.marginDropPt) {
          add(2, "margin", "粗利率が " + drop.toFixed(1) + "ポイント下がりました",
            "今月の粗利率 " + fmtPct(co.margin, 1) + "（直近" + prevMargins.length + "か月の平均は " + fmtPct(pm, 1) + "）。値引きや原価の上がりを確かめてくだされ。");
        }
      }
      state.castles.forEach(function (c) {
        var p = castlePL(state, ym, c.id);
        if (p.margin === null || p.sales <= 0) return;
        var ms = prev.map(function (k) { return castlePL(state, k, c.id).margin; }).filter(function (v) { return v !== null; });
        if (!ms.length) return;
        var d = (avg(ms) - p.margin) * 100;
        if (d >= TH.castleMarginDropPt) add(1, "castle-margin", c.name + "の粗利率が " + d.toFixed(1) + "ポイント低下",
          "今月 " + fmtPct(p.margin, 1) + "（直近平均 " + fmtPct(avg(ms), 1) + "）。", c.id);
      });
    }

    // 手元資金
    var out1 = monthlyOutflow(state, ym);
    if (co.cash <= 0 && (co.hasData || out1 > 0)) {
      add(3, "cash-zero", "金（手元資金）が尽きております", "手元資金が " + fmtYen(co.cash) + "。支払いの予定をすぐに確かめてくだされ。");
    } else if (out1 > 0) {
      var runway = co.cash / out1;
      if (runway < TH.cashMonthsWarn) {
        add(runway < TH.cashMonthsDanger ? 3 : 2, "cash-runway", "金（手元資金）が月の支出の" + TH.cashMonthsWarn + "か月分を切っています",
          "手元資金 " + fmtYen(co.cash) + " は、月の支出（原価＋販管費の平均 " + fmtYen(out1) + "）の約" + runway.toFixed(1) + "か月分です。");
      }
    }
    var fc = forecastCash(state, ym, 6);
    var neg = fc.rows.filter(function (r) { return r.cash < 0; })[0];
    if (neg && co.cash > 0) {
      add(3, "cash-out", monthLabel(neg.ym).seireki + "に資金が尽きる見込み",
        "このままの収支（月平均 " + fmtYen(fc.avgNet) + "）と予定の施策費用で進むと、手元資金がマイナスになります。");
    }

    // 兵糧（在庫）
    state.castles.forEach(function (c) {
      var tracks = monthsBack(ym, 3).some(function (k) { return castleMonth(state, k, c.id).stock > 0; });
      if (!tracks) return;
      var v = castleMonth(state, ym, c.id);
      var ac = avgCost(state, ym, c.id);
      if (v.stock <= 0) {
        add(2, "stock-out", c.name + "の兵糧（在庫）が尽きました", "在庫が 0 です。仕入れ・製造の段取りを。", c.id);
      } else if (ac > 0) {
        var months = v.stock / ac;
        if (months > TH.stockMonthsOver) add(2, "stock-over", c.name + "の兵糧（在庫）が多すぎます",
          "在庫 " + fmtYen(v.stock) + " は月の原価の約" + months.toFixed(1) + "か月分。資金が眠っております。", c.id);
        else if (months < TH.stockMonthsShort) add(1, "stock-short", c.name + "の兵糧（在庫）が残りわずか",
          "在庫 " + fmtYen(v.stock) + " は月の原価の約" + months.toFixed(1) + "か月分です。", c.id);
      }
    });

    // 民忠（リピート率）
    state.castles.forEach(function (c) {
      var now = castleMonth(state, ym, c.id).repeat;
      var before = castleMonth(state, monthAdd(ym, -1), c.id).repeat;
      if (now === null || before === null) return;
      var d = before - now;
      if (d >= TH.repeatDropPt) add(2, "repeat", c.name + "の民忠（リピート率）が " + d.toFixed(0) + "ポイント低下",
        "前月 " + before + "% → 今月 " + now + "%。お客様の声を聞いてくだされ。", c.id);
    });

    // 担当不在
    vacant.forEach(function (c) {
      add(2, "vacant", c.name + "の城に城主（担当）がおりませぬ", "「武将」から担当を決めてくだされ。", c.id);
    });

    // 施策の期限
    state.measures.forEach(function (m) {
      if (m.status === "done" || !m.due) return;
      var dym = m.due.slice(0, 7);
      if (dym < ym) add(2, "overdue", "施策「" + m.title + "」の期限が過ぎています", "期限 " + m.due + "。完了にするか、期限を見直してくだされ。", m.castle);
      else if (dym === ym) add(1, "due", "施策「" + m.title + "」は今月が期限です", "期限 " + m.due + "。", m.castle);
    });

    // 吉報
    if (co.hasData && co.target > 0 && co.rate >= 1) {
      add(0, "win", "全軍、目標を攻略いたしました", "石高（売上） " + fmtYen(co.sales) + "、達成率 " + fmtPct(co.rate) + "。祝着至極にございます。");
    }
    if (!out.length) add(0, "calm", "万事、順調にございます", "目立った懸念はございませぬ。");
    return finish(out);
  }
  function finish(out) {
    out.forEach(function (x, i) { x._i = i; });
    out.sort(function (a, b) { return b.lv - a.lv || a._i - b._i; });
    out.forEach(function (x) { delete x._i; x.lvName = LV_NAMES[x.lv]; });
    return out;
  }

  // ---------- 月次締め ----------
  function closeMonth(state, note) {
    var s = clone(state);
    var ym = s.current;
    var co = companyPL(s, ym);
    s.chronicle = s.chronicle.filter(function (e) { return e.ym !== ym; });
    s.chronicle.push({ ym: ym, sales: co.sales, op: co.op, rate: co.rate, note: str(note, 200) });
    s.chronicle.sort(function (a, b) { return a.ym < b.ym ? -1 : 1; });
    var next = monthAdd(ym, 1);
    if (!s.months[next]) {
      var nm = { c: {}, sga: 0, cash: co.cash };
      s.castles.forEach(function (c) {
        var v = castleMonth(s, ym, c.id);
        nm.c[c.id] = { sales: 0, cost: 0, target: v.target, stock: v.stock, repeat: v.repeat };
      });
      s.months[next] = nm;
    }
    s.current = next;
    return s;
  }

  // ---------- 城の追加・削除 ----------
  function addCastle(state, name) {
    var s = clone(state);
    name = str(name, 40).trim();
    if (!name) throw new Error("城の名前を入れてください");
    if (s.castles.length >= MAX_CASTLES) throw new Error("城は" + MAX_CASTLES + "までです");
    if (s.castles.some(function (c) { return c.name === name; })) throw new Error("同じ名前の城があります");
    var c = { id: newId(s, "c"), name: name, slot: freeSlot(s) };
    s.castles.push(c);
    return { state: s, castle: c };
  }
  function removeCastle(state, id) {
    var s = clone(state);
    s.castles = s.castles.filter(function (c) { return c.id !== id; });
    Object.keys(s.months).forEach(function (k) { if (s.months[k].c) delete s.months[k].c[id]; });
    s.generals.forEach(function (g) { if (g.castle === id) g.castle = ""; });
    s.measures.forEach(function (m) { if (m.castle === id) m.castle = ""; });
    return s;
  }

  // ---------- CSV ----------
  var CSV_COLS = ["月", "城", "売上", "原価", "目標", "在庫", "リピート率", "販管費", "手元資金"];
  var COMPANY_ROW = "（全社）";

  function csvCell(v) {
    var t = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function toCSV(state) {
    var lines = [CSV_COLS.join(",")];
    monthsSorted(state).forEach(function (ym) {
      state.castles.forEach(function (c) {
        var v = castleMonth(state, ym, c.id);
        lines.push([ym, c.name, v.sales, v.cost, v.target, v.stock, v.repeat === null ? "" : v.repeat, "", ""].map(csvCell).join(","));
      });
      var m = state.months[ym];
      lines.push([ym, COMPANY_ROW, "", "", "", "", "", num(m.sga), num(m.cash)].map(csvCell).join(","));
    });
    return lines.join("\r\n") + "\r\n";
  }

  function parseCSV(text) {
    var rows = [], row = [], cell = "", q = false;
    text = String(text || "").replace(/^﻿/, "");
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === "") q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ""; }); });
  }

  // 空なら undefined（＝そのまま）、数字でなければ NaN
  function csvNum(t) {
    if (t === undefined) return undefined;
    var s = String(t).trim().replace(/[０-９．－]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); })
      .replace(/[¥￥,，円%％\s]/g, "");
    if (s === "") return undefined;
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return parseFloat(s);
  }

  function importCSV(state, text) {
    var s = clone(state);
    var rows = parseCSV(text);
    var res = { state: s, imported: 0, skipped: 0, created: [], errors: [] };
    if (!rows.length) { res.errors.push("中身が空です"); return res; }
    var head = rows[0].map(function (h) { return h.trim(); });
    var col = {};
    CSV_COLS.forEach(function (k) { col[k] = head.indexOf(k); });
    if (col["月"] < 0 || col["城"] < 0) { res.errors.push("1行目に「月」と「城」の見出しがありません"); return res; }
    var fields = { "売上": "sales", "原価": "cost", "目標": "target", "在庫": "stock", "リピート率": "repeat" };
    for (var r = 1; r < rows.length; r++) {
      var line = rows[r], ln = r + 1;
      var get = function (k) { return col[k] >= 0 ? line[col[k]] : undefined; };
      var ym = parseYM(get("月") || "");
      var name = String(get("城") || "").trim();
      if (!ym) { res.skipped++; res.errors.push(ln + "行目：月が読めません"); continue; }
      if (!name) { res.skipped++; res.errors.push(ln + "行目：城の名前がありません"); continue; }
      var vals = {}, bad = false;
      ["売上", "原価", "目標", "在庫", "リピート率", "販管費", "手元資金"].forEach(function (k) {
        var v = csvNum(get(k));
        if (v !== undefined && isNaN(v)) bad = k;
        vals[k] = v;
      });
      if (bad) { res.skipped++; res.errors.push(ln + "行目：「" + bad + "」が数字ではありません"); continue; }
      if (!s.months[ym]) s.months[ym] = { c: {}, sga: 0, cash: 0 };
      var m = s.months[ym];
      if (name === COMPANY_ROW || name === "全社") {
        if (vals["販管費"] !== undefined) m.sga = vals["販管費"];
        if (vals["手元資金"] !== undefined) m.cash = vals["手元資金"];
        res.imported++;
        continue;
      }
      var c = s.castles.filter(function (x) { return x.name === name; })[0];
      if (!c) {
        if (s.castles.length >= MAX_CASTLES) { res.skipped++; res.errors.push(ln + "行目：城が" + MAX_CASTLES + "を超えるため「" + name + "」を加えられません"); continue; }
        c = { id: newId(s, "c"), name: name.slice(0, 40), slot: freeSlot(s) };
        s.castles.push(c);
        res.created.push(c.name);
      }
      var cur = m.c[c.id] || { sales: 0, cost: 0, target: 0, stock: 0, repeat: null };
      Object.keys(fields).forEach(function (k) { if (vals[k] !== undefined) cur[fields[k]] = vals[k]; });
      m.c[c.id] = cur;
      res.imported++;
    }
    return res;
  }

  return {
    MAX_CASTLES: MAX_CASTLES, TH: TH, KINDS: KINDS, STATUSES: STATUSES, WAFU: WAFU, LV_NAMES: LV_NAMES,
    num: num, numOrNull: numOrNull, clone: clone,
    isYM: isYM, ymOf: ymOf, monthAdd: monthAdd, monthsBack: monthsBack, monthLabel: monthLabel, parseYM: parseYM,
    fmtYen: fmtYen, fmtMan: fmtMan, fmtPct: fmtPct,
    emptyState: emptyState, normalize: normalize, newId: newId, monthsSorted: monthsSorted,
    castleMonth: castleMonth, castlePL: castlePL, companyPL: companyPL, budgetActual: budgetActual,
    castleStatus: castleStatus, series: series, forecastCash: forecastCash, monthlyOutflow: monthlyOutflow,
    advise: advise, closeMonth: closeMonth, addCastle: addCastle, removeCastle: removeCastle,
    toCSV: toCSV, parseCSV: parseCSV, importCSV: importCSV, CSV_COLS: CSV_COLS, COMPANY_ROW: COMPANY_ROW
  };
});
