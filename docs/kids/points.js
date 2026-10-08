/* こども学習サイト 共通ポイント（百人一首・日本史・まいにち30ぷん など）
 *
 * どのアプリも yusandonatural.github.io の上にあるので、この端末の localStorage に
 * 1つの「ポイント帳」を置いて、各アプリから書き込み、入口ページ（kids/）で合計を見る。
 *
 * 使い方（各アプリ）：
 *   <script src="https://yusandonatural.github.io/idea-/kids/points.js"></script>
 *   KidsPoints.award({ app: "hyakunin", points: 10, reason: "1〜10番 クリア" });
 *   KidsPoints.award({ app: "nihonshi", points: 20, reason: "縄文時代 はじめてクリア", key: "era-jomon" }); // key があれば1回だけ
 *
 * 記録の形（キー kids-points:v1）：
 *   { v: 1, kids: [{ id, name, icon }], current: kidId, log: { 記録id: [kidId, appId, 点, 時刻ms, 理由] }, at: 更新時刻ms }
 *   log は id で引けるので、端末どうしを合わせるときは id の和集合をとるだけでよい（merge）。
 */
(function (root) {
  "use strict";
  var KEY = "kids-points:v1";
  var DAILY_BONUS = 5; // その日はじめてポイントをもらった時のおまけ（アプリ共通）
  var ICONS = ["🦊", "🐻", "🐰", "🐼", "🐯", "🐸", "🐧", "🦄"];

  function ymd(t) {
    var d = new Date(t);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function blank() { return { v: 1, kids: [], current: null, log: {}, at: 0 }; }

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s && s.v === 1 && s.log && s.kids) return s;
    } catch (e) { /* 壊れていたら空から */ }
    return blank();
  }
  function save(s) {
    s.at = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { console.warn("KidsPoints: save failed", e); }
    fire();
  }

  var watchers = [];
  function fire() { watchers.slice().forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
  if (root.addEventListener) root.addEventListener("storage", function (e) { if (e.key === KEY) fire(); });

  function addKidTo(s, name, icon) {
    var kid = { id: "k" + rid(), name: String(name || "なまえ").slice(0, 20), icon: icon || ICONS[s.kids.length % ICONS.length] };
    s.kids.push(kid);
    if (!s.current) s.current = kid.id;
    return kid;
  }
  /** 今の子（いなければ1人目を作る） */
  function currentOf(s) {
    var k = s.kids.filter(function (x) { return x.id === s.current; })[0] || s.kids[0];
    if (!k) k = addKidTo(s, "わたし");
    s.current = k.id;
    return k;
  }
  function eventsOf(s, kidId) {
    var out = [];
    for (var id in s.log) {
      var e = s.log[id];
      if (!kidId || e[0] === kidId) out.push({ id: id, kid: e[0], app: e[1], points: e[2], at: e[3], reason: e[4] || "" });
    }
    return out.sort(function (a, b) { return b.at - a.at; });
  }

  var KP = {
    KEY: KEY,
    DAILY_BONUS: DAILY_BONUS,

    /** ポイントをあげる。
     *  opts: { app（必須・英小文字のID）, points（1以上の整数）, reason, key（同じ達成で二重にもらわないためのID）, kid（子のID。省略で今の子）, toast（false で表示しない） }
     *  返り値：{ added（今回ふえた点。二重なら0）, bonus, balance, kid } */
    award: function (opts) {
      opts = opts || {};
      var pts = Math.round(Number(opts.points));
      if (!opts.app || !(pts > 0)) throw new Error("KidsPoints.award: app と 1以上の points が必要です");
      var s = load();
      var kid = opts.kid ? s.kids.filter(function (x) { return x.id === opts.kid; })[0] : currentOf(s);
      if (!kid) throw new Error("KidsPoints.award: その kid はいません: " + opts.kid);
      var now = Date.now();
      var id = opts.key ? opts.app + ":" + kid.id + ":" + opts.key : "e" + rid();
      if (s.log[id]) return { added: 0, bonus: 0, balance: KP.balance(kid.id), kid: kid };
      var bonusId = "daily:" + kid.id + ":" + ymd(now), bonus = 0;
      if (!s.log[bonusId]) { s.log[bonusId] = [kid.id, "bonus", DAILY_BONUS, now, "きょうの はじめの いっぽ"]; bonus = DAILY_BONUS; }
      s.log[id] = [kid.id, String(opts.app), pts, now, String(opts.reason || "").slice(0, 60)];
      save(s);
      var r = { added: pts, bonus: bonus, balance: KP.balance(kid.id), kid: kid };
      if (opts.toast !== false) KP.toast(r);
      return r;
    },

    /** ポイントを使う（ごほうびと交換など）。保護者の画面から呼ぶ想定 */
    spend: function (points, reason, kidId) {
      var pts = Math.round(Number(points));
      if (!(pts > 0)) throw new Error("KidsPoints.spend: 1以上の points が必要です");
      var s = load(), kid = kidId ? { id: kidId } : currentOf(s);
      s.log["e" + rid()] = [kid.id, "spend", -pts, Date.now(), String(reason || "つかった").slice(0, 60)];
      save(s);
    },

    /** 記録を1つ消す（まちがえて付けたとき） */
    remove: function (eventId) { var s = load(); delete s.log[eventId]; save(s); },

    // ---- 子ども ----
    kids: function () { return load().kids.slice(); },
    current: function () { var s = load(), had = s.kids.length; var k = currentOf(s); if (!had) save(s); return k; },
    setCurrent: function (kidId) { var s = load(); if (s.kids.some(function (k) { return k.id === kidId; })) { s.current = kidId; save(s); } },
    addKid: function (name, icon) { var s = load(); var k = addKidTo(s, name, icon); save(s); return k; },
    /** 名前で探して、いなければ作る（自分で子どもを管理しているアプリ向け） */
    ensureKid: function (name, icon) {
      var s = load(), k = s.kids.filter(function (x) { return x.name === name; })[0];
      if (!k) { k = addKidTo(s, name, icon); save(s); }
      return k;
    },
    renameKid: function (kidId, name, icon) {
      var s = load();
      s.kids.forEach(function (k) { if (k.id === kidId) { if (name) k.name = String(name).slice(0, 20); if (icon) k.icon = icon; } });
      save(s);
    },
    /** 子を消す（その子の記録も消える） */
    removeKid: function (kidId) {
      var s = load();
      s.kids = s.kids.filter(function (k) { return k.id !== kidId; });
      for (var id in s.log) if (s.log[id][0] === kidId) delete s.log[id];
      if (s.current === kidId) s.current = s.kids[0] ? s.kids[0].id : null;
      save(s);
    },

    // ---- 集計 ----
    events: function (kidId) { return eventsOf(load(), kidId); },
    /** 今もっているポイント（もらった − つかった） */
    balance: function (kidId) { return eventsOf(load(), kidId || KP.current().id).reduce(function (n, e) { return n + e.points; }, 0); },
    /** これまでにもらった合計（レベルはこれで決まる。使っても下がらない） */
    earned: function (kidId) { return eventsOf(load(), kidId || KP.current().id).reduce(function (n, e) { return n + Math.max(0, e.points); }, 0); },
    /** アプリごとにもらった合計 { appId: 点 } */
    byApp: function (kidId) {
      var out = {};
      eventsOf(load(), kidId || KP.current().id).forEach(function (e) { if (e.points > 0) out[e.app] = (out[e.app] || 0) + e.points; });
      return out;
    },
    today: function (kidId) {
      var t = ymd(Date.now());
      return eventsOf(load(), kidId || KP.current().id).reduce(function (n, e) { return n + (e.points > 0 && ymd(e.at) === t ? e.points : 0); }, 0);
    },
    /** 今日（今日がまだなら昨日）からさかのぼって、ポイントをもらった日が何日続いているか */
    streak: function (kidId) {
      var days = {};
      eventsOf(load(), kidId || KP.current().id).forEach(function (e) { if (e.points > 0) days[ymd(e.at)] = 1; });
      var d = new Date(), n = 0;
      if (!days[ymd(d)]) d.setDate(d.getDate() - 1);
      while (days[ymd(d)]) { n++; d.setDate(d.getDate() - 1); }
      return n;
    },
    /** レベル：Lv.n → n+1 に 累計 25·n·(n+1) 点（50, 150, 300, 500, …） */
    level: function (earned) {
      var need = function (n) { return 25 * n * (n + 1); };
      var n = 1;
      while (earned >= need(n)) n++;
      var lo = n > 1 ? need(n - 1) : 0;
      return { level: n, from: lo, to: need(n), rest: need(n) - earned, ratio: (earned - lo) / (need(n) - lo) };
    },

    // ---- 端末どうしの合わせ・バックアップ ----
    /** 2つの記録を合わせる（ログは id の和集合、子は id でまとめる、今の子は新しい方） */
    merge: function (a, b) {
      var newer = (a.at || 0) >= (b.at || 0) ? a : b, older = newer === a ? b : a;
      var out = blank(), seen = {};
      newer.kids.concat(older.kids).forEach(function (k) { if (!seen[k.id]) { seen[k.id] = 1; out.kids.push({ id: k.id, name: k.name, icon: k.icon }); } });
      var id;
      for (id in older.log) out.log[id] = older.log[id];
      for (id in newer.log) out.log[id] = newer.log[id];
      out.current = newer.current || older.current;
      out.at = Math.max(a.at || 0, b.at || 0);
      return out;
    },
    exportData: function () { return JSON.stringify(load()); },
    /** バックアップを読み込む（今の記録は消さずに合わせる） */
    importData: function (json) {
      var other = typeof json === "string" ? JSON.parse(json) : json;
      if (!other || other.v !== 1 || !other.log || !other.kids) throw new Error("ポイントのバックアップではありません");
      save(KP.merge(load(), other));
    },

    /** 記録が変わったら呼ぶ（別のタブで変わったときも）。返り値で解除 */
    onChange: function (fn) { watchers.push(fn); return function () { var i = watchers.indexOf(fn); if (i >= 0) watchers.splice(i, 1); }; },

    /** 「+10 ポイント」の小さな表示 */
    toast: function (r) {
      if (!root.document || !document.body) return;
      var el = document.createElement("div");
      el.setAttribute("role", "status");
      el.style.cssText = "position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translate(-50%,20px);z-index:2147483000;" +
        "background:#fff7e6;color:#7a3e00;border:2px solid #f5b544;border-radius:999px;padding:10px 18px;font:700 16px/1.3 'M PLUS Rounded 1c',system-ui,sans-serif;" +
        "box-shadow:0 6px 20px rgba(0,0,0,.18);opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;white-space:nowrap";
      el.textContent = "⭐ +" + (r.added + r.bonus) + " ポイント" + (r.bonus ? "（きょうの おまけ +" + r.bonus + "）" : "") + "　ぜんぶで " + r.balance;
      document.body.appendChild(el);
      requestAnimationFrame(function () { el.style.opacity = "1"; el.style.transform = "translate(-50%,0)"; });
      setTimeout(function () { el.style.opacity = "0"; setTimeout(function () { el.remove(); }, 300); }, 2600);
    },
  };

  root.KidsPoints = KP;
})(typeof window !== "undefined" ? window : this);
