/* れきしドリル（日本史）／せかいしドリル（世界史）共通：通史を何周もする（ステージ数は app-data.js）クイズアプリ。
 * 科目ごとの名前・文言・保存キーは app-data.js の HIST.app で決める。
 * 画面：#/welcome（はじめて）・#/（道）・#/node/s/uid（単元のまとめ）・#/play（レッスン）・#/review・#/timeline・#/me
 * 記録はこの端末の localStorage（HIST.app.key）だけに保存する。 */
(function () {
  "use strict";

  /* ---------- 定数・小道具 ---------- */
  var APP = HIST.app;
  var KEY = APP.key;
  var LESSONS = 2;                       // 1単元あたりのレッスン数（ここまでやると単元クリア）
  var BOX_DAYS = [0, 1, 2, 4, 8, 16, 32];  // 復習の間隔（箱の番号→日数）
  var PASS = 0.8;                        // 飛び級・まとめテストの合格ライン
  var GOALS = [{ xp: 10, name: "のんびり", note: "1日1レッスン" }, { xp: 20, name: "ふつう", note: "1日2レッスン" },
    { xp: 30, name: "しっかり", note: "1日3レッスン" }, { xp: 50, name: "ガッツリ", note: "受験生向け" }];
  var STAGES = HIST.stages;
  var UNITS = HIST.units.slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; });
  var $app = document.getElementById("app");
  var $top = document.getElementById("topbar");
  var $nav = document.getElementById("nav");

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function sample(a, n) { return shuffle(a).slice(0, n); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function ymd(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function unitById(id) { for (var i = 0; i < UNITS.length; i++) if (UNITS[i].id === id) return UNITS[i]; return null; }
  function stageOf(lv) { return STAGES[lv - 1]; }

  /* 問題のもとに安定したキーをつける（復習の記録用） */
  var FACTS = {};
  UNITS.forEach(function (u) {
    (u.facts || []).forEach(function (f) { f.key = u.id + ":" + hash(f.q); f.unit = u; FACTS[f.key] = f; });
    (u.events || []).forEach(function (e) { e.unit = u; });
  });

  /* ---------- 記録 ---------- */
  function fresh() {
    return { v: 1, started: false, start: 1, goal: 20, sound: true, xp: 0, days: {}, nodes: {}, passed: {},
      cards: {}, ok: 0, ans: 0, lessons: 0, best: 0, freeze: 0 };
  }
  var S = (function () {
    try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && s.v === 1) return Object.assign(fresh(), s); } catch (e) { /* 読めなければ新規 */ }
    return fresh();
  })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 保存できない環境でも動かす */ } }

  function todayXP() { return S.days[ymd()] || 0; }
  function addXP(n) { S.xp += n; S.days[ymd()] = todayXP() + n; }
  function streak() {
    var d = new Date(), n = 0;
    if (!S.days[ymd(d)]) d.setDate(d.getDate() - 1);
    while (S.days[ymd(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function dueCards() {
    var t = ymd();
    return Object.keys(S.cards).filter(function (k) { return FACTS[k] && S.cards[k].due <= t; })
      .sort(function (a, b) { return S.cards[a].box - S.cards[b].box || (S.cards[a].due < S.cards[b].due ? -1 : 1); });
  }
  /* 4択・〇×の結果を復習カードに反映（初回の答えだけ） */
  function grade(f, ok) {
    if (!f || !f.key) return;
    var c = S.cards[f.key] || { box: 0, due: ymd(), n: 0, miss: 0 };
    c.n++;
    if (ok) c.box = Math.min(c.box + 1, BOX_DAYS.length - 1);
    else { c.box = 0; c.miss++; }
    c.due = addDays(ok ? BOX_DAYS[c.box] : 0);
    S.cards[f.key] = c;
  }

  /* ---------- 進み具合 ---------- */
  function nodeKey(lv, uid) { return lv + ":" + uid; }
  function nodeDone(lv, uid) { return S.nodes[nodeKey(lv, uid)] || 0; }
  function nodeComplete(lv, uid) { return nodeDone(lv, uid) >= LESSONS; }
  function stageOpen(lv) { return lv <= S.start || !!S.passed[lv - 1]; }
  function stageFree(lv) { return lv < S.start || !!S.passed[lv]; } // 全単元を自由に選べる
  function stageCount(lv) { return UNITS.filter(function (u) { return nodeComplete(lv, u.id); }).length; }
  function nodeOpen(lv, i) {
    if (!stageOpen(lv)) return false;
    if (stageFree(lv) || i === 0) return true;
    return nodeComplete(lv, UNITS[i - 1].id);
  }
  /* いま進めるべき単元 */
  function currentNode() {
    for (var lv = 1; lv <= STAGES.length; lv++) {
      if (!stageOpen(lv)) continue;
      for (var i = 0; i < UNITS.length; i++) if (!nodeComplete(lv, UNITS[i].id) && nodeOpen(lv, i)) return { lv: lv, uid: UNITS[i].id };
      if (!S.passed[lv]) return { lv: lv, check: true };
    }
    return null;
  }

  /* ---------- 効果音 ---------- */
  var ac = null;
  function beep(kind) {
    if (!S.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      var seq = { ok: [[660, 0], [990, 0.09]], ng: [[220, 0], [185, 0.12]], done: [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.3]], tap: [[440, 0]] }[kind];
      seq.forEach(function (n) {
        var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + n[1];
        o.type = kind === "ng" ? "square" : "triangle"; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === "ng" ? 0.06 : 0.14, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === "tap" ? 0.06 : 0.16));
        o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.2);
      });
    } catch (e) { /* 音が出せなくても続ける */ }
  }

  /* はにわ先生 */
  function haniwa(mood, size) {
    size = size || 96;
    var mouth = mood === "sad" ? '<ellipse cx="50" cy="66" rx="7" ry="4" fill="#4a2a1c"/>' : mood === "happy" ? '<path d="M41 62 Q50 74 59 62 Z" fill="#4a2a1c"/>' : '<ellipse cx="50" cy="65" rx="6" ry="7" fill="#4a2a1c"/>';
    var arms = mood === "happy" ? '<path d="M22 66 Q10 52 14 38" stroke="#c9774f" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M78 66 Q90 52 86 38" stroke="#c9774f" stroke-width="9" fill="none" stroke-linecap="round"/>'
      : '<path d="M22 70 Q12 66 12 56" stroke="#c9774f" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M78 64 Q90 58 88 46" stroke="#c9774f" stroke-width="9" fill="none" stroke-linecap="round"/>';
    return '<svg class="haniwa ' + (mood || "") + '" width="' + size + '" height="' + size + '" viewBox="0 0 100 110" aria-hidden="true">' + arms +
      '<rect x="24" y="14" width="52" height="92" rx="26" fill="#d98a5f"/><rect x="24" y="14" width="52" height="92" rx="26" fill="none" stroke="#b9653d" stroke-width="3"/>' +
      '<path d="M30 84 h40" stroke="#b9653d" stroke-width="3" stroke-linecap="round"/>' +
      '<ellipse cx="40" cy="44" rx="6" ry="' + (mood === "happy" ? 3 : 7) + '" fill="#4a2a1c"/><ellipse cx="60" cy="44" rx="6" ry="' + (mood === "happy" ? 3 : 7) + '" fill="#4a2a1c"/>' + mouth +
      '<ellipse cx="33" cy="56" rx="5" ry="3" fill="#ef9b86" opacity=".7"/><ellipse cx="67" cy="56" rx="5" ry="3" fill="#ef9b86" opacity=".7"/></svg>';
  }

  /* ---------- 上のバー・下のタブ ---------- */
  function renderTop() {
    var g = Math.min(1, todayXP() / S.goal);
    var st = streak();
    $top.innerHTML = '<div class="wrap topin">' +
      '<a class="brand" href="#/">' + haniwa("", 28) + '<b>' + esc(APP.name) + '</b></a>' +
      '<span class="pill ' + (todayXP() > 0 ? "fire" : "off") + '" title="連続日数">🔥 ' + st + '</span>' +
      '<span class="pill xp" title="合計XP">⭐ ' + S.xp + '</span>' +
      '<span class="goalring" title="きょうの目標 ' + todayXP() + '/' + S.goal + ' XP" style="--p:' + g + '"><i>' + (g >= 1 ? "✓" : Math.round(g * 100) + "%") + '</i></span>' +
      '</div>';
    var due = dueCards().length;
    var b = document.getElementById("due-badge");
    b.hidden = !due; b.textContent = due > 99 ? "99+" : due;
  }
  function setTab(name) {
    [].forEach.call($nav.querySelectorAll("a"), function (a) { a.classList.toggle("on", a.dataset.tab === name); });
  }
  function chrome(show) { document.body.classList.toggle("focus", !show); }

  /* ---------- はじめて ---------- */
  function viewWelcome(step) {
    chrome(false);
    step = step || 0;
    if (step === 0) {
      $app.innerHTML = '<section class="welcome">' + haniwa("happy", 140) +
        '<h1>' + APP.welcomeTitle + '</h1>' +
        '<p class="lead">' + APP.welcomeLead + '</p>' +
        '<ul class="feat"><li>🗺️ <b>' + esc(APP.loopName || "通史を4周") + '</b>：' + STAGES.map(function (s) { return esc(s.name); }).join(" → ") + '</li><li>🎯 1回3分のレッスン。4択・' + esc(APP.orderKind || "年代ならべかえ") + '・組み合わせ・〇×</li><li>🔁 まちがえた問題は、忘れたころにもう一度</li></ul>' +
        '<button class="btn big" id="go">はじめる</button></section>';
      document.getElementById("go").onclick = function () { beep("tap"); viewWelcome(1); };
    } else if (step === 1) {
      $app.innerHTML = '<section class="welcome"><h2>いまの学年は？</h2><p class="lead">ここから始めます。前のステージもいつでも復習できます。</p><div class="choices">' +
        STAGES.map(function (s) { return '<button class="opt stagepick" data-lv="' + s.lv + '" style="--c:' + s.color + '"><span class="sic">' + s.icon + '</span><span><b>' + s.grades + '</b><small>' + esc(s.name) + 'ステージ：' + esc(s.title) + '</small></span></button>'; }).join("") +
        '</div><p class="hint">迷ったら一番上から。わかる人はどんどん進めます。</p></section>';
      [].forEach.call($app.querySelectorAll(".stagepick"), function (b) {
        b.onclick = function () { S.start = +b.dataset.lv; beep("tap"); viewWelcome(2); };
      });
    } else {
      $app.innerHTML = '<section class="welcome"><h2>1日の目標は？</h2><p class="lead">あとから変えられます。</p><div class="choices">' +
        GOALS.map(function (g) { return '<button class="opt goalpick" data-xp="' + g.xp + '"><span><b>' + g.name + '</b><small>' + g.note + '</small></span><span class="gx">' + g.xp + ' XP</span></button>'; }).join("") +
        '</div></section>';
      [].forEach.call($app.querySelectorAll(".goalpick"), function (b) {
        b.onclick = function () { S.goal = +b.dataset.xp; S.started = true; save(); window.track("tutorial_complete", { start_stage: S.start }); location.hash = "#/"; };
      });
    }
  }

  /* ---------- 道（ホーム） ---------- */
  function viewPath() {
    chrome(true); setTab("path"); renderTop();
    var cur = currentNode();
    var html = '<div class="wrap path">';
    var due = dueCards().length;
    if (due) html += '<a class="duebar" href="#/review">🔁 ふくしゅうが <b>' + due + '問</b> たまっています<span>やる</span></a>';
    STAGES.forEach(function (st) {
      var lv = st.lv, open = stageOpen(lv), n = stageCount(lv);
      html += '<section class="stage' + (open ? "" : " locked") + '" style="--c:' + st.color + '" id="stage' + lv + '">' +
        '<div class="sbanner"><div><small>ステージ ' + lv + '・' + esc(st.grades) + '</small><h2>' + st.icon + ' ' + esc(st.name) + '：' + esc(st.title) + '</h2>' +
        '<div class="sbar"><i style="width:' + (n / UNITS.length * 100) + '%"></i></div><small>' + n + ' / ' + UNITS.length + ' 単元クリア' + (S.passed[lv] ? '・まとめテスト合格 🏆' : '') + '</small></div>' +
        (open ? '' : '<button class="btn small ghost" data-jump="' + (lv - 1) + '">🚀 飛び級テスト</button>') + '</div>';
      if (!open) { html += '<p class="lockmsg">🔒 ステージ' + (lv - 1) + 'のまとめテストに合格するとひらきます。自信があれば「飛び級テスト」で先へ。</p></section>'; return; }
      html += '<div class="nodes">';
      UNITS.forEach(function (u, i) {
        var ok = nodeOpen(lv, i), d = Math.min(nodeDone(lv, u.id), LESSONS), comp = d >= LESSONS;
        var isCur = cur && !cur.check && cur.lv === lv && cur.uid === u.id;
        var x = Math.round(Math.sin(i * 0.9) * 70);
        html += '<div class="node" style="--x:' + x + 'px">' +
          (isCur ? '<span class="startflag">' + (d ? "つづき" : "スタート") + '</span>' : '') +
          '<button class="nbtn' + (comp ? " done" : "") + (ok ? "" : " lock") + (isCur ? " cur" : "") + '" data-lv="' + lv + '" data-u="' + u.id + '" data-i="' + i + '" style="--p:' + (d / LESSONS) + '" aria-label="' + esc(u.title) + '">' +
          '<span>' + (ok ? (comp ? "👑" : u.emoji) : "🔒") + '</span></button>' +
          '<div class="nlabel">' + esc(u.title) + '<small>' + esc(u.period) + '</small></div></div>';
      });
      var allDone = n === UNITS.length;
      html += '<div class="node" style="--x:0px"><button class="nbtn check' + (S.passed[lv] ? " done" : "") + (allDone || S.passed[lv] ? "" : " lock") + (cur && cur.check && cur.lv === lv ? " cur" : "") + '" data-check="' + lv + '"><span>🏆</span></button>' +
        '<div class="nlabel">まとめテスト<small>15問・80%で合格</small></div></div>';
      html += '</div></section>';
    });
    html += '<p class="foot">' + esc(APP.footer) + '</p></div>';
    $app.innerHTML = html;

    [].forEach.call($app.querySelectorAll(".nbtn[data-u]"), function (b) {
      b.onclick = function () {
        var lv = +b.dataset.lv, i = +b.dataset.i;
        if (!nodeOpen(lv, i)) { toast("🔒 前の単元をクリアするとひらきます"); return; }
        beep("tap"); location.hash = "#/node/" + lv + "/" + b.dataset.u;
      };
    });
    [].forEach.call($app.querySelectorAll(".nbtn[data-check]"), function (b) {
      b.onclick = function () {
        var lv = +b.dataset.check;
        if (b.classList.contains("lock")) { toast("🔒 このステージの単元をすべてクリアするとひらきます"); return; }
        startCheck(lv, false);
      };
    });
    [].forEach.call($app.querySelectorAll("[data-jump]"), function (b) {
      b.onclick = function () { startCheck(+b.dataset.jump, true); };
    });
    // 今の単元までスクロール
    var c = $app.querySelector(".nbtn.cur");
    if (c && !viewPath.scrolled) { viewPath.scrolled = true; setTimeout(function () { c.scrollIntoView({ block: "center" }); }, 30); }
  }

  /* ---------- 単元のまとめ（レッスン前） ---------- */
  function viewNode(lv, uid) {
    var u = unitById(uid), st = stageOf(lv);
    if (!u || !st) { location.hash = "#/"; return; }
    chrome(false);
    var d = nodeDone(lv, uid);
    var pairs = (u.pairs || []).filter(function (p) { return p.lv === lv; });
    var evs = (u.events || []).filter(function (e) { return e.lv === lv; }).sort(function (a, b) { return a.y - b.y; });
    $app.innerHTML = '<div class="wrap nodeview" style="--c:' + st.color + '">' +
      '<button class="x" id="back" aria-label="もどる">✕</button>' +
      '<div class="nhead"><span class="bigemoji">' + u.emoji + '</span><div><small>ステージ' + lv + '・' + esc(st.name) + '</small><h1>' + esc(u.title) + '</h1><p>' + esc(u.period) + '</p></div></div>' +
      '<div class="lessondots">' + Array.from({ length: LESSONS }, function (_, k) { return '<i class="' + (k < d ? "on" : "") + '"></i>'; }).join("") +
      '<span>' + (d >= LESSONS ? "クリア済み👑 もう一度やると復習になります" : "レッスン " + (d + 1) + " / " + LESSONS) + '</span></div>' +
      '<section class="card tip"><div class="tiphead">' + haniwa("", 44) + '<b>はにわ先生のまとめ</b></div><p>' + esc(u.intro[lv]) + '</p></section>' +
      (evs.length ? '<section class="card"><h3>' + tlIcon() + ' この単元の' + esc(tlName()) + '</h3>' + groups(evs).map(function (g) {
        return (g.k ? '<h4 class="gk">' + esc(g.k) + '</h4>' : '') + '<ol class="mini-tl">' + g.list.map(function (e) { return '<li><b>' + esc(e.when) + '</b>' + esc(e.t) + '</li>'; }).join("") + '</ol>';
      }).join("") + '</section>' : '') +
      (pairs.length ? '<section class="card"><h3>🔑 キーワード</h3><dl class="kw">' + pairs.map(function (p) { return '<dt>' + esc(p.l) + '</dt><dd>' + esc(p.r) + '</dd>'; }).join("") + '</dl></section>' : '') +
      '<div class="stickybtn"><button class="btn big" id="go">' + (d >= LESSONS ? "復習レッスン" : "レッスン" + (d + 1) + "をはじめる") + '  <small>+' + 10 + ' XP</small></button></div></div>';
    document.getElementById("back").onclick = function () { location.hash = "#/"; };
    document.getElementById("go").onclick = function () { startLesson(lv, uid); };
  }

  /* ---------- 問題をつくる ---------- */
  function qChoice(f) {
    return { type: "choice", f: f, q: f.q, a: f.a, opts: shuffle([f.a].concat(sample(f.d, 3))), e: f.e };
  }
  function qTF(f) {
    var truth = Math.random() < 0.5, shown = truth ? f.a : pick(f.d);
    return { type: "tf", f: f, q: f.q, shown: shown, truth: truth, a: f.a, e: f.e };
  }
  /* ならべかえ：k（「北にあるじゅん」など）が同じものどうしで出す。k がなければ年代順。y の小さい順が正解 */
  function groups(evs) {
    var g = {}, out = [];
    evs.forEach(function (e) { var k = e.k || ""; if (!g[k]) { g[k] = []; out.push(k); } g[k].push(e); });
    return out.map(function (k) { return { k: k, list: g[k].sort(function (a, b) { return a.y - b.y; }) }; });
  }
  function qOrder(evs) {
    var gs = shuffle(groups(evs).filter(function (g) { return g.list.length >= 3; }));
    if (!gs.length) return null;
    var g = gs[0], pool = shuffle(g.list), items = [], ys = {};
    for (var i = 0; i < pool.length && items.length < 4; i++) if (!ys[pool[i].y]) { ys[pool[i].y] = 1; items.push(pool[i]); }
    if (items.length < 3) return null;
    return { type: "order", items: items, k: g.k };
  }
  function qMatch(pairs) {
    if (pairs.length < 3) return null;
    return { type: "match", pairs: sample(pairs, Math.min(4, pairs.length)) };
  }
  function lvFacts(u, lv) { return (u.facts || []).filter(function (f) { return f.lv === lv; }); }

  function buildLesson(lv, uid) {
    var u = unitById(uid), d = nodeDone(lv, uid), facts = lvFacts(u, lv), qs = [];
    var main;
    if (d < LESSONS) {
      // 初回は教材の順に半分ずつ（新しい内容を順番に）
      var per = Math.ceil(facts.length / LESSONS);
      main = facts.slice(d * per, (d + 1) * per);
      if (main.length < 6) main = main.concat(sample(facts.filter(function (f) { return main.indexOf(f) < 0; }), 6 - main.length));
    } else {
      // クリア後は、まちがえやすいものを優先
      main = facts.slice().sort(function (a, b) { return cardWeak(b) - cardWeak(a) || Math.random() - 0.5; }).slice(0, 8);
    }
    main = main.slice(0, 7);
    var tfIdx = main.length > 4 ? main.length - 1 : -1;
    main.forEach(function (f, i) { qs.push(i === tfIdx ? qTF(f) : qChoice(f)); });
    // 下のレベルの復習を1問
    if (lv > 1) {
      var low = (u.facts || []).filter(function (f) { return f.lv < lv; });
      if (low.length) qs.push(qChoice(pick(low)));
    }
    var mq = qMatch((u.pairs || []).filter(function (p) { return p.lv === lv; }));
    var oq = qOrder((u.events || []).filter(function (e) { return e.lv <= lv; }).filter(function (e) { return e.lv === lv || Math.random() < 0.4; }));
    // 最初の2問は4択、あとは混ぜる
    var head = qs.slice(0, 2), rest = shuffle(qs.slice(2).concat(mq ? [mq] : [], oq ? [oq] : []));
    return head.concat(rest);
  }
  function cardWeak(f) { var c = S.cards[f.key]; return c ? c.miss * 2 - c.box : 1; }

  function buildCheck(lv) {
    var facts = [], evs = [], pairs = [];
    UNITS.forEach(function (u) {
      facts = facts.concat(lvFacts(u, lv));
      evs = evs.concat((u.events || []).filter(function (e) { return e.lv === lv; }));
    });
    // 組み合わせは1つの単元から（単元をまたぐと紛らわしい）
    var pu = pick(UNITS);
    pairs = (pu.pairs || []).filter(function (p) { return p.lv === lv; });
    var fs = sample(facts, 12), qs = [];
    fs.forEach(function (f, i) { qs.push(i < 10 ? qChoice(f) : qTF(f)); });
    // 単元をまたぐ年代ならべかえ（時代の流れの確認）
    for (var k = 0; k < 2; k++) {
      // 地理のような「〜じゅん」の並べかえは、くらべる物差しがそろう1つの単元の中から
      var src = APP.orderAcross === false ? (pick(UNITS).events || []).filter(function (e) { return e.lv === lv; }) : evs;
      var o = qOrder(src); if (o) qs.push(o);
    }
    var m = qMatch(pairs); if (m) qs.push(m);
    return shuffle(qs);
  }

  function buildReview() {
    var keys = dueCards().slice(0, 10), fs = keys.map(function (k) { return FACTS[k]; });
    if (fs.length < 5) {
      // たまっていなければ、これまでに学んだ単元から苦手順に
      var learned = [];
      STAGES.forEach(function (st) {
        UNITS.forEach(function (u) { if (nodeDone(st.lv, u.id) > 0) learned = learned.concat(lvFacts(u, st.lv)); });
      });
      learned = learned.filter(function (f) { return fs.indexOf(f) < 0; })
        .sort(function (a, b) { return cardWeak(b) - cardWeak(a) || Math.random() - 0.5; });
      fs = fs.concat(learned.slice(0, 10 - fs.length));
    }
    return shuffle(fs).map(function (f, i) { return i % 4 === 3 ? qTF(f) : qChoice(f); });
  }

  /* ---------- レッスン再生 ---------- */
  var P = null; // 再生中の状態
  function startLesson(lv, uid) {
    var qs = buildLesson(lv, uid);
    P = { mode: "lesson", lv: lv, uid: uid, queue: qs, total: qs.length, done: 0, first: 0, firstOk: 0, combo: 0, maxCombo: 0, t0: Date.now(), seen: [] };
    location.hash = "#/play"; renderQ();
  }
  function startCheck(lv, jump) {
    var qs = buildCheck(lv);
    P = { mode: "check", lv: lv, jump: jump, queue: qs, total: qs.length, done: 0, first: 0, firstOk: 0, combo: 0, maxCombo: 0, t0: Date.now(), seen: [] };
    location.hash = "#/play"; renderQ();
  }
  function startReview() {
    var qs = buildReview();
    if (!qs.length) { toast("まずは「まなぶ」でレッスンをひとつやってみよう"); return; }
    P = { mode: "review", queue: qs, total: qs.length, done: 0, first: 0, firstOk: 0, combo: 0, maxCombo: 0, t0: Date.now(), seen: [] };
    location.hash = "#/play"; renderQ();
  }

  function playShell(inner) {
    var pct = P.done / P.total * 100;
    var label = P.mode === "check" ? (P.jump ? "飛び級テスト" : "まとめテスト") : P.mode === "review" ? "ふくしゅう" : stageOf(P.lv).name + "・" + unitById(P.uid).title;
    return '<div class="play">' +
      '<div class="phead wrap"><button class="x" id="quit" aria-label="やめる">✕</button><div class="pbar"><i style="width:' + pct + '%"></i></div>' +
      '<span class="combo' + (P.combo >= 3 ? " on" : "") + '">🔥' + P.combo + '</span></div>' +
      '<div class="wrap qarea"><small class="qlabel">' + esc(label) + '</small>' + inner + '</div>' +
      '<div class="feedback" id="fb"></div></div>';
  }
  function bindQuit() {
    var b = document.getElementById("quit"), armed = false;
    b.onclick = function () {
      if (P.done === 0 || armed) { P = null; location.hash = "#/"; return; }
      armed = true; b.classList.add("armed"); toast("もう一度 ✕ を押すとやめます（記録は残りません）");
      setTimeout(function () { armed = false; b.classList.remove("armed"); }, 2500);
    };
  }

  function renderQ() {
    if (!P) { location.hash = "#/"; return; }
    if (!P.queue.length) { finish(); return; }
    chrome(false);
    var q = P.queue[0];
    q.firstTry = P.seen.indexOf(q) < 0;
    if (q.type === "choice") renderChoice(q);
    else if (q.type === "tf") renderTF(q);
    else if (q.type === "order") renderOrder(q);
    else renderMatch(q);
    bindQuit();
  }

  function renderChoice(q) {
    $app.innerHTML = playShell('<h2 class="qtext' + (q.q.length > 60 ? " long" : "") + '">' + esc(q.q) + '</h2><div class="opts">' +
      q.opts.map(function (o, i) { return '<button class="opt ans" data-i="' + i + '"><kbd>' + (i + 1) + '</kbd><span>' + esc(o) + '</span></button>'; }).join("") + '</div>');
    var bs = $app.querySelectorAll(".ans");
    [].forEach.call(bs, function (b) {
      b.onclick = function () {
        if (P.locked) return;
        var o = q.opts[+b.dataset.i], ok = o === q.a;
        [].forEach.call(bs, function (x) { x.disabled = true; if (q.opts[+x.dataset.i] === q.a) x.classList.add("right"); });
        if (!ok) b.classList.add("wrong");
        answer(q, ok, ok ? "" : "正解：" + q.a, q.e);
      };
    });
  }
  function renderTF(q) {
    $app.innerHTML = playShell('<p class="qkind">〇か×か？</p><h2 class="qtext' + (q.q.length > 60 ? " long" : "") + '">' + esc(q.q) + '</h2>' +
      '<div class="tfshown">答え：<b>' + esc(q.shown) + '</b></div>' +
      '<div class="tfrow"><button class="opt tf maru" data-v="1"><span>〇</span></button><button class="opt tf batsu" data-v="0"><span>×</span></button></div>');
    var bs = $app.querySelectorAll(".tf");
    [].forEach.call(bs, function (b) {
      b.onclick = function () {
        if (P.locked) return;
        var ok = (b.dataset.v === "1") === q.truth;
        [].forEach.call(bs, function (x) { x.disabled = true; if ((x.dataset.v === "1") === q.truth) x.classList.add("right"); });
        if (!ok) b.classList.add("wrong");
        answer(q, ok, q.truth ? "これは正しい答えでした" : "正解は「" + q.a + "」", q.e);
      };
    });
  }
  function renderOrder(q) {
    var order = [];
    var opts = shuffle(q.items);
    function draw() {
      $app.innerHTML = playShell('<p class="qkind">' + esc(APP.orderKind || "年代ならべかえ") + '</p><h2 class="qtext">' + esc(q.k || "古いじゅん") + 'にタップしよう</h2>' +
        '<ol class="slots">' + q.items.map(function (_, i) { var e = order[i]; return '<li class="' + (e ? "fill" : "") + '" data-k="' + i + '">' + (e ? esc(e.t) + (P.mode === "lesson" ? '' : '<small>' + esc(e.unit.title) + '</small>') : '<i>' + (i + 1) + '</i>') + '</li>'; }).join("") + '</ol>' +
        '<div class="chips">' + opts.map(function (e, i) { return '<button class="chip' + (order.indexOf(e) >= 0 ? " used" : "") + '" data-i="' + i + '">' + esc(e.t) + '</button>'; }).join("") + '</div>' +
        '<div class="stickybtn"><button class="btn big" id="chk"' + (order.length < q.items.length ? " disabled" : "") + '>こたえあわせ</button></div>');
      bindQuit();
      [].forEach.call($app.querySelectorAll(".chip"), function (b) {
        b.onclick = function () { var e = opts[+b.dataset.i]; if (order.indexOf(e) >= 0) return; order.push(e); beep("tap"); draw(); };
      });
      [].forEach.call($app.querySelectorAll(".slots li.fill"), function (li) {
        li.onclick = function () { order.splice(+li.dataset.k, 1); draw(); };
      });
      document.getElementById("chk").onclick = function () {
        var right = q.items.slice().sort(function (a, b) { return a.y - b.y; });
        var ok = right.every(function (e, i) { return order[i] === e; });
        [].forEach.call($app.querySelectorAll(".slots li"), function (li, i) { li.classList.add(order[i] === right[i] ? "right" : "wrong"); li.onclick = null; });
        [].forEach.call($app.querySelectorAll(".chip"), function (b) { b.disabled = true; });
        document.getElementById("chk").disabled = true;
        answer(q, ok, ok ? "" : "正しい順番", '<ol class="ansorder">' + right.map(function (e) { return '<li><b>' + esc(e.when) + '</b>' + esc(e.t) + '</li>'; }).join("") + '</ol>', true);
      };
    }
    draw();
  }
  function renderMatch(q) {
    var L = shuffle(q.pairs), R = shuffle(q.pairs), selL = null, selR = null, matched = [], missed = false;
    $app.innerHTML = playShell('<p class="qkind">組み合わせ</p><h2 class="qtext">合うものどうしをタップしよう</h2>' +
      '<div class="match"><div>' + L.map(function (p, i) { return '<button class="mbtn" data-s="L" data-i="' + i + '">' + esc(p.l) + '</button>'; }).join("") + '</div>' +
      '<div>' + R.map(function (p, i) { return '<button class="mbtn r" data-s="R" data-i="' + i + '">' + esc(p.r) + '</button>'; }).join("") + '</div></div>');
    bindQuit();
    var bs = $app.querySelectorAll(".mbtn");
    function el(side, p) { var arr = side === "L" ? L : R; return $app.querySelector('.mbtn[data-s="' + side + '"][data-i="' + arr.indexOf(p) + '"]'); }
    [].forEach.call(bs, function (b) {
      b.onclick = function () {
        var p = (b.dataset.s === "L" ? L : R)[+b.dataset.i];
        if (matched.indexOf(p) >= 0 || P.locked) return;
        if (b.dataset.s === "L") selL = p; else selR = p;
        [].forEach.call(bs, function (x) { x.classList.remove("sel"); });
        if (selL) el("L", selL).classList.add("sel");
        if (selR) el("R", selR).classList.add("sel");
        if (selL && selR) {
          var a = el("L", selL), c = el("R", selR);
          if (selL === selR) {
            matched.push(selL); beep("tap");
            a.classList.add("ok"); c.classList.add("ok"); a.disabled = c.disabled = true;
            a.classList.remove("sel"); c.classList.remove("sel");
          } else {
            missed = true; beep("ng");
            a.classList.add("bad"); c.classList.add("bad");
            setTimeout(function () { a.classList.remove("bad", "sel"); c.classList.remove("bad", "sel"); }, 450);
          }
          selL = selR = null;
          if (matched.length === q.pairs.length) {
            answer(q, !missed, missed ? "ぜんぶつなげました（1回まちがえたので、あとでもう一度）" : "", '<dl class="kw">' + q.pairs.map(function (p) { return '<dt>' + esc(p.l) + '</dt><dd>' + esc(p.r) + '</dd>'; }).join("") + '</dl>', true);
          }
        }
      };
    });
  }

  /* 答えたあと：記録・フィードバック */
  function answer(q, ok, sub, expl, explIsHtml) {
    P.locked = true;
    if (q.firstTry) {
      P.first++; if (ok) P.firstOk++;
      P.seen.push(q);
      if (q.f) grade(q.f, ok);
      S.ans++; if (ok) S.ok++;
    }
    if (ok) { P.combo++; P.maxCombo = Math.max(P.maxCombo, P.combo); beep("ok"); }
    else { P.combo = 0; beep("ng"); }
    var praise = ["せいかい！", "すごい！", "その調子！", "いいね！", "ばっちり！"];
    var fb = document.getElementById("fb");
    fb.className = "feedback show " + (ok ? "good" : "bad");
    fb.innerHTML = '<div class="wrap"><div class="fbhead">' + haniwa(ok ? "happy" : "sad", 52) +
      '<div><b>' + (ok ? (P.combo >= 3 ? P.combo + "問連続！ " : "") + pick(praise) : "おしい！") + '</b>' + (sub ? '<p class="sub">' + esc(sub) + '</p>' : '') + '</div></div>' +
      (expl ? '<div class="expl">' + (explIsHtml ? expl : esc(expl)) + '</div>' : '') +
      '<button class="btn big ' + (ok ? "" : "red") + '" id="next">つぎへ</button></div>';
    var combo = $app.querySelector(".combo"); if (combo) { combo.textContent = "🔥" + P.combo; combo.classList.toggle("on", P.combo >= 3); }
    document.getElementById("next").onclick = next;
    document.getElementById("next").focus({ preventScroll: true });
    function next() {
      var cur = P.queue.shift();
      // レッスンと復習では、まちがえた問題を最後にもう一度（テストは1回きり）
      if (!ok && P.mode !== "check") {
        var again = cur.type === "choice" ? Object.assign({}, cur, { opts: shuffle(cur.opts) }) : cur.type === "tf" ? qTF(cur.f) : cur;
        P.seen.push(again);
        P.queue.push(again);
        P.total++;
      }
      P.done++;
      P.locked = false;
      renderQ();
    }
    save();
  }

  function finish() {
    var acc = P.first ? P.firstOk / P.first : 0, secs = Math.round((Date.now() - P.t0) / 1000);
    var xp = 0, title = "", note = "", mood = "happy", extra = "";
    var before = todayXP();
    if (P.mode === "check") {
      var pass = acc >= PASS;
      xp = pass ? 30 : 5;
      if (pass) {
        S.passed[P.lv] = true;
        if (P.jump) UNITS.forEach(function (u) { S.nodes[nodeKey(P.lv, u.id)] = Math.max(nodeDone(P.lv, u.id), LESSONS); });
        title = P.jump ? "飛び級成功！" : "まとめテスト合格！";
        note = P.lv < STAGES.length ? "ステージ" + (P.lv + 1) + "「" + stageOf(P.lv + 1).name + "」がひらきました" : APP.finale;
      } else {
        mood = "sad"; title = "あと少し！";
        note = "合格は" + Math.round(PASS * 100) + "%から。" + (P.jump ? "ステージ" + P.lv + "の単元で力をつけてから、もう一度。" : "苦手を復習してからもう一度。");
      }
    } else {
      xp = 10 + (acc === 1 ? 5 : 0) + Math.min(5, Math.floor(P.maxCombo / 3));
      if (P.mode === "lesson") {
        var k = nodeKey(P.lv, P.uid), was = nodeDone(P.lv, P.uid);
        S.nodes[k] = was + 1;
        if (was + 1 === LESSONS) extra = '<div class="crown">👑 「' + esc(unitById(P.uid).title) + '」クリア！</div>';
      }
      title = acc === 1 ? "パーフェクト！" : acc >= 0.8 ? "レッスン完了！" : "よくがんばった！";
      note = acc === 1 ? "1問もまちがえませんでした" : "まちがえた問題は「ふくしゅう」に入れておきました";
    }
    addXP(xp); S.lessons++; S.best = Math.max(S.best, streak());
    save();
    window.track("lesson_complete", { mode: P.mode, stage: P.lv || 0, accuracy: Math.round(acc * 100) });
    var goalNow = before < S.goal && todayXP() >= S.goal;
    beep("done");
    chrome(false);
    var mode = P.mode, lv = P.lv, uid = P.uid, passed = mode === "check" && acc >= PASS;
    $app.innerHTML = '<div class="wrap result">' + confetti(mood === "happy") + haniwa(mood, 130) +
      '<h1>' + title + '</h1>' + extra + '<p class="lead">' + esc(note) + '</p>' +
      '<div class="rstats"><div><small>XP</small><b>+' + xp + '</b></div><div><small>正答率</small><b>' + Math.round(acc * 100) + '%</b></div><div><small>じかん</small><b>' + Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, "0") + '</b></div></div>' +
      (goalNow ? '<div class="goalmsg">🎯 きょうの目標たっせい！ 連続 <b>' + streak() + '日</b></div>' : '<div class="goalbar"><span>きょうの目標</span><div class="sbar"><i style="width:' + Math.min(100, todayXP() / S.goal * 100) + '%"></i></div><span>' + todayXP() + '/' + S.goal + '</span></div>') +
      '<div class="stickybtn col">' +
      (mode === "lesson" && nodeDone(lv, uid) < LESSONS ? '<button class="btn big" id="again">つぎのレッスン</button>' : '') +
      (mode === "check" && !passed ? '<button class="btn big" id="retry">もう一度テスト</button>' : '') +
      '<button class="btn big ' + ((mode === "lesson" && nodeDone(lv, uid) < LESSONS) || (mode === "check" && !passed) ? "ghost" : "") + '" id="home">つづける</button></div></div>';
    P = null;
    var a = document.getElementById("again"); if (a) a.onclick = function () { startLesson(lv, uid); };
    var r = document.getElementById("retry"); if (r) r.onclick = function () { startCheck(lv, false); };
    document.getElementById("home").onclick = function () { viewPath.scrolled = false; location.hash = "#/"; };
  }
  function confetti(on) {
    if (!on) return "";
    var cs = ["#d9452b", "#f2b630", "#2fae66", "#2f86d9", "#8a55d6"], h = '<div class="confetti" aria-hidden="true">';
    for (var i = 0; i < 40; i++) h += '<i style="left:' + (Math.random() * 100) + '%;background:' + pick(cs) + ';animation-delay:' + (Math.random() * 0.6).toFixed(2) + 's;animation-duration:' + (1.6 + Math.random() * 1.4).toFixed(2) + 's;transform:rotate(' + Math.round(Math.random() * 360) + 'deg)"></i>';
    return h + "</div>";
  }

  /* ---------- ふくしゅう ---------- */
  function viewReview() {
    chrome(true); setTab("review"); renderTop();
    var due = dueCards(), all = Object.keys(S.cards).filter(function (k) { return FACTS[k]; });
    var weak = all.filter(function (k) { return S.cards[k].miss > 0; }).sort(function (a, b) { return S.cards[b].miss - S.cards[a].miss; }).slice(0, 12);
    var boxes = [0, 0, 0, 0];
    all.forEach(function (k) { var b = S.cards[k].box; boxes[b <= 1 ? 0 : b <= 3 ? 1 : b <= 5 ? 2 : 3]++; });
    $app.innerHTML = '<div class="wrap">' +
      '<section class="card hero">' + haniwa(due.length ? "" : "happy", 80) + '<div><h1>ふくしゅう</h1><p>' +
      (due.length ? 'いま復習するとよい問題が <b>' + due.length + '問</b> あります。忘れかけたころに解くと、いちばん記憶に残ります。' : all.length ? 'いまは全部おぼえています！ 苦手な順に練習もできます。' : 'レッスンで解いた問題が、ここに集まってきます。') +
      '</p><button class="btn big" id="go"' + (all.length ? "" : " disabled") + '>' + (due.length ? "復習をはじめる（" + Math.min(10, due.length) + "問）" : "苦手を練習する") + '</button></div></section>' +
      (all.length ? '<section class="card"><h3>🧠 記憶のようす（' + all.length + '問）</h3><div class="mem">' +
        ["これから", "おぼえかけ", "ほぼ定着", "ばっちり"].map(function (n, i) { return '<div><b>' + boxes[i] + '</b><small>' + n + '</small><i style="height:' + (all.length ? Math.max(4, boxes[i] / all.length * 80) : 4) + 'px" class="m' + i + '"></i></div>'; }).join("") + '</div></section>' : '') +
      (weak.length ? '<section class="card"><h3>⚠️ まちがえやすい問題</h3><ul class="weak">' + weak.map(function (k) { var f = FACTS[k]; return '<li><span>' + esc(f.q) + '</span><b>' + esc(f.a) + '</b><small>' + esc(f.unit.title) + '・ミス' + S.cards[k].miss + '回</small></li>'; }).join("") + '</ul></section>' : '') +
      '</div>';
    var g = document.getElementById("go"); if (g) g.onclick = startReview;
  }

  /* ---------- 年表（地理版は「データ帳」） ---------- */
  function tlName() { return APP.tlName || "年表"; }
  function tlIcon() { return APP.tlIcon || "📜"; }
  var tlLv = 0, tlQ = "";
  function viewTimeline() {
    chrome(true); setTab("timeline"); renderTop();
    if (!tlLv) tlLv = Math.max(1, Math.min(STAGES.length, S.start));
    $app.innerHTML = '<div class="wrap"><h1 class="ptitle">' + tlIcon() + ' ' + esc(tlName()) + '</h1>' +
      '<div class="seg">' + STAGES.map(function (s) { return '<button data-lv="' + s.lv + '" class="' + (s.lv === tlLv ? "on" : "") + '" style="--c:' + s.color + '">' + esc(s.name) + '</button>'; }).join("") + '</div>' +
      '<input class="search" id="q" type="search" placeholder="' + esc(APP.searchHint || "できごと・人物でさがす") + '" value="' + esc(tlQ) + '">' +
      '<div id="tl"></div></div>';
    [].forEach.call($app.querySelectorAll(".seg button"), function (b) { b.onclick = function () { tlLv = +b.dataset.lv; viewTimeline(); }; });
    var inp = document.getElementById("q");
    inp.oninput = function () { tlQ = inp.value.trim(); drawTL(); };
    drawTL();
  }
  function drawTL() {
    var h = "";
    UNITS.forEach(function (u) {
      var evs = (u.events || []).filter(function (e) { return e.lv <= tlLv && (!tlQ || (e.t + e.when).indexOf(tlQ) >= 0); }).sort(function (a, b) { return a.y - b.y; });
      var ps = tlQ ? (u.pairs || []).filter(function (p) { return p.lv <= tlLv && (p.l + p.r).indexOf(tlQ) >= 0; }) : [];
      if (!evs.length && !ps.length) return;
      h += '<section class="tlunit"><h3>' + u.emoji + ' ' + esc(u.title) + ' <small>' + esc(u.period) + '</small></h3>' + groups(evs).map(function (g) {
        return (g.k ? '<h4 class="gk">' + esc(g.k) + '</h4>' : '') + '<ol class="tlist">' +
          g.list.map(function (e) { return '<li><b>' + esc(e.when) + '</b><span>' + esc(e.t) + '</span><i class="lvdot" style="background:' + stageOf(e.lv).color + '" title="' + stageOf(e.lv).name + '"></i></li>'; }).join("") + '</ol>';
      }).join("") +
        (ps.length ? '<dl class="kw">' + ps.map(function (p) { return '<dt>' + esc(p.l) + '</dt><dd>' + esc(p.r) + '</dd>'; }).join("") + '</dl>' : '') + '</section>';
    });
    document.getElementById("tl").innerHTML = h || '<p class="empty">見つかりませんでした</p>';
  }

  /* ---------- きろく・設定 ---------- */
  var resetArmed = false;
  function viewMe() {
    chrome(true); setTab("me"); renderTop();
    var week = [];
    for (var i = 6; i >= 0; i--) { var d = new Date(); d.setDate(d.getDate() - i); week.push({ d: d, xp: S.days[ymd(d)] || 0 }); }
    var mx = Math.max(S.goal, Math.max.apply(null, week.map(function (w) { return w.xp; })));
    var acc = S.ans ? Math.round(S.ok / S.ans * 100) : 0;
    var badges = [
      [S.lessons >= 1, "🎉", "はじめの一歩"], [streak() >= 3 || S.best >= 3, "🔥", "3日連続"], [S.best >= 7 || streak() >= 7, "📅", "1週間連続"],
      [S.xp >= 500, "⭐", "500 XP"], [S.xp >= 3000, "🌟", "3000 XP"],
    ].concat(STAGES.map(function (s) { return [!!S.passed[s.lv], s.icon, s.name + "ステージ合格"]; }));
    $app.innerHTML = '<div class="wrap"><h1 class="ptitle">🏅 きろく</h1>' +
      '<div class="statgrid"><div class="card"><small>連続日数</small><b>🔥 ' + streak() + '日</b></div><div class="card"><small>合計</small><b>⭐ ' + S.xp + ' XP</b></div>' +
      '<div class="card"><small>レッスン</small><b>' + S.lessons + '回</b></div><div class="card"><small>正答率</small><b>' + acc + '%</b></div></div>' +
      '<section class="card"><h3>この7日間</h3><div class="week">' + week.map(function (w) {
        return '<div><i style="height:' + Math.max(3, w.xp / mx * 90) + 'px" class="' + (w.xp >= S.goal ? "hit" : "") + '"></i><small>' + "日月火水木金土"[w.d.getDay()] + '</small></div>';
      }).join("") + '<span class="goalline" style="bottom:' + (S.goal / mx * 90 + 22) + 'px"></span></div></section>' +
      '<section class="card"><h3>ステージ</h3>' + STAGES.map(function (s) {
        var n = stageCount(s.lv);
        return '<div class="srow" style="--c:' + s.color + '"><span>' + s.icon + ' ' + esc(s.name) + '</span><div class="sbar"><i style="width:' + (n / UNITS.length * 100) + '%"></i></div><small>' + n + '/' + UNITS.length + (S.passed[s.lv] ? " 🏆" : "") + '</small></div>';
      }).join("") + '</section>' +
      '<section class="card"><h3>バッジ</h3><div class="badges">' + badges.map(function (b) { return '<div class="' + (b[0] ? "got" : "") + '"><span>' + b[1] + '</span><small>' + b[2] + '</small></div>'; }).join("") + '</div></section>' +
      '<section class="card"><h3>せってい</h3>' +
      '<label class="row">1日の目標<select id="goal">' + GOALS.map(function (g) { return '<option value="' + g.xp + '"' + (g.xp === S.goal ? " selected" : "") + '>' + g.name + '（' + g.xp + ' XP）</option>'; }).join("") + '</select></label>' +
      '<label class="row">スタートのステージ<select id="start">' + STAGES.map(function (s) { return '<option value="' + s.lv + '"' + (s.lv === S.start ? " selected" : "") + '>' + s.icon + ' ' + s.name + '（' + s.grades + '）</option>'; }).join("") + '</select></label>' +
      '<label class="row">効果音<input type="checkbox" id="snd"' + (S.sound ? " checked" : "") + '></label>' +
      '<button class="btn small ghost danger" id="reset">記録をすべて消す</button></section>' +
      '<p class="foot">記録はこの端末の中だけに保存されます。教材：' + UNITS.length + '単元・' + Object.keys(FACTS).length + '問</p></div>';
    document.getElementById("goal").onchange = function (e) { S.goal = +e.target.value; save(); renderTop(); };
    document.getElementById("start").onchange = function (e) { S.start = +e.target.value; save(); toast("スタートを「" + stageOf(S.start).name + "」にしました"); };
    document.getElementById("snd").onchange = function (e) { S.sound = e.target.checked; save(); };
    var rb = document.getElementById("reset");
    rb.onclick = function () {
      if (!resetArmed) { resetArmed = true; rb.textContent = "本当に消す？ もう一度押すと消えます"; setTimeout(function () { resetArmed = false; if (rb.isConnected) rb.textContent = "記録をすべて消す"; }, 3000); return; }
      S = fresh(); save(); resetArmed = false; location.hash = "#/welcome";
    };
  }

  /* ---------- その他 ---------- */
  var toastT;
  function toast(msg) {
    var t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  document.addEventListener("keydown", function (e) {
    if (!P) return;
    var nb = document.getElementById("next");
    if (nb && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); nb.click(); return; }
    var n = +e.key;
    if (n >= 1 && n <= 4) { var b = $app.querySelector('.ans[data-i="' + (n - 1) + '"]'); if (b && !b.disabled) b.click(); }
    if (e.key === "o" || e.key === "1") { var m = $app.querySelector(".tf.maru"); if (m && !m.disabled) m.click(); }
    if (e.key === "x" || e.key === "2") { var x = $app.querySelector(".tf.batsu"); if (x && !x.disabled) x.click(); }
  });

  function route() {
    var h = location.hash.replace(/^#\/?/, "");
    var parts = h.split("/");
    window.scrollTo(0, 0);
    if (!S.started && parts[0] !== "welcome") { location.hash = "#/welcome"; return; }
    if (parts[0] !== "play") P = null;
    if (window.__GTAG_ENABLED) gtag("event", "page_view", { page_path: "/history/" + parts[0], page_location: location.href });
    switch (parts[0]) {
      case "welcome": return viewWelcome(0);
      case "node": return viewNode(+parts[1], parts[2]);
      case "play": return P ? renderQ() : (location.hash = "#/");
      case "review": return viewReview();
      case "timeline": return viewTimeline();
      case "me": return viewMe();
      default: return viewPath();
    }
  }
  (function () { var t = $nav.querySelector('[data-tab="timeline"]'); if (t) t.innerHTML = '<span class="ti">' + tlIcon() + '</span><span>' + esc(tlName()) + '</span>'; })();
  window.addEventListener("hashchange", route);
  route();
})();
