/* 百人一首まなび — 100首を5つの巻（各20首）に分けて覚える。
 * 画面：#/ 5つの巻 ／ #/s/1 巻 ／ #/p/17 歌 ／ #/s/1/cards 暗記カード ／ #/s/1/q/shimo|kimari|author|test クイズ
 *       #/all 百首一覧 ／ #/review 苦手復習（#/review/q で出題） ／ #/me 記録
 * 覚え具合 lv は 0〜3。正解・「覚えた」で +1、まちがい・「まだ」で -1。lv2 以上を「覚えた」と数える。
 * 巻のテスト（20問）で 16問以上正解すると、その巻は「修了」。 */
(function () {
  "use strict";
  var POEMS = window.POEMS, SECTIONS = window.SECTIONS;
  var KEY = "hyakunin:v1";
  var PASS = 16, PRACTICE_N = 10;
  var KIND_LABEL = { shimo: "下の句クイズ", kimari: "決まり字クイズ", author: "作者クイズ", test: "巻のテスト", review: "苦手復習" };

  /* ---------- 記録 ---------- */
  var S = load();
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
    s = s || {};
    s.lv = s.lv || {}; s.miss = s.miss || {}; s.best = s.best || {}; s.passed = s.passed || {};
    s.days = s.days || {}; s.xp = s.xp || 0; s.answered = s.answered || 0; s.correct = s.correct || 0;
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function touchToday() { S.days[ymd(new Date())] = 1; }
  function streak() {
    var d = new Date(), n = 0;
    if (!S.days[ymd(d)]) d.setDate(d.getDate() - 1);
    while (S.days[ymd(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function lv(no) { return S.lv[no] || 0; }
  function learned(list) { return list.filter(function (p) { return lv(p.no) >= 2; }).length; }
  function bump(no, ok) {
    S.lv[no] = Math.max(0, Math.min(3, lv(no) + (ok ? 1 : -1)));
    if (ok) { if (S.miss[no]) { S.miss[no]--; if (!S.miss[no]) delete S.miss[no]; } }
    else S.miss[no] = (S.miss[no] || 0) + 1;
    touchToday();
  }

  /* ---------- 小道具 ---------- */
  var $app = document.getElementById("app");
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function poem(no) { return POEMS[no - 1]; }
  function sec(id) { return SECTIONS[id - 1]; }
  function secOf(no) { return SECTIONS[Math.floor((no - 1) / 20)]; }
  function poemsOf(s) { return POEMS.slice(s.from - 1, s.to); }
  function lines(t) { return esc(t).replace(/　/g, " "); }
  function kanaFlat(t) { return t.replace(/　/g, ""); }
  /** 上の句の読みのうち、決まり字の部分を赤くする */
  function hlKimari(p) {
    var n = p.kimariji.length, out = "", c = 0;
    for (var i = 0; i < p.kamiKana.length; i++) {
      var ch = p.kamiKana[i];
      if (ch === "　") { out += " "; continue; }
      out += c < n ? '<span class="kima">' + esc(ch) + "</span>" : esc(ch);
      c++;
    }
    return out.replace(/<\/span><span class="kima">/g, "");
  }
  function lvDots(no) { var l = lv(no), s = ""; for (var i = 0; i < 3; i++) s += '<i class="' + (i < l ? "on" : "") + '"></i>'; return '<span class="lv" aria-label="覚え具合 ' + l + '/3">' + s + "</span>"; }
  var ICON_X = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var ICON_SPEAK = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11"/></svg>';

  /* ---------- 読み上げ ---------- */
  function speak(p, part) {
    if (!("speechSynthesis" in window)) { alert("この端末は読み上げに対応していません"); return; }
    speechSynthesis.cancel();
    var text = part === "kami" ? p.kamiKana : part === "shimo" ? p.shimoKana : p.kamiKana + "　　" + p.shimoKana;
    var u = new SpeechSynthesisUtterance(text.replace(/　+/g, "、"));
    u.lang = "ja-JP"; u.rate = 0.75;
    var v = speechSynthesis.getVoices().filter(function (v) { return /^ja/i.test(v.lang); })[0];
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }

  /* ---------- 上のステータス・下のタブ ---------- */
  function renderStats() {
    document.getElementById("stats").innerHTML =
      '<a class="brand" href="#/"><b>百人一首</b>まなび</a>' +
      '<div class="chips">' +
      '<span class="chip green" title="覚えた歌">' + learned(POEMS) + '<small>/100</small></span>' +
      '<span class="chip" title="連続日数">🔥' + streak() + "</span>" +
      '<span class="chip gold" title="XP">★' + S.xp + "</span></div>";
  }
  function setTab(t) {
    document.querySelectorAll("#nav a").forEach(function (a) { a.classList.toggle("on", a.dataset.tab === t); });
    document.body.classList.toggle("in-lesson", !t);
  }

  /* ---------- 画面：5つの巻 ---------- */
  function viewHome() {
    setTab("home");
    var total = learned(POEMS);
    var next = SECTIONS.filter(function (s) { return !S.passed[s.id]; })[0];
    var h = '<div class="hero"><h1>百人一首を5つの巻で覚える</h1>' +
      '<p class="muted">100首を20首ずつ5つの巻に分けました。一の巻から順に、暗記カード → クイズ → 巻のテストで進みましょう。</p></div>' +
      '<div class="overall"><div class="row" style="justify-content:space-between"><b>全体の進み具合</b><span class="muted">' + total + ' / 100首 ・ 修了 ' + Object.keys(S.passed).length + ' / 5巻</span></div>' +
      '<div class="bar" style="margin-top:8px"><i style="width:' + total + '%"></i></div>' +
      (next ? '<p class="muted" style="margin-top:8px">次のおすすめ：<a href="#/s/' + next.id + '">' + next.name + "（" + next.from + "〜" + next.to + "番）</a></p>" : '<p style="margin-top:8px">🎉 5つの巻をすべて修了しました！</p>') +
      "</div>";
    SECTIONS.forEach(function (s) {
      var list = poemsOf(s), n = learned(list);
      h += '<a class="sec-card s-' + s.color + '" href="#/s/' + s.id + '">' +
        '<div class="sec-badge">' + s.name[0] + (S.passed[s.id] ? '<span class="seal">修了</span>' : "") + "</div>" +
        '<div class="sec-body"><div class="sec-title">' + s.name + "<small>" + s.from + "〜" + s.to + "番</small></div>" +
        '<p class="sec-theme">' + esc(s.theme) + (S.best[s.id] != null ? " ・ テスト最高 " + S.best[s.id] + "/20" : "") + "</p>" +
        '<div class="bar"><i style="width:' + n * 5 + '%"></i></div>' +
        '<p class="muted" style="margin:4px 0 0">覚えた ' + n + " / 20首</p></div></a>";
    });
    $app.innerHTML = h;
  }

  /* ---------- 画面：巻 ---------- */
  function viewSection(id) {
    var s = sec(id); if (!s) return go("#/");
    setTab("home");
    var list = poemsOf(s);
    var h = '<div class="sec-head s-' + s.color + '"><h1>' + s.name + '<span class="muted" style="font-size:15px;margin-left:8px">' + s.from + "〜" + s.to + "番</span></h1>" +
      "<p><b>" + esc(s.theme) + "</b></p><p class=\"muted\">" + esc(s.note) + "</p>" +
      '<div class="bar" style="margin-top:8px"><i style="width:' + learned(list) * 5 + '%"></i></div>' +
      '<p class="muted" style="margin:4px 0 0">覚えた ' + learned(list) + " / 20首" + (S.passed[id] ? " ・ <b>修了</b>" : "") + "</p></div>" +
      '<div class="modes s-' + s.color + '">' +
      '<a class="mode" href="#/s/' + id + '/cards"><b>① 暗記カード</b><span>上の句を見て下の句を思い出す。決まり字つき</span></a>' +
      '<a class="mode" href="#/s/' + id + '/q/shimo"><b>② 下の句クイズ</b><span>上の句に続く下の句を選ぶ（' + PRACTICE_N + '問）</span></a>' +
      '<a class="mode" href="#/s/' + id + '/q/kimari"><b>③ 決まり字クイズ</b><span>決まり字だけで取り札を取る（' + PRACTICE_N + '問）</span></a>' +
      '<a class="mode" href="#/s/' + id + '/q/author"><b>④ 作者クイズ</b><span>歌から詠み人を当てる（' + PRACTICE_N + '問）</span></a>' +
      '<a class="mode test" href="#/s/' + id + '/q/test"><b>⑤ 巻のテスト（20問）</b><span>' + PASS + '問以上で修了。' + (S.best[id] != null ? "最高 " + S.best[id] + "/20" : "まだ受けていません") + "</span></a></div>" +
      "<h2>この巻の20首</h2>" + poemList(list);
    $app.innerHTML = h;
  }
  function poemList(list) {
    return '<ul class="poem-list">' + list.map(function (p) {
      return '<li><a href="#/p/' + p.no + '"><span class="poem-no">' + p.no + '</span><span class="poem-line"><span class="waka">' + lines(p.kami) + "</span><small>" + hlKimari(p) + " ・ " + esc(p.author) + "</small></span>" + lvDots(p.no) + "</a></li>";
    }).join("") + "</ul>";
  }

  /* ---------- 画面：歌 ---------- */
  function viewPoem(no) {
    var p = poem(no); if (!p) return go("#/");
    var s = secOf(no);
    setTab("home");
    $app.innerHTML =
      '<p class="muted"><a href="#/s/' + s.id + '">← ' + s.name + "</a></p>" +
      '<article class="poem-view"><div class="no">' + p.no + "番 ・ " + s.name + "</div>" +
      '<div class="author"><ruby>' + esc(p.author) + "<rt>" + esc(p.authorKana) + "</rt></ruby></div>" +
      '<p class="verse">' + lines(p.kami) + '</p><p class="kana">' + hlKimari(p) + "</p>" +
      '<p class="verse shimo">' + lines(p.shimo) + '</p><p class="kana" style="padding-left:2em">' + lines(p.shimoKana) + "</p>" +
      '<p>決まり字 <span class="kimari-tag">' + esc(p.kimariji) + "</span> <span class=\"muted\">（" + p.kimariji.length + "字決まり）</span></p>" +
      '<div class="meaning"><b>意味</b><br>' + esc(p.meaning) + "</div></article>" +
      '<div class="row"><button class="btn ghost" id="say">' + ICON_SPEAK + "読み上げ</button></div>" +
      '<div class="row" style="margin-top:12px">' +
      (no > 1 ? '<a class="btn ghost small" href="#/p/' + (no - 1) + '">← ' + (no - 1) + "番</a>" : "") +
      (no < 100 ? '<a class="btn ghost small" href="#/p/' + (no + 1) + '">' + (no + 1) + "番 →</a>" : "") + "</div>";
    document.getElementById("say").onclick = function () { speak(p); };
  }

  /* ---------- 画面：暗記カード ---------- */
  function viewCards(id) {
    var s = sec(id); if (!s) return go("#/");
    setTab(null);
    var list = poemsOf(s);
    var queue = list.filter(function (p) { return lv(p.no) < 2; }).concat(list.filter(function (p) { return lv(p.no) >= 2; }));
    var total = queue.length, done = 0, again = {}, flipped = false, cur = null;
    function next() {
      if (!queue.length) return finish();
      cur = queue.shift(); flipped = false; draw();
    }
    function draw() {
      var p = cur;
      $app.innerHTML = lessonTop(done / total) +
        '<p class="q-label">' + s.name + " ・ 暗記カード ・ " + p.no + "番</p>" +
        '<div class="flash" id="flash" role="button" tabindex="0" aria-label="カードをめくる">' +
        '<p class="verse">' + lines(p.kami) + '</p><p class="kana">' + hlKimari(p) + "</p>" +
        (flipped
          ? '<hr style="border:0;border-top:1px dashed var(--line);width:100%"><p class="verse">' + lines(p.shimo) + '</p><p class="kana">' + lines(p.shimoKana) + "</p>" +
            '<p class="muted">' + esc(p.author) + "</p><p style=\"font-size:14px;text-align:left\">" + esc(p.meaning) + "</p>"
          : '<p class="hint">下の句を思い出してから、タップしてめくる</p>') +
        "</div>" +
        '<div class="row" style="margin-top:14px"><button class="btn ghost small" id="say">' + ICON_SPEAK + "読む</button></div>" +
        (flipped
          ? '<div class="row" style="margin-top:14px"><button class="btn orange" id="no">まだ</button><button class="btn green" id="yes">覚えた</button></div>'
          : '<div class="row" style="margin-top:14px"><button class="btn block" id="flip">めくる</button></div>');
      bindX();
      var f = document.getElementById("flash");
      f.onclick = f.onkeydown = function (e) { if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return; if (!flipped) { flipped = true; draw(); } };
      document.getElementById("say").onclick = function () { speak(p, flipped ? "all" : "kami"); };
      if (flipped) {
        document.getElementById("yes").onclick = function () { bump(p.no, true); S.xp += 2; done++; save(); next(); };
        document.getElementById("no").onclick = function () {
          S.lv[p.no] = Math.max(0, lv(p.no) - 1); touchToday(); save();
          if (!again[p.no]) { again[p.no] = 1; queue.push(p); total++; }
          done++; next();
        };
      } else document.getElementById("flip").onclick = function () { flipped = true; draw(); };
    }
    function finish() {
      renderStats();
      $app.innerHTML = '<div class="result"><h1>カードをひと回りしました</h1>' +
        '<p class="muted">' + s.name + " で覚えた歌：" + learned(list) + " / 20首</p>" +
        '<div class="row" style="margin-top:20px"><a class="btn ghost" href="#/s/' + id + '">巻にもどる</a><a class="btn green" href="#/s/' + id + '/q/shimo">クイズへ</a></div></div>';
    }
    next();
  }
  function lessonTop(frac) {
    return '<div class="lesson-top"><button class="x" id="x" aria-label="やめる">' + ICON_X + '</button><div class="progress"><i style="width:' + Math.round(frac * 100) + '%"></i></div></div>';
  }
  function bindX() { document.getElementById("x").onclick = function () { speechSynthesis && speechSynthesis.cancel && speechSynthesis.cancel(); history.length > 1 ? history.back() : go("#/"); }; }

  /* ---------- クイズ ---------- */
  /** 出題する歌を選ぶ。練習は覚え具合の低い歌を優先し、テストは20首すべて */
  function pickPoems(list, n) {
    var byLv = shuffle(list).sort(function (a, b) { return lv(a.no) - lv(b.no); });
    return shuffle(byLv.slice(0, Math.min(n, list.length)));
  }
  /** まぎらわしい選択肢を優先して3つ選ぶ（決まり字クイズは同じ頭の音の札を先に） */
  function distractors(p, pool, kind) {
    var others = shuffle(pool.filter(function (q) { return q.no !== p.no && (kind !== "author" || q.author !== p.author); }));
    if (kind === "kimari") {
      var head = kanaFlat(p.kamiKana)[0];
      others.sort(function (a, b) { return (kanaFlat(b.kamiKana)[0] === head) - (kanaFlat(a.kamiKana)[0] === head); });
    }
    return others.slice(0, 3);
  }
  function viewQuiz(id, kind) {
    var s = id ? sec(id) : null;
    if (id && !s) return go("#/");
    if (!KIND_LABEL[kind]) return go("#/");
    var list, pool, n;
    if (kind === "review") {
      list = POEMS.filter(function (p) { return S.miss[p.no]; });
      if (!list.length) return go("#/review");
      list = shuffle(list).slice(0, PRACTICE_N);
      pool = POEMS;
    } else {
      pool = poemsOf(s);
      list = kind === "test" ? shuffle(pool) : pickPoems(pool, PRACTICE_N);
    }
    var kinds = ["shimo", "kimari", "author"];
    var qs = list.map(function (p, i) {
      var k = kind === "test" || kind === "review" ? kinds[i % 3] : kind;
      var opts = shuffle([p].concat(distractors(p, kind === "review" ? POEMS.filter(function (q) { return secOf(q.no) === secOf(p.no); }) : pool, k)));
      return { p: p, k: k, opts: opts };
    });
    if (kind === "test") qs = shuffle(qs);
    n = qs.length;
    var i = 0, right = 0, misses = [];
    setTab(null);

    function draw(answered, picked) {
      var q = qs[i], p = q.p, h = lessonTop(i / n);
      h += '<p class="q-label">' + (s ? s.name + " ・ " : "") + KIND_LABEL[kind] + " ・ " + (i + 1) + " / " + n + "</p>";
      if (q.k === "shimo") {
        h += '<div class="q-box"><p class="muted">この上の句に続く下の句は？</p><p class="verse">' + lines(p.kami) + '</p><p class="kana">' + lines(p.kamiKana) + "</p></div>";
        h += '<div class="choices">' + q.opts.map(function (o, j) { return '<button class="choice waka" data-j="' + j + '">' + lines(o.shimo) + "</button>"; }).join("") + "</div>";
      } else if (q.k === "kimari") {
        h += '<div class="q-box"><p class="muted">読手が「…」と読み始めた。取る札は？</p><div class="q-big">' + esc(p.kimariji) + '</div><p class="muted">' + p.kimariji.length + "字決まり</p></div>";
        h += '<div class="fuda-grid">' + q.opts.map(function (o, j) { return '<button class="fuda" data-j="' + j + '">' + esc(o.shimoKana) + "</button>"; }).join("") + "</div>";
      } else {
        h += '<div class="q-box"><p class="muted">この歌を詠んだのは？</p><p class="verse">' + lines(p.kami) + '</p><p class="verse">' + lines(p.shimo) + "</p></div>";
        h += '<div class="choices">' + q.opts.map(function (o, j) { return '<button class="choice" data-j="' + j + '">' + esc(o.author) + "</button>"; }).join("") + "</div>";
      }
      if (answered) {
        var ok = q.opts[picked] === p;
        h += '<div class="feedback ' + (ok ? "ok" : "ng") + '"><h3>' + (ok ? "正解！" : "ざんねん") + "</h3>" +
          '<p class="waka">' + p.no + "番　" + lines(p.kami) + "　" + lines(p.shimo) + "</p>" +
          '<p class="muted">' + esc(p.author) + " ・ 決まり字「" + esc(p.kimariji) + "」</p>" +
          '<div class="row" style="margin-top:10px"><button class="btn ghost small" id="say" style="flex:none">' + ICON_SPEAK + '</button><button class="btn ' + (ok ? "green" : "red") + '" id="next">' + (i + 1 < n ? "つぎへ" : "結果を見る") + "</button></div></div>";
      }
      $app.innerHTML = h;
      bindX();
      var btns = $app.querySelectorAll("[data-j]");
      btns.forEach(function (b) {
        var j = +b.dataset.j;
        if (answered) {
          b.disabled = true;
          if (q.opts[j] === p) b.classList.add("ok");
          else if (j === picked) b.classList.add("ng");
          else if (q.k === "kimari") b.classList.add("dim");
        } else b.onclick = function () { answer(j); };
      });
      if (answered) {
        document.getElementById("next").onclick = function () { i++; i < n ? draw(false) : finish(); };
        document.getElementById("say").onclick = function () { speak(p); };
        document.getElementById("next").focus();
      }
    }
    function answer(j) {
      var q = qs[i], ok = q.opts[j] === q.p;
      bump(q.p.no, ok);
      S.answered++;
      if (ok) { right++; S.correct++; S.xp += 10; } else misses.push(q.p);
      save();
      draw(true, j);
    }
    function finish() {
      var passedNow = false;
      if (kind === "test") {
        if (S.best[id] == null || right > S.best[id]) S.best[id] = right;
        if (right >= PASS && !S.passed[id]) { S.passed[id] = ymd(new Date()); passedNow = true; S.xp += 100; }
        save();
        if (right >= PASS && window.trackConversion) trackConversion("app_action_complete", { site: "hyakunin", action: "section_pass", section: id, score: right });
      }
      renderStats();
      var h = '<div class="result"><h1>' + KIND_LABEL[kind] + "の結果</h1>" +
        '<div class="score">' + right + "<small> / " + n + "</small></div>";
      if (kind === "test") h += right >= PASS ? '<div class="stamp">' + s.name + " 修了</div>" + (passedNow ? "<p>+100 XP</p>" : "") : '<p class="muted">' + PASS + "問以上で修了です。もう一度挑戦しましょう。</p>";
      if (misses.length) h += '<div class="miss-list"><h2>まちがえた歌</h2>' + poemList(misses) + '<p class="muted">まちがえた歌は「苦手復習」に入ります。</p></div>';
      var back = s ? "#/s/" + id : "#/review";
      h += '<div class="row" style="margin-top:20px"><a class="btn ghost" href="' + back + '">もどる</a><button class="btn green" id="again">もう一度</button></div></div>';
      if (passedNow && id < 5) h += '<p style="text-align:center;margin-top:16px"><a class="btn" href="#/s/' + (id + 1) + '">' + sec(id + 1).name + "へ進む</a></p>";
      $app.innerHTML = h;
      document.getElementById("again").onclick = function () { viewQuiz(id, kind); };
    }
    draw(false);
  }

  /* ---------- 画面：百首一覧 ---------- */
  var allFilter = 0;
  function viewAll() {
    setTab("all");
    var list = allFilter ? poemsOf(sec(allFilter)) : POEMS;
    $app.innerHTML = "<h1>百首一覧</h1>" +
      '<div class="seg" id="seg"><button data-f="0" class="' + (allFilter ? "" : "on") + '">すべて</button>' +
      SECTIONS.map(function (s) { return '<button data-f="' + s.id + '" class="' + (allFilter === s.id ? "on" : "") + '">' + s.name + "</button>"; }).join("") + "</div>" +
      poemList(list);
    document.querySelectorAll("#seg button").forEach(function (b) { b.onclick = function () { allFilter = +b.dataset.f; viewAll(); }; });
  }

  /* ---------- 画面：苦手復習 ---------- */
  function viewReview() {
    setTab("review");
    var list = POEMS.filter(function (p) { return S.miss[p.no]; });
    var h = "<h1>苦手復習</h1><p class=\"muted\">クイズでまちがえた歌がここに集まります。正解するたびに減っていきます。</p>";
    if (!list.length) h += '<div class="empty"><p>いまは苦手な歌がありません。</p><p><a href="#/">巻にもどって練習する</a></p></div>';
    else h += '<p><button class="btn red block" id="go">苦手な歌を復習する（' + Math.min(list.length, PRACTICE_N) + "問）</button></p>" + poemList(list);
    $app.innerHTML = h;
    var b = document.getElementById("go"); if (b) b.onclick = function () { go("#/review/q"); };
  }

  /* ---------- 画面：記録 ---------- */
  function viewMe() {
    setTab("me");
    var rate = S.answered ? Math.round(S.correct / S.answered * 100) : 0;
    var h = "<h1>記録</h1>" +
      '<div class="stat-grid"><div class="stat"><b>' + learned(POEMS) + "</b><span>覚えた歌</span></div>" +
      '<div class="stat"><b>' + Object.keys(S.passed).length + "/5</b><span>修了した巻</span></div>" +
      '<div class="stat"><b>' + streak() + "</b><span>連続日数</span></div>" +
      '<div class="stat"><b>' + S.xp + "</b><span>XP</span></div>" +
      '<div class="stat"><b>' + S.answered + "</b><span>解いた問題</span></div>" +
      '<div class="stat"><b>' + rate + "%</b><span>正答率</span></div></div>" +
      "<h2>巻ごとの記録</h2>";
    SECTIONS.forEach(function (s) {
      var n = learned(poemsOf(s));
      h += '<div class="s-' + s.color + '" style="margin-bottom:12px"><div class="row" style="justify-content:space-between"><b>' + s.name + "</b>" +
        '<span class="muted">覚えた ' + n + "/20 ・ テスト " + (S.best[s.id] != null ? S.best[s.id] + "/20" : "－") + (S.passed[s.id] ? " ・ 修了 " + S.passed[s.id] : "") + "</span></div>" +
        '<div class="bar"><i style="width:' + n * 5 + '%"></i></div></div>';
    });
    h += "<h2>決まり字のしくみ</h2><p class=\"muted\">競技かるたでは、上の句の最初の何文字かを聞いた時点で札が1枚に決まります。これを決まり字といいます。1字決まりは「むすめふさほせ」の7枚。この記録はこの端末に保存されます。</p>" +
      '<p style="margin-top:24px"><button class="btn ghost small" id="reset">記録をすべて消す</button></p>';
    $app.innerHTML = h;
    document.getElementById("reset").onclick = function () {
      if (!confirm("学習の記録をすべて消します。よろしいですか？")) return;
      try { localStorage.removeItem(KEY); } catch (e) {}
      S = load(); renderStats(); viewMe();
    };
  }

  /* ---------- ルーター ---------- */
  function go(h) { location.hash = h; }
  function route() {
    if (window.speechSynthesis) speechSynthesis.cancel();
    var h = location.hash.replace(/^#/, "") || "/", m;
    renderStats();
    if ((m = h.match(/^\/s\/(\d)\/cards$/))) viewCards(+m[1]);
    else if ((m = h.match(/^\/s\/(\d)\/q\/(\w+)$/))) viewQuiz(+m[1], m[2]);
    else if ((m = h.match(/^\/s\/(\d)$/))) viewSection(+m[1]);
    else if ((m = h.match(/^\/p\/(\d{1,3})$/))) viewPoem(+m[1]);
    else if (h === "/all") viewAll();
    else if (h === "/review") viewReview();
    else if (h === "/review/q") viewQuiz(0, "review");
    else if (h === "/me") viewMe();
    else viewHome();
    window.scrollTo(0, 0);
    if (window.trackPageView) trackPageView(location.pathname + "#" + h, document.title);
  }
  window.addEventListener("hashchange", route);
  route();
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(function () {});
})();
