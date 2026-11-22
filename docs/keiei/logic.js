// 経営評定：計算ロジック（損益・予実・資金繰り予測・進言・国取り・外交・奉行の下知状・CSV）。
// DOM を使わないので、ブラウザ（window.KEIEI）でも Node（require）でも読める。
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KEIEI = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MAX_CASTLES = 12;
  var MAX_FIELDS = 16;
  var DATA_VERSION = 3;          // 1：最初の版 2：圃場を追加 3：国取り・外交・奉行所
  var DEFAULT_TARGET_KOKU = 1000000;
  var DEFAULT_KOKU_PER_A = 1000; // 既定の換算：1a＝1,000石（1反＝1万石、1町＝10万石）
  var AREA_UNITS = [
    { key: "a", name: "a（アール）", factor: 1 },
    { key: "tan", name: "反（10a）", factor: 10 },
    { key: "cho", name: "町（100a）", factor: 100 }
  ];

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
    repeatDropPt: 5,        // リピート率が前月よりこのポイント下がった → 要注意
    talkStallMonths: 3,     // 調略中のままこの月数 → 要注意
    clearingStallMonths: 6, // 開墾中のままこの月数 → 要注意
    silentDays: 60          // 友好度4以上・地主とこの日数やりとりがない → 参考
  };

  // 圃場の状態（国取りの段階）
  var FIELD_STATUSES = [
    { key: "aim", name: "狙い", biz: "候補地" },
    { key: "talk", name: "調略中", biz: "交渉中" },
    { key: "got", name: "獲得", biz: "借りた・買った" },
    { key: "clearing", name: "開墾中", biz: "整備中" },
    { key: "own", name: "自領", biz: "作付済み" }
  ];
  var HOUSE_KINDS = [
    { key: "trade", name: "取引先" }, { key: "landlord", name: "地主" }, { key: "gov", name: "行政" },
    { key: "press", name: "報道" }, { key: "ally", name: "仲間" }, { key: "other", name: "その他" }
  ];
  // 奉行に渡せる資料
  var DATA_KEYS = [
    { key: "pl", name: "損益" }, { key: "shops", name: "店ごとの予実" }, { key: "lands", name: "圃場と国取りの状況" },
    { key: "diplo", name: "諸家と書状の記録" }, { key: "measures", name: "施策" }, { key: "generals", name: "武将" }
  ];
  var BUGYO_ICONS = [
    { key: "kanjo", name: "勘定（そろばん）" }, { key: "nosei", name: "農政（笠と稲）" }, { key: "akinai", name: "商い（帳面）" },
    { key: "gaiko", name: "外交（書状）" }, { key: "metsuke", name: "目付（提灯）" }, { key: "other", name: "そのほか" }
  ];

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
    var s = { v: DATA_VERSION, name: "", current: cur, seq: 1, kokuPerA: DEFAULT_KOKU_PER_A, targetKoku: DEFAULT_TARGET_KOKU,
      castles: [], fields: [], months: {}, generals: [], measures: [], chronicle: [], houses: [], letters: [], bugyo: [], reports: [] };
    s.months[cur] = { c: {}, sga: 0, cash: 0 };
    return s;
  }

  function newId(state, prefix) {
    state.seq = (state.seq || 1) + 1;
    var id = prefix + state.seq;
    var all = [].concat(state.castles, state.generals, state.measures, state.fields || [], state.houses || [], state.letters || [], state.bugyo || [], state.reports || []).map(function (x) { return x.id; });
    while (all.indexOf(id) >= 0) { state.seq++; id = prefix + state.seq; }
    return id;
  }

  function freeSlot(state, list, max) {
    var used = (list || state.castles).map(function (c) { return c.slot; });
    for (var i = 0; i < (max || MAX_CASTLES); i++) if (used.indexOf(i) < 0) return i;
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
    s.kokuPerA = num(obj.kokuPerA) > 0 ? num(obj.kokuPerA) : DEFAULT_KOKU_PER_A;
    s.targetKoku = num(obj.targetKoku) > 0 ? num(obj.targetKoku) : DEFAULT_TARGET_KOKU;
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
    var isDate = function (v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v); };
    (Array.isArray(obj.houses) ? obj.houses : []).forEach(function (h) {
      if (!h || typeof h !== "object") return;
      var id = str(h.id, 40);
      if (!id || ids[id]) return;
      ids[id] = 1;
      s.houses.push({
        id: id, name: str(h.name, 60).trim() || "名無しの家", kind: HOUSE_KINDS.some(function (k) { return k.key === h.kind; }) ? h.kind : "other",
        contact: str(h.contact, 60), email: str(h.email, 120).trim(), friend: Math.max(1, Math.min(5, Math.round(num(h.friend)) || 3)),
        general: s.generals.some(function (g) { return g.id === h.general; }) ? h.general : "",
        last: isDate(h.last) ? h.last : "", memo: str(h.memo, 500)
      });
    });
    (Array.isArray(obj.fields) ? obj.fields : []).forEach(function (f) {
      if (!f || typeof f !== "object" || s.fields.length >= MAX_FIELDS) return;
      var id = str(f.id, 40);
      if (!id || ids[id]) return;
      ids[id] = 1;
      var slot = Math.floor(num(f.slot));
      if (slot < 0 || slot >= MAX_FIELDS || s.fields.some(function (x) { return x.slot === slot; })) slot = freeSlot(s, s.fields, MAX_FIELDS);
      // 第1・2版の圃場は状態を持たないので「自領」として移す
      var status = FIELD_STATUSES.some(function (x) { return x.key === f.status; }) ? f.status : "own";
      s.fields.push({
        id: id, name: str(f.name, 40).trim() || "名無しの圃場", area: Math.max(0, num(f.area)),
        crop: str(f.crop, 60), memo: str(f.memo, 300), slot: slot,
        general: s.generals.some(function (g) { return g.id === f.general; }) ? f.general : "",
        status: status, since: isYM(f.since) ? f.since : s.current,
        landlord: s.houses.some(function (h) { return h.id === f.landlord; }) ? f.landlord : "",
        terms: str(f.terms, 300), rent: Math.max(0, num(f.rent)), clearCost: Math.max(0, num(f.clearCost)), harvestKg: Math.max(0, num(f.harvestKg))
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
    (Array.isArray(obj.letters) ? obj.letters : []).forEach(function (l) {
      if (!l || typeof l !== "object") return;
      var id = str(l.id, 40);
      if (!id || ids[id]) return;
      ids[id] = 1;
      s.letters.push({ id: id, date: isDate(l.date) ? l.date : "", house: s.houses.some(function (h) { return h.id === l.house; }) ? l.house : "", subject: str(l.subject, 200), body: str(l.body, 8000) });
    });
    (Array.isArray(obj.bugyo) ? obj.bugyo : []).forEach(function (b) {
      if (!b || typeof b !== "object") return;
      var id = str(b.id, 40);
      if (!id || ids[id]) return;
      ids[id] = 1;
      s.bugyo.push({
        id: id, name: str(b.name, 40).trim() || "名無しの奉行", role: str(b.role, 40).trim() || "奉行", duty: str(b.duty, 120),
        instructions: str(b.instructions, 8000),
        data: (Array.isArray(b.data) ? b.data : []).filter(function (k) { return DATA_KEYS.some(function (d) { return d.key === k; }); }),
        icon: BUGYO_ICONS.some(function (x) { return x.key === b.icon; }) ? b.icon : "other"
      });
    });
    (Array.isArray(obj.reports) ? obj.reports : []).forEach(function (r) {
      if (!r || typeof r !== "object") return;
      var id = str(r.id, 40);
      if (!id || ids[id] || !s.bugyo.some(function (b) { return b.id === r.bugyo; })) return;
      ids[id] = 1;
      s.reports.push({ id: id, bugyo: r.bugyo, date: isDate(r.date) ? r.date : "", request: str(r.request, 4000), report: str(r.report, 20000) });
    });
    (Array.isArray(obj.chronicle) ? obj.chronicle : []).forEach(function (e) {
      if (!e || !isYM(e.ym)) return;
      if (e.kind === "event") s.chronicle.push({ kind: "event", ym: e.ym, date: isDate(e.date) ? e.date : "", text: str(e.text, 200) });
      else s.chronicle.push({ kind: "close", ym: e.ym, sales: num(e.sales), op: num(e.op), rate: numOrNull(e.rate), note: str(e.note, 200) });
    });
    sortChronicle(s);
    return s;
  }
  function sortChronicle(s) {
    s.chronicle.forEach(function (e, i) { e._i = i; });
    s.chronicle.sort(function (a, b) {
      return a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : (a.kind === b.kind ? a._i - b._i : a.kind === "event" ? -1 : 1);
    });
    s.chronicle.forEach(function (e) { delete e._i; });
  }

  // ---------- 石高（圃場面積） ----------
  function kokuOf(state, areaA) { return num(areaA) * (num(state.kokuPerA) > 0 ? num(state.kokuPerA) : DEFAULT_KOKU_PER_A); }
  var HELD = ["got", "clearing", "own"];
  function fieldStatus(key) { return FIELD_STATUSES.filter(function (x) { return x.key === key; })[0] || FIELD_STATUSES[4]; }
  function areaOf(state, keys) {
    return (state.fields || []).reduce(function (a, f) { return a + (keys.indexOf(f.status || "own") >= 0 ? num(f.area) : 0); }, 0);
  }
  // 自領（作付済み）の面積＝実高のもと
  function totalArea(state) { return areaOf(state, ["own"]); }
  // 国力＝実高
  function totalKoku(state) { return kokuOf(state, totalArea(state)); }
  // 実高・見込み（獲得＋開墾中）・狙い（狙い＋調略中）
  function landSplit(state) {
    var ra = areaOf(state, ["own"]), ea = areaOf(state, ["got", "clearing"]), aa = areaOf(state, ["aim", "talk"]);
    return { real: kokuOf(state, ra), expected: kokuOf(state, ea), aim: kokuOf(state, aa), realArea: ra, expectedArea: ea, aimArea: aa };
  }
  // 天下取りゲージ：目標石高に対する実高と、実高＋見込み
  function tenka(state) {
    var sp = landSplit(state), t = num(state.targetKoku) > 0 ? num(state.targetKoku) : DEFAULT_TARGET_KOKU;
    return { target: t, real: sp.real, withExpected: sp.real + sp.expected, rateReal: sp.real / t, rateExpected: (sp.real + sp.expected) / t };
  }
  // 反収（kg／反）。収穫量か面積がなければ null
  function yieldPerTan(f) { return f && num(f.harvestKg) > 0 && num(f.area) > 0 ? num(f.harvestKg) / (num(f.area) / 10) : null; }
  function generalFields(state, gid) { return (state.fields || []).filter(function (f) { return gid && f.general === gid; }); }
  // 知行＝担当している圃場のうち、獲得・開墾中・自領の石高
  function generalKoku(state, gid) {
    return kokuOf(state, generalFields(state, gid).reduce(function (a, f) { return a + (HELD.indexOf(f.status || "own") >= 0 ? num(f.area) : 0); }, 0));
  }
  function monthsBetween(a, b) { // a から b まで何か月
    if (!isYM(a) || !isYM(b)) return 0;
    return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
  }
  function daysBetween(a, b) { // "YYYY-MM-DD" 同士の日数
    var da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)), db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
    return Math.round((db - da) / 86400000);
  }
  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // 圃場を加える（出陣）
  function addField(state, data, ym) {
    var s = clone(state);
    if (s.fields.length >= MAX_FIELDS) throw new Error("圃場は" + MAX_FIELDS + "枚までです");
    var name = str(data.name, 40).trim();
    if (!name) throw new Error("圃場の名前を入れてください");
    if (s.fields.some(function (f) { return f.name === name; })) throw new Error("同じ名前の圃場があります");
    var f = {
      id: newId(s, "f"), name: name, area: Math.max(0, num(data.area)), crop: str(data.crop, 60), memo: str(data.memo, 300),
      slot: freeSlot(s, s.fields, MAX_FIELDS), general: data.general || "",
      status: FIELD_STATUSES.some(function (x) { return x.key === data.status; }) ? data.status : "aim",
      since: ym || s.current, landlord: data.landlord || "", terms: str(data.terms, 300),
      rent: Math.max(0, num(data.rent)), clearCost: Math.max(0, num(data.clearCost)), harvestKg: Math.max(0, num(data.harvestKg))
    };
    s.fields.push(f);
    if (f.status === "got" || f.status === "own") pushLandEvent(s, f, ym || s.current, data.date);
    return { state: s, field: f };
  }
  function pushLandEvent(s, f, ym, date) {
    var st = fieldStatus(f.status);
    var verb = f.status === "own" ? "を自領とした（作付）" : "を獲得";
    s.chronicle.push({ kind: "event", ym: ym, date: date || "", text: f.name + verb + "、" + fmtKoku(kokuOf(s, f.area)) + "（" + fmtArea(f.area) + "）" });
    sortChronicle(s);
    return st;
  }
  // 調略を進める：状態を1つ進める。獲得・自領になったら年表に残す
  function advanceField(state, id, ym, date) {
    var s = clone(state);
    var f = s.fields.filter(function (x) { return x.id === id; })[0];
    if (!f) throw new Error("圃場が見つかりません");
    var i = FIELD_STATUSES.map(function (x) { return x.key; }).indexOf(f.status);
    if (i >= FIELD_STATUSES.length - 1) throw new Error("すでに自領です");
    f.status = FIELD_STATUSES[i + 1].key;
    f.since = ym || s.current;
    var logged = false;
    if (f.status === "got" || f.status === "own") { pushLandEvent(s, f, f.since, date); logged = true; }
    return { state: s, field: f, logged: logged };
  }
  // 撤退：候補（狙い・調略中）から外す
  function retreatField(state, id) {
    var f = (state.fields || []).filter(function (x) { return x.id === id; })[0];
    if (!f) throw new Error("圃場が見つかりません");
    if (f.status !== "aim" && f.status !== "talk") throw new Error("撤退できるのは狙い・調略中の土地だけです");
    return removeField(state, id);
  }
  function areaToA(value, unit) {
    var u = AREA_UNITS.filter(function (x) { return x.key === unit; })[0] || AREA_UNITS[0];
    return num(value) * u.factor;
  }
  function fmtKoku(k) {
    if (k === null || k === undefined || !isFinite(k)) return "—";
    return fmtMan(k) + "石";
  }
  function fmtArea(a) {
    a = Math.round(num(a) * 10) / 10;
    if (a <= 0) return "0a";
    var cho = Math.floor(a / 100), tan = Math.floor((a - cho * 100) / 10), rest = Math.round((a - cho * 100 - tan * 10) * 10) / 10;
    return (cho ? cho + "町" : "") + (tan ? tan + "反" : "") + (rest ? rest + "a" : "");
  }
  // 「120」「1町2反」「3反5a」「45a」などを a に直す。読めなければ NaN
  function parseArea(t) {
    if (typeof t === "number") return isFinite(t) && t >= 0 ? t : NaN;
    var s = String(t || "").trim().replace(/[０-９．]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); }).replace(/[,，\s]/g, "").replace(/アール/g, "a");
    if (s === "") return NaN;
    if (/^\d+(\.\d+)?a?$/.test(s)) return parseFloat(s);
    var m = s.match(/^(?:(\d+(?:\.\d+)?)町)?(?:(\d+(?:\.\d+)?)反)?(?:(\d+(?:\.\d+)?)a)?$/);
    if (!m || (!m[1] && !m[2] && !m[3])) return NaN;
    return num(m[1]) * 100 + num(m[2]) * 10 + num(m[3]);
  }
  // 1万石あたりの商い高（実高が0なら null）
  function incomePerManKoku(state, ym) {
    var k = totalKoku(state);
    return k > 0 ? companyPL(state, ym).sales / (k / 10000) : null;
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
    if (rate >= 1) return { key: "win", label: "繁盛" };
    if (rate >= 0.8) return { key: "fight", label: "堅調" };
    return { key: "lose", label: "不振" };
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
    // 獲得・開墾中の圃場の開墾費用は翌月に見込む
    (state.fields || []).forEach(function (f) {
      if ((f.status === "got" || f.status === "clearing") && f.clearCost > 0) { var k = monthAdd(ym, 1); spend[k] = (spend[k] || 0) + f.clearCost; }
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

  // 進言がどの画面の話か（大地図の国取り・商いで出し分ける）
  var AREA_OF = {
    nocastle: "shop", nodata: "shop", "total-target": "shop", "castle-target": "shop", margin: "shop", "castle-margin": "shop",
    "stock-out": "shop", "stock-over": "shop", "stock-short": "shop", repeat: "shop", vacant: "shop", win: "shop",
    "cash-zero": "cash", "cash-runway": "cash", "cash-out": "cash",
    "vacant-field": "land", "land-stall": "land", "land-clearing": "land", "land-none": "land",
    overdue: "measure", due: "measure", silent: "diplo", calm: "all"
  };

  function advise(state, ym, today) {
    ym = ym || state.current;
    today = today || (ym + "-28");
    var out = [];
    var add = function (lv, code, title, text, castle) { out.push({ lv: lv, code: code, title: title, text: text, castle: castle || "" }); };
    var co = companyPL(state, ym);

    if (!state.castles.length) {
      add(2, "nocastle", "店（事業）がまだありませぬ", "殿、まずは「帳簿」で店（事業・販路）を加え、数字を記してくだされ。");
    } else {
      var vacant = state.castles.filter(function (c) { return !state.generals.some(function (g) { return g.castle === c.id; }); });
      if (!co.hasData) {
        add(2, "nodata", "今月の帳簿が未記入です", "殿、" + monthLabel(ym).seireki + "の商い高（売上）・原価・販管費がまだ空でございます。「帳簿」から記してくだされ。");
      } else {
        if (co.target > 0 && co.rate < 1) {
          add(co.rate < TH.totalRateDanger ? 3 : 2, "total-target", "商い高（売上）が目標の" + fmtPct(co.rate),
            "目標 " + fmtYen(co.target) + " に対し、実績 " + fmtYen(co.sales) + "。あと " + fmtYen(co.target - co.sales) + " 足りませぬ。");
        }
        state.castles.forEach(function (c) {
          var p = castlePL(state, ym, c.id);
          if (p.target > 0 && p.rate < TH.castleRateNote) {
            add(p.rate < TH.castleRateWarn ? 2 : 1, "castle-target", c.name + "の店、目標の" + fmtPct(p.rate) + "にとどまる",
              "商い高 " + fmtYen(p.sales) + "／目標 " + fmtYen(p.target) + "。商業（販促）や調略（新規開拓）の手を打たれては。", c.id);
          }
        });
        var prev = dataMonths(state, monthAdd(ym, -1), 3);
        var prevMargins = prev.map(function (k) { return companyPL(state, k).margin; }).filter(function (v) { return v !== null; });
        if (co.margin !== null && prevMargins.length) {
          var pm = avg(prevMargins), drop = (pm - co.margin) * 100;
          if (drop >= TH.marginDropPt) {
            add(2, "margin", "儲け（粗利）の率が " + drop.toFixed(1) + "ポイント下がりました",
              "今月の粗利率 " + fmtPct(co.margin, 1) + "（直近" + prevMargins.length + "か月の平均は " + fmtPct(pm, 1) + "）。値引きや原価の上がりを確かめてくだされ。");
          }
        }
        state.castles.forEach(function (c) {
          var p = castlePL(state, ym, c.id);
          if (p.margin === null || p.sales <= 0) return;
          var ms = prev.map(function (k) { return castlePL(state, k, c.id).margin; }).filter(function (v) { return v !== null; });
          if (!ms.length) return;
          var d = (avg(ms) - p.margin) * 100;
          if (d >= TH.castleMarginDropPt) add(1, "castle-margin", c.name + "の儲け（粗利）の率が " + d.toFixed(1) + "ポイント低下",
            "今月 " + fmtPct(p.margin, 1) + "（直近平均 " + fmtPct(avg(ms), 1) + "）。", c.id);
        });
      }
      // 蔵（在庫）
      state.castles.forEach(function (c) {
        var tracks = monthsBack(ym, 3).some(function (k) { return castleMonth(state, k, c.id).stock > 0; });
        if (!tracks) return;
        var v = castleMonth(state, ym, c.id), ac = avgCost(state, ym, c.id);
        if (v.stock <= 0) add(2, "stock-out", c.name + "の蔵（在庫）が空になりました", "在庫が 0 です。仕入れ・製造の段取りを。", c.id);
        else if (ac > 0) {
          var months = v.stock / ac;
          if (months > TH.stockMonthsOver) add(2, "stock-over", c.name + "の蔵（在庫）が多すぎます",
            "在庫 " + fmtYen(v.stock) + " は月の原価の約" + months.toFixed(1) + "か月分。資金が眠っております。", c.id);
          else if (months < TH.stockMonthsShort) add(1, "stock-short", c.name + "の蔵（在庫）が残りわずか",
            "在庫 " + fmtYen(v.stock) + " は月の原価の約" + months.toFixed(1) + "か月分です。", c.id);
        }
      });
      // 贔屓（リピート率）
      state.castles.forEach(function (c) {
        var now = castleMonth(state, ym, c.id).repeat, before = castleMonth(state, monthAdd(ym, -1), c.id).repeat;
        if (now === null || before === null) return;
        var d = before - now;
        if (d >= TH.repeatDropPt) add(2, "repeat", c.name + "の贔屓（リピート率）が " + d.toFixed(0) + "ポイント低下",
          "前月 " + before + "% → 今月 " + now + "%。お客様の声を聞いてくだされ。", c.id);
      });
      vacant.forEach(function (c) { add(2, "vacant", c.name + "の店に番頭（担当）がおりませぬ", "「武将」から担当を決めてくだされ。", c.id); });
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
        "このままの収支（月平均 " + fmtYen(fc.avgNet) + "）と予定の施策・開墾の費用で進むと、手元資金がマイナスになります。");
    }

    // 国取り（圃場）
    (state.fields || []).forEach(function (f) {
      var held = HELD.indexOf(f.status) >= 0;
      if (held && !f.general) add(2, "vacant-field", f.name + "（圃場）に担当の武将がおりませぬ", "石高 " + fmtKoku(kokuOf(state, f.area)) + "（" + fmtArea(f.area) + "）の領地です。「国取り」か「武将」で担当を決めてくだされ。");
      var m = monthsBetween(f.since, ym);
      if (f.status === "talk" && m >= TH.talkStallMonths) add(2, "land-stall", "「" + f.name + "」の調略が" + m + "か月止まっています", "地主との話を進めるか、撤退するかを決めてくだされ。書状は「外交」から。");
      if (f.status === "clearing" && m >= TH.clearingStallMonths) add(2, "land-clearing", "「" + f.name + "」が開墾中のまま" + m + "か月", "作付けまでの段取りを見直してくだされ。");
    });

    // 外交：音信の途絶え
    silentHouses(state, today).forEach(function (x) {
      add(1, "silent", "「" + x.house.name + "」と" + (x.days === null ? "やりとりの記録がありません" : x.days + "日音信がありません"),
        (x.house.kind === "landlord" ? "地主" : "友好度" + x.house.friend + "の相手") + "です。「外交」から書状をしたためてはいかが。");
    });

    // 施策の期限
    state.measures.forEach(function (m) {
      if (m.status === "done" || !m.due) return;
      var dym = m.due.slice(0, 7);
      if (dym < ym) add(2, "overdue", "施策「" + m.title + "」の期限が過ぎています", "期限 " + m.due + "。完了にするか、期限を見直してくだされ。", m.castle);
      else if (dym === ym) add(1, "due", "施策「" + m.title + "」は今月が期限です", "期限 " + m.due + "。", m.castle);
    });

    if (state.castles.length && co.hasData && co.target > 0 && co.rate >= 1) {
      add(0, "win", "商い目標を達成いたしました", "商い高（売上） " + fmtYen(co.sales) + "、達成率 " + fmtPct(co.rate) + "。繁盛にございます。");
    }
    if (!out.length) add(0, "calm", "万事、順調にございます", "目立った懸念はございませぬ。");
    return finish(out);
  }
  // 友好度4以上か地主で、silentDays 以上やりとりがない相手
  function silentHouses(state, today, days) {
    days = days || TH.silentDays;
    today = today || todayStr();
    return (state.houses || []).filter(function (h) { return h.friend >= 4 || h.kind === "landlord"; }).map(function (h) {
      return { house: h, days: h.last ? daysBetween(h.last, today) : null };
    }).filter(function (x) { return x.days === null || x.days >= days; });
  }
  function finish(out) {
    out.forEach(function (x, i) { x._i = i; });
    out.sort(function (a, b) { return b.lv - a.lv || a._i - b._i; });
    out.forEach(function (x) { delete x._i; x.lvName = LV_NAMES[x.lv]; x.area = AREA_OF[x.code] || "all"; });
    return out;
  }

  // ---------- 月次締め ----------
  function closeMonth(state, note) {
    var s = clone(state);
    var ym = s.current;
    var co = companyPL(s, ym);
    s.chronicle = s.chronicle.filter(function (e) { return e.ym !== ym || e.kind === "event"; });
    s.chronicle.push({ kind: "close", ym: ym, sales: co.sales, op: co.op, rate: co.rate, note: str(note, 200) });
    sortChronicle(s);
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
    if (!name) throw new Error("店の名前を入れてください");
    if (s.castles.length >= MAX_CASTLES) throw new Error("店は" + MAX_CASTLES + "までです");
    if (s.castles.some(function (c) { return c.name === name; })) throw new Error("同じ名前の店があります");
    var c = { id: newId(s, "c"), name: name, slot: freeSlot(s) };
    s.castles.push(c);
    return { state: s, castle: c };
  }
  function removeField(state, id) {
    var s = clone(state);
    s.fields = s.fields.filter(function (f) { return f.id !== id; });
    return s;
  }
  function removeGeneral(state, id) {
    var s = clone(state);
    s.generals = s.generals.filter(function (g) { return g.id !== id; });
    s.measures.forEach(function (m) { if (m.general === id) m.general = ""; });
    s.fields.forEach(function (f) { if (f.general === id) f.general = ""; });
    s.houses.forEach(function (h) { if (h.general === id) h.general = ""; });
    return s;
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
  var CSV_COLS = ["月", "店", "売上", "原価", "目標", "在庫", "リピート率", "販管費", "手元資金"];
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
    if (col["店"] < 0) col["店"] = head.indexOf("城"); // 第1版の CSV は「城」
    if (col["月"] < 0 || col["店"] < 0) { res.errors.push("1行目に「月」と「店」の見出しがありません"); return res; }
    var fields = { "売上": "sales", "原価": "cost", "目標": "target", "在庫": "stock", "リピート率": "repeat" };
    for (var r = 1; r < rows.length; r++) {
      var line = rows[r], ln = r + 1;
      var get = function (k) { return col[k] >= 0 ? line[col[k]] : undefined; };
      var ym = parseYM(get("月") || "");
      var name = String(get("店") || "").trim();
      if (!ym) { res.skipped++; res.errors.push(ln + "行目：月が読めません"); continue; }
      if (!name) { res.skipped++; res.errors.push(ln + "行目：店の名前がありません"); continue; }
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
        if (s.castles.length >= MAX_CASTLES) { res.skipped++; res.errors.push(ln + "行目：店が" + MAX_CASTLES + "を超えるため「" + name + "」を加えられません"); continue; }
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

  // 圃場の CSV（数字の CSV とは別の表）
  var FIELD_COLS = ["圃場", "面積(a)", "状態", "作物・品種", "担当", "地主", "条件", "地代(年)", "開墾費用", "収穫量(kg)", "メモ"];
  function nameOf(list, id) { var x = (list || []).filter(function (v) { return v.id === id; })[0]; return x ? x.name : ""; }
  function fieldsToCSV(state) {
    var lines = [FIELD_COLS.join(",")];
    state.fields.forEach(function (f) {
      lines.push([f.name, f.area, fieldStatus(f.status).name, f.crop, nameOf(state.generals, f.general), nameOf(state.houses, f.landlord), f.terms, f.rent, f.clearCost, f.harvestKg, f.memo].map(csvCell).join(","));
    });
    return lines.join("\r\n") + "\r\n";
  }
  function headIndex(head) {
    return function (names) { for (var i = 0; i < names.length; i++) { var k = head.indexOf(names[i]); if (k >= 0) return k; } return -1; };
  }
  function importFieldsCSV(state, text) {
    var s = clone(state);
    var rows = parseCSV(text);
    var res = { state: s, imported: 0, skipped: 0, created: [], errors: [], kind: "fields" };
    if (!rows.length) { res.errors.push("中身が空です"); return res; }
    var ci = headIndex(rows[0].map(function (h) { return h.trim(); }));
    var c = {
      name: ci(["圃場"]), area: ci(["面積(a)", "面積（a）", "面積"]), status: ci(["状態"]), crop: ci(["作物・品種", "作物"]), gen: ci(["担当"]),
      land: ci(["地主"]), terms: ci(["条件"]), rent: ci(["地代(年)", "地代"]), clear: ci(["開墾費用"]), harvest: ci(["収穫量(kg)", "収穫量"]), memo: ci(["メモ"])
    };
    if (c.name < 0) { res.errors.push("1行目に「圃場」の見出しがありません"); return res; }
    for (var r = 1; r < rows.length; r++) {
      var line = rows[r], ln = r + 1;
      var cell = function (k) { return c[k] >= 0 && line[c[k]] !== undefined ? String(line[c[k]]).trim() : undefined; };
      var name = (cell("name") || "").slice(0, 40);
      if (!name) { res.skipped++; res.errors.push(ln + "行目：圃場の名前がありません"); continue; }
      var area;
      if (cell("area")) { area = parseArea(cell("area")); if (isNaN(area)) { res.skipped++; res.errors.push(ln + "行目：面積が読めません"); continue; } }
      var status;
      if (cell("status")) {
        var st = FIELD_STATUSES.filter(function (x) { return x.name === cell("status") || x.key === cell("status") || x.biz === cell("status"); })[0];
        if (!st) { res.skipped++; res.errors.push(ln + "行目：状態「" + cell("status") + "」が読めません（狙い・調略中・獲得・開墾中・自領）"); continue; }
        status = st.key;
      }
      var nums = {}, bad = false;
      [["rent", "rent"], ["clear", "clearCost"], ["harvest", "harvestKg"]].forEach(function (p) {
        var v = csvNum(cell(p[0])); if (v !== undefined && isNaN(v)) bad = true; nums[p[1]] = v;
      });
      if (bad) { res.skipped++; res.errors.push(ln + "行目：地代・開墾費用・収穫量は数字で書いてください"); continue; }
      var f = s.fields.filter(function (x) { return x.name === name; })[0];
      if (!f) {
        if (s.fields.length >= MAX_FIELDS) { res.skipped++; res.errors.push(ln + "行目：圃場が" + MAX_FIELDS + "を超えます"); continue; }
        f = { id: newId(s, "f"), name: name, area: 0, crop: "", memo: "", general: "", slot: freeSlot(s, s.fields, MAX_FIELDS), status: "own", since: s.current, landlord: "", terms: "", rent: 0, clearCost: 0, harvestKg: 0 };
        s.fields.push(f);
        res.created.push(name);
      }
      if (area !== undefined) f.area = area;
      if (status && status !== f.status) { f.status = status; f.since = s.current; }
      if (cell("crop") !== undefined) f.crop = cell("crop").slice(0, 60);
      if (cell("memo") !== undefined) f.memo = cell("memo").slice(0, 300);
      if (cell("terms") !== undefined) f.terms = cell("terms").slice(0, 300);
      Object.keys(nums).forEach(function (k) { if (nums[k] !== undefined) f[k] = Math.max(0, nums[k]); });
      if (cell("gen") !== undefined) {
        var g = s.generals.filter(function (x) { return x.name === cell("gen"); })[0];
        if (cell("gen") && !g) res.errors.push(ln + "行目：武将「" + cell("gen") + "」がいないため担当は空にしました");
        f.general = g ? g.id : "";
      }
      if (cell("land") !== undefined) {
        var h = s.houses.filter(function (x) { return x.name === cell("land"); })[0];
        if (cell("land") && !h) res.errors.push(ln + "行目：諸家「" + cell("land") + "」がいないため地主は空にしました");
        f.landlord = h ? h.id : "";
      }
      res.imported++;
    }
    return res;
  }

  // 諸家の CSV
  var HOUSE_COLS = ["諸家", "種別", "担当者", "メール", "友好度", "担当", "最後のやりとり", "メモ"];
  function housesToCSV(state) {
    var lines = [HOUSE_COLS.join(",")];
    state.houses.forEach(function (h) {
      lines.push([h.name, houseKindName(h.kind), h.contact, h.email, h.friend, nameOf(state.generals, h.general), h.last, h.memo].map(csvCell).join(","));
    });
    return lines.join("\r\n") + "\r\n";
  }
  function houseKindName(k) { var x = HOUSE_KINDS.filter(function (v) { return v.key === k; })[0]; return x ? x.name : "その他"; }
  function importHousesCSV(state, text) {
    var s = clone(state);
    var rows = parseCSV(text);
    var res = { state: s, imported: 0, skipped: 0, created: [], errors: [], kind: "houses" };
    if (!rows.length) { res.errors.push("中身が空です"); return res; }
    var ci = headIndex(rows[0].map(function (h) { return h.trim(); }));
    var c = { name: ci(["諸家"]), kind: ci(["種別"]), contact: ci(["担当者"]), email: ci(["メール"]), friend: ci(["友好度"]), gen: ci(["担当"]), last: ci(["最後のやりとり"]), memo: ci(["メモ"]) };
    if (c.name < 0) { res.errors.push("1行目に「諸家」の見出しがありません"); return res; }
    for (var r = 1; r < rows.length; r++) {
      var line = rows[r], ln = r + 1;
      var cell = function (k) { return c[k] >= 0 && line[c[k]] !== undefined ? String(line[c[k]]).trim() : undefined; };
      var name = (cell("name") || "").slice(0, 60);
      if (!name) { res.skipped++; res.errors.push(ln + "行目：名前がありません"); continue; }
      var fr = cell("friend") ? csvNum(cell("friend")) : undefined;
      if (fr !== undefined && (isNaN(fr) || fr < 1 || fr > 5)) { res.skipped++; res.errors.push(ln + "行目：友好度は1〜5で書いてください"); continue; }
      var last = cell("last");
      if (last && !/^\d{4}-\d{2}-\d{2}$/.test(last.replace(/\//g, "-"))) { res.skipped++; res.errors.push(ln + "行目：最後のやりとりは 2026-10-01 の形で"); continue; }
      var h = s.houses.filter(function (x) { return x.name === name; })[0];
      if (!h) { h = { id: newId(s, "h"), name: name, kind: "other", contact: "", email: "", friend: 3, general: "", last: "", memo: "" }; s.houses.push(h); res.created.push(name); }
      if (cell("kind")) { var k = HOUSE_KINDS.filter(function (x) { return x.name === cell("kind") || x.key === cell("kind"); })[0]; h.kind = k ? k.key : "other"; }
      if (cell("contact") !== undefined) h.contact = cell("contact").slice(0, 60);
      if (cell("email") !== undefined) h.email = cell("email").slice(0, 120);
      if (fr !== undefined) h.friend = Math.round(fr);
      if (last) h.last = last.replace(/\//g, "-");
      if (cell("memo") !== undefined) h.memo = cell("memo").slice(0, 500);
      if (cell("gen") !== undefined) { var g = s.generals.filter(function (x) { return x.name === cell("gen"); })[0]; h.general = g ? g.id : ""; }
      res.imported++;
    }
    return res;
  }
  // 見出しを見て、数字・圃場・諸家のどの CSV かを選ぶ
  function importAnyCSV(state, text) {
    var rows = parseCSV(text);
    var head = rows.length ? rows[0].map(function (h) { return h.trim(); }) : [];
    if (head.indexOf("諸家") >= 0) return importHousesCSV(state, text);
    if (head.indexOf("圃場") >= 0 && head.indexOf("城") < 0 && head.indexOf("店") < 0) return importFieldsCSV(state, text);
    var r = importCSV(state, text); r.kind = "months"; return r;
  }

  // ---------- 外交：書状 ----------
  var LETTER_TEMPLATES = [
    { key: "thanks", name: "御礼",
      subject: "先日の御礼（{自社}）",
      body: "{宛名}\n\nいつも大変お世話になっております。{自社}の{署名}でございます。\n\n先日はお忙しいところ、お時間をいただき誠にありがとうございました。\nいただいたお話をもとに、社内で次の進め方を相談しております。あらためてご連絡いたします。\n\n今後ともどうぞよろしくお願い申し上げます。\n\n{自社}\n{署名}" },
    { key: "season", name: "季節の挨拶",
      subject: "季節のご挨拶（{自社}）",
      body: "{宛名}\n\n{季節}の候、ますますご清栄のこととお慶び申し上げます。{自社}の{署名}でございます。\n\n日頃より格別のお引き立てをいただき、心より御礼申し上げます。\n季節の変わり目でございますので、どうぞご自愛ください。\n\n引き続きよろしくお願い申し上げます。\n\n{自社}\n{署名}" },
    { key: "quote", name: "見積のお願い",
      subject: "お見積りのお願い（{自社}）",
      body: "{宛名}\n\nいつもお世話になっております。{自社}の{署名}でございます。\n\n下記につきまして、お見積りをお願いできますでしょうか。\n\n・品目：\n・数量：\n・希望納期：\n・納品先：\n\nお手数をおかけしますが、{期日}までにご回答いただけますと幸いです。\nご不明な点がございましたら、お気軽にお問い合わせください。\n\n{自社}\n{署名}" },
    { key: "land", name: "圃場借用のお願い",
      subject: "畑をお借りしたいご相談（{自社}）",
      body: "{宛名}\n\n突然のご連絡失礼いたします。{自社}の{署名}と申します。\n\n私どもは地域で茶の栽培と販売を営んでおります。このたび、お持ちの畑をお借りして茶を育てさせていただけないかと考え、ご相談のご連絡を差し上げました。\n\n・ご相談したい場所：\n・面積の目安：\n・期間・地代：ご相談のうえで決めさせていただければと存じます\n\n一度ご挨拶に伺い、詳しくご説明できればありがたく存じます。ご都合のよい日時をお知らせいただけますでしょうか。\n\nどうぞよろしくお願い申し上げます。\n\n{自社}\n{署名}" },
    { key: "payment", name: "お支払いの確認",
      subject: "お支払いについてのご確認（{自社}）",
      body: "{宛名}\n\nいつもお世話になっております。{自社}の{署名}でございます。\n\n先日ご請求いたしました件につきまして、本日時点でご入金の確認ができておりませんでしたので、念のためご連絡いたしました。\n\n・ご請求日：\n・ご請求金額：\n・お支払い期日：\n\nすでにお手続きいただいている場合は、行き違いとなり失礼いたしました。ご確認のほど、よろしくお願い申し上げます。\n\n{自社}\n{署名}" },
    { key: "visit", name: "ご挨拶・訪問のお願い",
      subject: "ご挨拶に伺いたく存じます（{自社}）",
      body: "{宛名}\n\nいつもお世話になっております。{自社}の{署名}でございます。\n\n新しい季節の品のご案内をかねて、近いうちにご挨拶に伺えればと存じます。\n30分ほどお時間をいただけますと幸いです。\n\n候補日：\n・\n・\n\nご都合をお聞かせいただけますでしょうか。どうぞよろしくお願い申し上げます。\n\n{自社}\n{署名}" }
  ];
  var SEASONS = ["厳寒", "余寒", "早春", "春暖", "新緑", "梅雨", "盛夏", "残暑", "初秋", "秋冷", "晩秋", "師走"];
  function fillLetter(state, tplKey, houseId, sender, today) {
    var t = LETTER_TEMPLATES.filter(function (x) { return x.key === tplKey; })[0] || LETTER_TEMPLATES[0];
    var h = (state.houses || []).filter(function (x) { return x.id === houseId; })[0];
    today = today || todayStr();
    var due = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) + 7));
    var map = {
      "相手": h ? h.name : "（相手のお名前）", "担当者": h && h.contact ? h.contact : "ご担当者", "自社": state.name || "（自社名）",
      "署名": sender || "（お名前）", "季節": SEASONS[+today.slice(5, 7) - 1], "期日": (due.getUTCMonth() + 1) + "月" + due.getUTCDate() + "日"
    };
    // 宛名：個人（担当者名＝名前）なら「名前様」、会社なら「会社名」の次の行に「担当者様」
    var who = h && h.contact ? h.contact.replace(/\s*様$/, "") : "";
    map["宛名"] = !h ? "（相手のお名前）様" : !who || who === h.name ? h.name + (h.kind === "landlord" || who === h.name ? "様" : "\nご担当者様") : h.name + "\n" + who + "様";
    var f = function (x) { return x.replace(/\{(宛名|相手|担当者|自社|署名|季節|期日)\}/g, function (_, k) { return map[k]; }); };
    return { subject: f(t.subject), body: f(t.body) };
  }
  function mailtoHref(email, subject, body) {
    var enc = function (v) { return encodeURIComponent(String(v || "").replace(/\r?\n/g, "\r\n")); };
    return "mailto:" + encodeURIComponent(String(email || "").trim()).replace(/%40/g, "@") + "?subject=" + enc(subject) + "&body=" + enc(body);
  }
  // 「送った」と記録：書状の記録に足し、相手の「最後にやりとりした日」を更新
  function recordLetter(state, letter) {
    var s = clone(state);
    var date = /^\d{4}-\d{2}-\d{2}$/.test(letter.date || "") ? letter.date : todayStr();
    var l = { id: newId(s, "l"), date: date, house: letter.house || "", subject: str(letter.subject, 200), body: str(letter.body, 8000) };
    s.letters.push(l);
    s.houses.forEach(function (h) { if (h.id === l.house && (!h.last || h.last < date)) h.last = date; });
    return { state: s, letter: l };
  }

  // ---------- 奉行所：下知状 ----------
  function mdCell(v) { return String(v === null || v === undefined || v === "" ? "—" : v).replace(/\|/g, "／").replace(/\r?\n/g, " "); }
  function mdTable(head, rows) {
    if (!rows.length) return "（なし）";
    return "| " + head.join(" | ") + " |\n|" + head.map(function () { return "---"; }).join("|") + "|\n" +
      rows.map(function (r) { return "| " + r.map(mdCell).join(" | ") + " |"; }).join("\n");
  }
  function dataSection(state, key, ym, today) {
    var l = monthLabel(ym), prevYm = monthAdd(ym, -1);
    if (key === "pl") {
      var co = companyPL(state, ym), pr = companyPL(state, prevYm), fc = forecastCash(state, ym, 6);
      return "### 損益（" + l.seireki + "）\n" + mdTable(["項目", "今月", "前月"], [
        ["商い高（売上）", fmtYen(co.sales), fmtYen(pr.sales)], ["原価", fmtYen(co.cost), fmtYen(pr.cost)],
        ["儲け（粗利）", fmtYen(co.gross) + "（" + fmtPct(co.margin, 1) + "）", fmtYen(pr.gross) + "（" + fmtPct(pr.margin, 1) + "）"],
        ["販管費", fmtYen(co.sga), fmtYen(pr.sga)], ["営業利益", fmtYen(co.op), fmtYen(pr.op)],
        ["売上目標", fmtYen(co.target), fmtYen(pr.target)], ["達成率", fmtPct(co.rate), fmtPct(pr.rate)],
        ["手元資金（月末）", fmtYen(co.cash), fmtYen(pr.cash)], ["在庫（月末）", fmtYen(co.stock), fmtYen(pr.stock)]
      ]) + "\n\n手元資金の6か月予測（直近の営業利益の平均 月" + fmtYen(fc.avgNet) + "、未完了の施策・開墾費用を差し引いた概算）：" +
        fc.rows.map(function (r) { return monthLabel(r.ym).short + " " + fmtYen(r.cash); }).join("、");
    }
    if (key === "shops") {
      return "### 店ごとの予実（" + l.seireki + "）\n" + mdTable(["店（事業）", "売上目標", "売上", "達成率", "粗利率", "リピート率", "在庫", "担当"],
        state.castles.map(function (c) {
          var p = castlePL(state, ym, c.id);
          var lords = state.generals.filter(function (g) { return g.castle === c.id; }).map(function (g) { return g.name; }).join("・");
          return [c.name, fmtYen(p.target), fmtYen(p.sales), fmtPct(p.rate), fmtPct(p.margin, 1), p.repeat === null ? "" : p.repeat + "%", fmtYen(p.stock), lords];
        }));
    }
    if (key === "lands") {
      var sp = landSplit(state), tk = tenka(state);
      return "### 圃場と国取りの状況\n石高の換算：1a＝" + fmtKoku(kokuOf(state, 1)) + "（1反＝" + fmtKoku(kokuOf(state, 10)) + "）\n" +
        "実高（作付済み）" + fmtKoku(sp.real) + "（" + fmtArea(sp.realArea) + "）、見込み（獲得・開墾中）" + fmtKoku(sp.expected) + "（" + fmtArea(sp.expectedArea) + "）、狙い（候補・交渉中）" + fmtKoku(sp.aim) + "（" + fmtArea(sp.aimArea) + "）、目標 " + fmtKoku(tk.target) + "（実高の達成 " + fmtPct(tk.rateReal) + "、見込み込み " + fmtPct(tk.rateExpected) + "）\n\n" +
        mdTable(["圃場", "状態", "面積", "石高", "作物・品種", "担当", "地主", "地代(年)", "開墾費用", "収穫量(kg)", "反収(kg/反)", "この状態になった月", "条件・メモ"],
          state.fields.map(function (f) {
            var y = yieldPerTan(f);
            return [f.name, fieldStatus(f.status).name + "（" + fieldStatus(f.status).biz + "）", fmtArea(f.area), fmtKoku(kokuOf(state, f.area)), f.crop, nameOf(state.generals, f.general), nameOf(state.houses, f.landlord),
              f.rent ? fmtYen(f.rent) : "", f.clearCost ? fmtYen(f.clearCost) : "", f.harvestKg || "", y === null ? "" : Math.round(y), monthLabel(f.since).seireki, [f.terms, f.memo].filter(Boolean).join("／")];
          }));
    }
    if (key === "diplo") {
      var recent = state.letters.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 8);
      return "### 諸家（取引先・地主など）\n" + mdTable(["名前", "種別", "担当者", "友好度(5段階)", "担当", "最後のやりとり", "経過日数", "メモ"],
        state.houses.map(function (h) {
          return [h.name, houseKindName(h.kind), h.contact, h.friend, nameOf(state.generals, h.general), h.last, h.last ? daysBetween(h.last, today) + "日" : "記録なし", h.memo];
        })) + "\n\n### 書状の記録（新しい順・最大8件）\n" + mdTable(["日付", "相手", "件名"], recent.map(function (x) { return [x.date, nameOf(state.houses, x.house), x.subject]; }));
    }
    if (key === "measures") {
      return "### 施策\n" + mdTable(["施策", "種類", "対象の店", "担当", "費用", "期限", "状態"],
        state.measures.map(function (m) {
          var k = KINDS.filter(function (x) { return x.key === m.kind; })[0];
          var st = STATUSES.filter(function (x) { return x.key === m.status; })[0];
          return [m.title, k ? k.biz : "", nameOf(state.castles, m.castle) || "全体", nameOf(state.generals, m.general), m.cost ? fmtYen(m.cost) : "", m.due, st ? st.name : ""];
        }));
    }
    if (key === "generals") {
      return "### 武将（メンバー）\n能力値は1〜100の自己評価。\n" + mdTable(["名前", "役職", "マネジメント", "営業", "企画", "事務", "担当の店", "担当の圃場（石高）"],
        state.generals.map(function (g) {
          return [g.name, g.role, g.tou, g.bu, g.chi, g.sei, nameOf(state.castles, g.castle), generalFields(state, g.id).map(function (f) { return f.name; }).join("・") + (generalFields(state, g.id).length ? "（" + fmtKoku(generalKoku(state, g.id)) + "）" : "")];
        }));
    }
    return "";
  }
  function buildOrder(state, bugyo, request, opts) {
    opts = opts || {};
    var ym = opts.ym || state.current, today = opts.today || todayStr(), l = monthLabel(ym);
    var company = state.name || "当社";
    var keys = DATA_KEYS.map(function (d) { return d.key; }).filter(function (k) { return (bugyo.data || []).indexOf(k) >= 0; });
    var parts = [
      "【下知状】" + (bugyo.role === bugyo.name ? bugyo.name : bugyo.role + "・" + bugyo.name) + " への依頼",
      "作成日：" + today + "　対象の月：" + l.seireki + "（" + l.wareki + " " + l.wafu + "）　会社：" + company,
      "",
      "■ あなたの役目",
      "あなたは" + company + "の「" + bugyo.role + "」" + (bugyo.role === bugyo.name ? "" : "（" + bugyo.name + "）") + "です。" + (bugyo.duty ? "役目：" + bugyo.duty : ""),
      "",
      "■ 常の指示",
      (bugyo.instructions || "（指示書はありません）").trim(),
      "",
      "■ 資料（経営管理アプリ「経営評定」から書き出した " + l.seireki + " 時点の数字）",
      "言葉の対応：店＝事業・販路、商い高＝売上、儲け＝粗利、蔵＝在庫、贔屓＝リピート率、番頭＝担当、武将＝社員、石高＝圃場の面積を換算した数、実高＝作付済みの圃場、諸家＝取引先・地主など。",
      ""
    ];
    if (!keys.length) parts.push("（資料は渡していません）", "");
    keys.forEach(function (k) { parts.push(dataSection(state, k, ym, today), ""); });
    parts.push("■ 今回の依頼", (String(request || "").trim() || "（依頼文がありません）"), "",
      "■ 答え方",
      "- 結論を先に、日本語で簡潔に書いてください。",
      "- 数字は上の資料にあるものを使い、資料にないことは「推測」と明記してください。",
      "- 判断に足りない情報があれば、最後に「確かめたいこと」として挙げてください。");
    return parts.join("\n");
  }
  function addReport(state, bugyoId, request, report, date) {
    var s = clone(state);
    if (!s.bugyo.some(function (b) { return b.id === bugyoId; })) throw new Error("奉行が見つかりません");
    if (!String(report || "").trim()) throw new Error("報告の中身を貼り付けてください");
    var r = { id: newId(s, "r"), bugyo: bugyoId, date: /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : todayStr(), request: str(request, 4000), report: str(report, 20000) };
    s.reports.push(r);
    return { state: s, report: r };
  }
  function removeBugyo(state, id) {
    var s = clone(state);
    s.bugyo = s.bugyo.filter(function (b) { return b.id !== id; });
    s.reports = s.reports.filter(function (r) { return r.bugyo !== id; });
    return s;
  }
  function removeHouse(state, id) {
    var s = clone(state);
    s.houses = s.houses.filter(function (h) { return h.id !== id; });
    s.fields.forEach(function (f) { if (f.landlord === id) f.landlord = ""; });
    s.letters.forEach(function (l) { if (l.house === id) l.house = ""; });
    return s;
  }
  // 初期の奉行5人
  function defaultBugyo() {
    return [
      { id: "b1", name: "勘定奉行", role: "勘定奉行", icon: "kanjo", duty: "経理と資金繰りを見張る", data: ["pl", "shops", "measures"],
        instructions: "あなたは小さな茶の会社の経理担当です。毎月の損益と手元資金を見て、次のことを報告してください。\n1. 今月の数字の要点（売上・粗利・営業利益・手元資金）を3行で。\n2. 前月と比べて大きく動いた項目と、その考えられる理由。\n3. 今後6か月の資金繰りで気をつける月と、打てる手（支払い時期の調整、在庫の圧縮、施策の延期など）。\n4. 税金・賞与・設備の更新など、資料に出ていないが季節的に気をつけたい支出の注意。\n専門用語は避け、経営者がすぐ判断できる言葉で書いてください。" },
      { id: "b2", name: "農政奉行", role: "農政奉行", icon: "nosei", duty: "圃場と国取り（畑を広げる計画）を受け持つ", data: ["lands", "diplo", "generals"],
        instructions: "あなたは茶畑の拡大と管理の担当です。圃場ごとの状態（狙い・調略中・獲得・開墾中・自領）、面積、地代、開墾費用、収穫量を見て、次をまとめてください。\n1. 目標石高に向けた進み具合と、このままのペースでの見通し。\n2. 交渉が止まっている土地、開墾が長引いている土地と、次の一手。\n3. 反収（10aあたりの収穫量）の良い畑・悪い畑と、考えられる理由。\n4. 地主への連絡が必要な相手（外交の記録を参考に）。\n農作業の時期（摘採、整枝、施肥、防霜など）も踏まえて、今月と来月にやることを具体的に挙げてください。" },
      { id: "b3", name: "商い奉行", role: "商い奉行", icon: "akinai", duty: "販促と売上を伸ばす手を考える", data: ["pl", "shops", "measures"],
        instructions: "あなたは販売と販促の担当です。店（事業・販路）ごとの売上・目標・粗利率・リピート率・在庫を見て、次を提案してください。\n1. 目標に届いていない店の原因の仮説（数字から言えること／言えないことを分けて）。\n2. 来月すぐ打てる販促を3つ。それぞれ、対象の店、狙うお客様、おおよその費用、期待する効果。\n3. リピート率が下がっている店への手当て。\n4. 在庫が多い店の売り切り方、少ない店の補充の注意。\n季節の行事（新茶、お中元、敬老の日、年末の贈答など）を活かした案を優先してください。" },
      { id: "b4", name: "外交奉行", role: "外交奉行", icon: "gaiko", duty: "取引先・地主への書状の下書きを書く", data: ["diplo", "lands"],
        instructions: "あなたは取引先・地主・行政などへの連絡を受け持ちます。依頼に応じて、メールの件名と本文の下書きを書いてください。\n- 丁寧で読みやすい、現代の日本語のビジネス文にしてください。くだけすぎず、堅すぎず。\n- 宛名（会社名・お名前様）、本文、結び、署名の順に。\n- 1通は400字程度までに収め、相手にしてほしいこと（返信、日程、確認）をはっきり書いてください。\n- 資料の「最後のやりとり」や友好度を踏まえ、久しぶりの相手には近況のひとことを添えてください。\n- 出力は「件名：」の行と、そのあとに本文だけを書いてください。" },
      { id: "b5", name: "目付", role: "目付", icon: "metsuke", duty: "数字の点検と見落とし探し", data: ["pl", "shops", "lands", "diplo", "measures", "generals"],
        instructions: "あなたは社内の点検役です。渡された資料全体を、疑ってかかる目で点検してください。\n1. 入力ミスが疑われる数字（桁違い、原価が売上より大きい、在庫が急に増減した、など）。\n2. 担当が決まっていない店・圃場、期限が過ぎた施策、長く連絡していない相手など、放置されているもの。\n3. 数字どうしの食い違い（目標と実績の差が説明できない、資金の減り方が損益と合わない、など）。\n4. 経営者が見落としていそうなリスクを重要な順に3つ。\n指摘には必ず、どの資料のどの数字を見てそう考えたかを添えてください。問題がなければ「特に問題なし」と書いてください。" }
    ];
  }

  return {
    DATA_VERSION: DATA_VERSION, DEFAULT_TARGET_KOKU: DEFAULT_TARGET_KOKU, FIELD_STATUSES: FIELD_STATUSES, HOUSE_KINDS: HOUSE_KINDS,
    DATA_KEYS: DATA_KEYS, BUGYO_ICONS: BUGYO_ICONS, LETTER_TEMPLATES: LETTER_TEMPLATES, HOUSE_COLS: HOUSE_COLS,
    fieldStatus: fieldStatus, landSplit: landSplit, tenka: tenka, yieldPerTan: yieldPerTan, monthsBetween: monthsBetween, daysBetween: daysBetween, todayStr: todayStr,
    addField: addField, advanceField: advanceField, retreatField: retreatField, silentHouses: silentHouses, houseKindName: houseKindName,
    housesToCSV: housesToCSV, importHousesCSV: importHousesCSV, fillLetter: fillLetter, mailtoHref: mailtoHref, recordLetter: recordLetter,
    buildOrder: buildOrder, addReport: addReport, removeBugyo: removeBugyo, removeHouse: removeHouse, defaultBugyo: defaultBugyo,
    MAX_FIELDS: MAX_FIELDS, DEFAULT_KOKU_PER_A: DEFAULT_KOKU_PER_A, AREA_UNITS: AREA_UNITS,
    kokuOf: kokuOf, totalArea: totalArea, totalKoku: totalKoku, generalFields: generalFields, generalKoku: generalKoku,
    areaToA: areaToA, fmtKoku: fmtKoku, fmtArea: fmtArea, parseArea: parseArea, incomePerManKoku: incomePerManKoku,
    removeField: removeField, removeGeneral: removeGeneral, freeSlot: freeSlot,
    fieldsToCSV: fieldsToCSV, importFieldsCSV: importFieldsCSV, importAnyCSV: importAnyCSV, FIELD_COLS: FIELD_COLS,
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
