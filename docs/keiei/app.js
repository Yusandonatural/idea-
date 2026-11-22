// 経営評定：画面（国取り・商い・店・評定・外交・奉行所・内政・武将・帳簿・年表）。計算は logic.js（window.KEIEI）。
(function () {
  "use strict";
  var K = window.KEIEI, SAMPLE = window.KEIEI_SAMPLE;
  var KEY = "keiei:v1";          // 保存場所の名前は第1版から同じ。中身の版数は state.v（logic.js の DATA_VERSION）
  var UIKEY = "keiei:ui";        // 最後に見た地図（国取り／商い）だけを覚える
  var state;
  var ui = { sel: "", chMonth: null, hyMonth: null, booted: false, world: "akinai", draft: null, lastOrder: null };

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var yen = K.fmtYen, man = K.fmtMan, pct = K.fmtPct, koku = K.fmtKoku, area = K.fmtArea;
  var today = function () { return K.todayStr(); };
  var reduceMotion = function () { return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; };

  // ---------- 保存 ----------
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (raw) {
      try { return K.normalize(JSON.parse(raw)); }
      catch (e) { try { localStorage.setItem(KEY + ":broken", raw); } catch (e2) { /* 保存できない端末 */ } }
    }
    return K.normalize(SAMPLE.build());
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { toast("この端末に保存できませんでした（容量やプライベートモードを確認してください）"); return false; }
  }
  function commit(next, msg) {
    state = next;
    save();
    render();
    if (msg) toast(msg);
  }
  function rememberWorld(w) {
    ui.world = w;
    try { localStorage.setItem(UIKEY, w); } catch (e) { /* 覚えられなくても動く */ }
  }
  try { var w0 = localStorage.getItem(UIKEY); if (w0 === "kuni" || w0 === "akinai") ui.world = w0; } catch (e) { /* なし */ }

  // ---------- 小物 ----------
  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2800);
  }
  var byId = function (list, id) { return (list || []).filter(function (x) { return x.id === id; })[0]; };
  function shopName(id) { var c = byId(state.castles, id); return c ? c.name : ""; }
  function generalName(id) { var g = byId(state.generals, id); return g ? g.name : ""; }
  function houseName(id) { var h = byId(state.houses, id); return h ? h.name : ""; }
  function fieldOf(id) { return byId(state.fields, id); }
  function lordsOf(cid) { return state.generals.filter(function (g) { return g.castle === cid; }); }
  function kindOf(key) { return K.KINDS.filter(function (k) { return k.key === key; })[0] || K.KINDS[0]; }
  function statusName(key) { var s = K.STATUSES.filter(function (x) { return x.key === key; })[0]; return s ? s.name : ""; }
  function ml(ym) { return K.monthLabel(ym); }
  function term(main, sub) { return esc(main) + '<small class="sub">（' + esc(sub) + "）</small>"; }
  function kokuLabel(a) { return koku(K.kokuOf(state, a)) + '<small class="sub">（' + area(a) + "）</small>"; }
  function gauge(rate, label) {
    var w = rate === null ? 0 : Math.max(0, Math.min(1, rate)) * 100;
    var st = K.castleStatus(rate, rate === null ? 0 : 1).key;
    return '<span class="gauge g-' + st + '" role="img" aria-label="' + esc(label || "達成率") + " " + pct(rate) + '"><i style="width:' + w.toFixed(1) + '%"></i><b>' + pct(rate) + "</b></span>";
  }
  function stars(n) {
    var s = "";
    for (var i = 1; i <= 5; i++) s += i <= n ? "★" : "☆";
    return '<span class="stars" role="img" aria-label="友好度 5段階の' + n + '">' + s + "</span>";
  }
  function daysAgo(d) {
    if (!d) return '<span class="muted">記録なし</span>';
    var n = K.daysBetween(d, today());
    return esc(d) + ' <small class="sub">（' + (n <= 0 ? "今日" : n + "日前") + "）</small>";
  }
  function tenkaGauge(compact) {
    var t = K.tenka(state);
    var wr = Math.min(1, t.rateReal) * 100, we = Math.min(1, t.rateExpected) * 100;
    return '<div class="tenka' + (compact ? " compact" : "") + '"><div class="tg-bar" role="img" aria-label="天下取りゲージ。目標' + koku(t.target) + "に対し、実高" + pct(t.rateReal) + "、見込み込み" + pct(t.rateExpected) + '">' +
      '<i class="tg-exp" style="width:' + we.toFixed(1) + '%"></i><i class="tg-real" style="width:' + wr.toFixed(1) + '%"></i><b>' + pct(t.rateReal) + "</b></div>" +
      '<p class="tg-legend"><span><i class="lg lg-real"></i>実高 ' + koku(t.real) + "（" + pct(t.rateReal) + '）</span><span><i class="lg lg-exp"></i>見込み込み ' + koku(t.withExpected) + "（" + pct(t.rateExpected) + "）</span><span>目標 " + koku(t.target) + "</span></p></div>";
  }
  function monthNav(cur, months, key) {
    var i = months.indexOf(cur);
    var opts = months.slice().reverse().map(function (m) {
      var l = ml(m);
      return '<option value="' + m + '"' + (m === cur ? " selected" : "") + ">" + l.wareki + " " + l.wafu + "（" + l.seireki + "）" + (m === state.current ? "・今月" : "") + "</option>";
    }).join("");
    return '<div class="month-nav" data-key="' + key + '">' +
      '<button type="button" class="btn ghost" data-mnav="-1"' + (i <= 0 ? " disabled" : "") + ' aria-label="前の月">◀<span class="hide-sm"> 前の月</span></button>' +
      '<label><span class="sr-only">月を選ぶ</span><select data-msel>' + opts + "</select></label>" +
      '<button type="button" class="btn ghost" data-mnav="1"' + (i >= months.length - 1 ? " disabled" : "") + ' aria-label="次の月"><span class="hide-sm">次の月 </span>▶</button></div>';
  }
  function bindMonthNav(root, months, setter) {
    var nav = $(".month-nav", root);
    if (!nav) return;
    $$("[data-mnav]", nav).forEach(function (b) {
      b.addEventListener("click", function () {
        var cur = $("[data-msel]", nav).value;
        var i = months.indexOf(cur) + (+b.dataset.mnav);
        if (i >= 0 && i < months.length) { setter(months[i]); renderView(); var nb = $('.month-nav [data-mnav="' + b.dataset.mnav + '"]'); if (nb && !nb.disabled) nb.focus(); }
      });
    });
    $("[data-msel]", nav).addEventListener("change", function (e) { setter(e.target.value); renderView(); var s = $(".month-nav [data-msel]"); if (s) s.focus(); });
  }
  function copyText(text, okMsg) {
    var done = function () { toast(okMsg || "写しました（貼り付けて使えます）"); };
    var fallback = function () {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      if (ok) done(); else toast("写せませんでした。文面を選んで手で写してください");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  // ---------- 飾り（SVG） ----------
  function kamon(size) {
    var leaf = '<path d="M0 -6 C9 -13 9 -27 0 -36 C-9 -27 -9 -13 0 -6Z"/><path d="M0 -8 V-32" class="vein"/>';
    return '<svg class="kamon" viewBox="-50 -50 100 100" width="' + size + '" height="' + size + '" aria-hidden="true" focusable="false">' +
      '<circle r="45" class="ring"/><circle r="38" class="ring2"/>' +
      [0, 120, 240].map(function (a) { return '<g transform="rotate(' + a + ')">' + leaf + "</g>"; }).join("") +
      '<circle r="5"/></svg>';
  }
  function advisorFigure() {
    return '<svg class="figure" viewBox="0 0 100 120" aria-hidden="true" focusable="false">' +
      '<circle cx="50" cy="60" r="48" class="halo"/>' +
      '<path d="M40 14 Q50 2 62 10 L60 30 L40 30 Z" class="sil"/>' +
      '<circle cx="50" cy="38" r="12" class="sil"/>' +
      '<path d="M14 112 Q16 66 50 56 Q84 66 86 112 Z" class="sil"/>' +
      '<path d="M50 58 L40 84 M50 58 L60 84" class="line"/>' +
      '<path d="M62 76 L88 52 L94 62 Z" class="fan"/>' +
      '<path d="M62 76 L88 52 M62 76 L91 57 M62 76 L94 62" class="line"/>' +
      "</svg>";
  }
  // 奉行の姿（役目ごとに持ち物を変える。すべて自作の図形）
  function bugyoFigure(icon) {
    var body = '<circle cx="50" cy="60" r="48" class="halo"/><circle cx="50" cy="40" r="12" class="sil"/><path d="M16 112 Q18 68 50 58 Q82 68 84 112 Z" class="sil"/><path d="M50 60 L41 86 M50 60 L59 86" class="line"/>';
    var acc = {
      kanjo: '<path d="M38 26 Q50 16 62 26 L62 31 L38 31 Z" class="sil"/><rect x="26" y="78" width="48" height="18" rx="2" class="gold"/><path d="M30 82 H70 M30 87 H70 M30 92 H70" class="ink"/><circle cx="36" cy="82" r="1.8" class="ink-f"/><circle cx="46" cy="87" r="1.8" class="ink-f"/><circle cx="58" cy="92" r="1.8" class="ink-f"/><circle cx="64" cy="82" r="1.8" class="ink-f"/>',
      nosei: '<path d="M22 32 Q50 8 78 32 Z" class="gold"/><path d="M72 104 Q78 74 74 50" class="leaf-l"/><path d="M74 58 q8 -4 10 -12 M75 66 q8 -3 11 -10 M74 74 q7 -2 10 -8" class="leaf-l"/>',
      akinai: '<path d="M38 28 L50 20 L62 28 Z" class="sil"/><rect x="58" y="72" width="24" height="30" rx="2" class="gold"/><path d="M62 78 H78 M62 84 H78 M62 90 H74" class="ink"/>',
      gaiko: '<path d="M38 26 Q50 18 62 26 L62 31 L38 31 Z" class="sil"/><rect x="58" y="70" width="30" height="12" rx="6" class="paper"/><path d="M62 76 H84" class="ink"/><circle cx="58" cy="76" r="6" class="gold"/><circle cx="88" cy="76" r="6" class="gold"/>',
      metsuke: '<path d="M36 30 Q50 22 64 30" class="line"/><path d="M78 56 V66" class="line"/><ellipse cx="78" cy="80" rx="10" ry="14" class="lantern"/><path d="M68 74 H88 M68 86 H88" class="ink"/>',
      other: '<path d="M38 27 Q50 19 62 27 L62 31 L38 31 Z" class="sil"/>'
    };
    return '<svg class="figure bfig" viewBox="0 0 100 120" aria-hidden="true" focusable="false">' + body + (acc[icon] || acc.other) + "</svg>";
  }
  // 店構え（暖簾の町家と、後ろの蔵）
  function shopIcon(st, initial, hasKura) {
    var lat = "", mus = "";
    for (var x = -40; x <= 40; x += 8) lat += "M" + x + " -4 V34 ";
    for (var y = -36; y <= 36; y += 6) mus += "M" + y + " -30 V-16 ";
    return '<g class="ico shopico sh-' + st + '">' +
      (hasKura ? '<g class="kura"><rect x="22" y="-58" width="34" height="30" class="kwall"/><rect x="22" y="-38" width="34" height="10" class="kbase"/><path d="M18 -58 L26 -68 L52 -68 L60 -58 Z" class="kroof"/><rect x="34" y="-53" width="10" height="7" class="kwin"/></g>' : "") +
      '<rect x="-60" y="34" width="120" height="8" rx="2" class="step"/>' +
      '<rect x="-50" y="-34" width="100" height="22" class="wall2"/>' +
      '<path d="' + mus + '" class="mus"/>' +
      '<path d="M-62 -34 L-48 -50 L48 -50 L62 -34 Z" class="roof"/>' +
      '<path d="M-48 -44 H48 M-52 -39 H52" class="tile"/>' +
      '<rect x="-50" y="-12" width="100" height="46" class="wall"/>' +
      '<path d="' + lat + '" class="koshi"/>' +
      '<path d="M-64 -10 L-54 -20 L54 -20 L64 -10 Z" class="roof"/>' +
      '<path d="M-44 -8 H-16 V22 H-44 Z M-14 -8 H14 V22 H-14 Z M16 -8 H44 V22 H16 Z" class="noren"/>' +
      '<text y="12" class="noren-t">' + esc(initial) + "</text>" +
      "</g>";
  }

  // ---------- 地図の形（国取り：抽象的な島をボロノイ風に区切る） ----------
  var SLOTS = [[-0.58, -0.32], [0.02, -0.52], [0.56, -0.28], [-0.48, 0.42], [0.08, 0.2], [0.62, 0.45],
    [-0.22, -0.02], [0.34, -0.04], [-0.12, 0.66], [0.38, 0.72], [-0.84, 0.04], [0.86, 0.06],
    [-0.3, -0.7], [0.3, -0.72], [-0.7, -0.62], [0.72, -0.6]];
  var TSLOTS = [[-0.43, -0.66], [0.43, -0.38], [-0.43, -0.1], [0.43, 0.18], [-0.42, 0.46], [0.4, 0.7],
    [0.02, -0.86], [0.0, 0.04], [0.0, 0.88], [-0.6, 0.86], [0.6, -0.86], [0.66, 0.46],
    [-0.62, -0.4], [0.62, -0.1], [-0.62, 0.2], [0.62, 0.92]];
  function geometry(tall) {
    var W = tall ? 500 : 1000, H = tall ? 1060 : 620;
    var cx = W / 2, cy = H / 2 + (tall ? 18 : 8), rx = tall ? 206 : 440, ry = tall ? 462 : 262;
    var pts = [];
    for (var i = 0; i < 96; i++) {
      var t = i / 96 * Math.PI * 2;
      var k = 1 + 0.07 * Math.sin(3 * t + 0.6) + 0.05 * Math.sin(5 * t + 2.1) + 0.03 * Math.sin(9 * t + 0.3) + 0.018 * Math.sin(15 * t + 1.7);
      pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]);
    }
    var site = function (slot) {
      if (tall) { var t = TSLOTS[slot] || [0, 0]; return [cx + t[0] * rx, cy + t[1] * ry]; }
      var s = SLOTS[slot] || [0, 0];
      return [cx + s[0] * rx * 0.9, cy + s[1] * ry * 0.86];
    };
    return { W: W, H: H, cx: cx, cy: cy, rx: rx, ry: ry, island: pts, site: site };
  }
  function clipHalf(poly, p, q) { // p 側だけ残す（p と q の垂直二等分線で切る）
    var mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, nx = q[0] - p[0], ny = q[1] - p[1];
    var f = function (a) { return (a[0] - mx) * nx + (a[1] - my) * ny; };
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
      if (fa <= 0) out.push(a);
      if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) { var t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out;
  }
  function pathOf(poly) { return poly.length ? "M" + poly.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L") + " Z" : ""; }
  function inPoly(pt, poly) {
    var x = pt[0], y = pt[1], inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function rectGap(a, b) {
    var dx = Math.max(b[0] - a[2], a[0] - b[2]), dy = Math.max(b[1] - a[3], a[1] - b[3]);
    return dx > 0 && dy > 0 ? Math.sqrt(dx * dx + dy * dy) : Math.max(dx, dy);
  }
  // 島の中で、ほかの物とぶつからず、目標の位置に近い場所を探す（毎回同じ結果になる）
  function placeFree(g, rel, inner, target, obstacles, step) {
    var best = null, bestScore = -Infinity;
    var minX = g.cx - g.rx * 1.2, maxX = g.cx + g.rx * 1.2, minY = g.cy - g.ry * 1.2, maxY = g.cy + g.ry * 1.2;
    for (var y = minY; y <= maxY; y += step) {
      for (var x = minX; x <= maxX; x += step) {
        if (!inner.every(function (q) { return inPoly([x + q[0], y + q[1]], g.island); })) continue;
        var r = [x + rel[0], y + rel[1], x + rel[2], y + rel[3]];
        if (r[0] < 4 || r[2] > g.W - 4 || r[1] < 4 || r[3] > g.H - 4) continue;
        var gap = Infinity;
        for (var i = 0; i < obstacles.length; i++) gap = Math.min(gap, rectGap(r, obstacles[i]));
        var d = Math.sqrt((x - target[0]) * (x - target[0]) + (y - target[1]) * (y - target[1]));
        var score = (gap < 6 ? -10000 + gap * 10 : Math.min(gap, 28) * 3) - d * 0.12;
        if (score > bestScore) { bestScore = score; best = [x, y]; }
      }
    }
    return best || target;
  }
  function mapLabel(name, tall) { var n = tall ? 6 : 8; return name.length > n ? name.slice(0, n - 1) + "…" : name; }

  function mapKuni(tall) {
    var g = geometry(tall), CW = tall ? 21 : 23;
    var fields = state.fields || [];
    var island = pathOf(g.island);
    var obstacles = [[10, 10, 22 + (tall ? 186 : 196) + 8, 86], [g.W - 108, 14, g.W - 18, 104]];
    var maxA = Math.max.apply(null, fields.map(function (f) { return f.area; }).concat([1]));
    // 圃場の置き場所（城の目印と同じ大きさの区画を、ぶつからないように）
    var places = fields.map(function (f) {
      var nm = mapLabel(f.name, tall), lw = Math.max(nm.length * CW + 20, 84);
      var badge = K.fieldStatus(f.status).name + " " + koku(K.kokuOf(state, f.area));
      var bw = Math.max(badge.length * 15 + 18, 90);
      var hw = Math.max(52, lw / 2, bw / 2);
      var rel = [-hw, -40, hw, 92];
      var pos = placeFree(g, rel, [[0, 0], [-30, 0], [30, 0]], g.site(f.slot), obstacles, tall ? 8 : 10);
      obstacles.push([pos[0] + rel[0], pos[1] + rel[1], pos[0] + rel[2], pos[1] + rel[3]]);
      var k = 0.8 + 0.4 * Math.sqrt(f.area / maxA);
      return { f: f, p: pos, nm: nm, lw: lw, badge: badge, bw: bw, w: 60 * k, h: 38 * k };
    });
    var cells = places.map(function (s) {
      var poly = g.island;
      places.forEach(function (o) { if (o !== s) poly = clipHalf(poly, s.p, o.p); });
      return poly;
    });
    var svg = '<svg class="map kuni' + (tall ? " tall" : "") + '" viewBox="0 0 ' + g.W + " " + g.H + '" role="group" aria-label="国取りの地図。圃場（領地）を選ぶと詳しい様子が出ます">' +
      "<defs>" +
      '<pattern id="wave" width="44" height="22" patternUnits="userSpaceOnUse"><path d="M0 22 A22 22 0 0 1 44 22 M11 22 A11 11 0 0 1 33 22" class="wave"/></pattern>' +
      '<pattern id="hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" class="hatch-bg"/><path d="M0 0 V14" class="hatch-l"/></pattern>' +
      '<clipPath id="isl"><path d="' + island + '"/></clipPath>' +
      "</defs>" +
      '<rect width="' + g.W + '" height="' + g.H + '" class="sea"/><rect width="' + g.W + '" height="' + g.H + '" fill="url(#wave)"/>' +
      '<path class="cloud" d="M-10 ' + (g.H * 0.16) + ' q40 -34 90 -12 q30 -30 80 -6 q36 -18 64 10 q-30 22 -70 10 q-40 22 -84 4 q-40 18 -80 4 Z"/>' +
      '<path class="cloud" d="M' + (g.W + 10) + " " + (g.H * 0.88) + ' q-40 -30 -88 -10 q-34 -28 -82 -4 q-34 -14 -60 12 q32 22 70 8 q42 22 86 2 q38 16 74 2 Z"/>' +
      '<path d="' + island + '" class="island-shadow" transform="translate(6 8)"/>' +
      '<path d="' + island + '" class="island"/>' +
      '<g clip-path="url(#isl)">';
    cells.forEach(function (poly, i) {
      var f = places[i].f;
      svg += '<path d="' + pathOf(poly) + '" class="cell land-' + f.status + (ui.sel === f.id ? " cell-sel" : "") + '"' + (f.status === "clearing" ? ' fill="url(#hatch)"' : "") + "/>";
    });
    svg += '<path class="river" d="M' + (g.cx - g.rx * 0.15) + " " + (g.cy - g.ry * 1.1) + " C" + (g.cx + g.rx * 0.05) + " " + (g.cy - g.ry * 0.4) + " " + (g.cx - g.rx * 0.32) + " " + (g.cy + g.ry * 0.1) + " " + (g.cx - g.rx * 0.05) + " " + (g.cy + g.ry * 1.2) + '"/>';
    cells.forEach(function (poly, i) { svg += '<path d="' + pathOf(poly) + '" class="border' + (places[i].f.status === "talk" ? " border-talk" : "") + '"/>'; });
    svg += "</g>";
    svg += '<path d="' + island + '" class="coast"/>';
    places.forEach(function (pl) {
      var f = pl.f, p = pl.p, w = pl.w, h = pl.h, sel = ui.sel === f.id, st = K.fieldStatus(f.status);
      var rows = "";
      for (var r = 1; r <= 4; r++) { var yy = -h / 2 + h * r / 5; rows += '<path d="M' + (-w / 2 + 6) + " " + yy.toFixed(1) + " Q0 " + (yy - 5).toFixed(1) + " " + (w / 2 - 6) + " " + yy.toFixed(1) + '" class="furrow"/>'; }
      svg += '<g class="field fs-' + f.status + (sel ? " is-sel" : "") + '" data-id="' + esc(f.id) + '" transform="translate(' + p[0].toFixed(1) + " " + p[1].toFixed(1) + ')" tabindex="0" role="button" aria-pressed="' + sel + '" aria-label="' + esc(f.name) + "。" + st.name + "（" + st.biz + "）。石高" + koku(K.kokuOf(state, f.area)) + "、" + area(f.area) + (f.general ? "、担当 " + esc(generalName(f.general)) : "、担当なし") + '">' +
        '<rect x="' + (-Math.max(56, pl.lw / 2)) + '" y="-44" width="' + Math.max(112, pl.lw) + '" height="140" class="hit"/>' +
        '<rect x="' + (-w / 2 - 6) + '" y="' + (-h / 2 - 6) + '" width="' + (w + 12) + '" height="' + (h + 12) + '" rx="8" class="ring"/>' +
        '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="5" class="plot"/>' + rows +
        (f.status === "own" ? '<g transform="translate(' + (w / 2 - 2) + " " + (-h / 2) + ')"><path d="M0 0 V-30" class="pole"/><path d="M0 -30 H16 V-12 H0 Z" class="ownflag"/><circle cx="8" cy="-21" r="3" class="flagmon"/></g>' : "") +
        '<g transform="translate(0 ' + (h / 2 + 22).toFixed(1) + ')"><rect x="' + (-pl.lw / 2) + '" y="-17" width="' + pl.lw + '" height="34" rx="4" class="label-bg"/><text class="label" y="7">' + esc(pl.nm) + "</text></g>" +
        '<g transform="translate(0 ' + (h / 2 + 58).toFixed(1) + ')"><rect x="' + (-pl.bw / 2) + '" y="-14" width="' + pl.bw + '" height="27" rx="13" class="lbadge lb-' + f.status + '"/><text class="badge-t" y="6">' + esc(pl.badge) + "</text></g>" +
        "</g>";
    });
    svg += '<g class="compass" transform="translate(' + (g.W - 64) + ' 64)"><circle r="34"/><path d="M0 -30 L7 0 L0 30 L-7 0 Z M-30 0 L0 6 L30 0 L0 -6 Z"/><text y="-40">北</text></g>';
    svg += '<g class="cartouche" transform="translate(22 22)"><rect width="' + (tall ? 186 : 196) + '" height="54" rx="3"/><rect x="5" y="5" width="' + (tall ? 176 : 186) + '" height="44" class="inner"/><text x="' + (tall ? 93 : 98) + '" y="36">' + esc(state.name || "わが国") + " 国取図</text></g>";
    if (!fields.length) svg += '<text class="empty-t" x="' + g.cx + '" y="' + g.cy + '">「出陣」で候補地を足してください</text>';
    return svg + "</svg>";
  }

  // ---------- 城下町（商いの地図） ----------
  // PC：1列に4区画（大通りを挟んで2つずつ）。店の数に応じて2〜3列
  var COLS_W = [330, 670, 125, 875];
  function townGeometry(tall, n) {
    if (!tall) {
      var rowsW = n > 8 ? 3 : 2, lotsW = [];
      for (var r0 = 0; r0 < rowsW; r0++) COLS_W.forEach(function (x) { lotsW.push([x, 176 + r0 * 270]); });
      // 区画の順：上の列の中ほど→下の列の中ほど→外側…と、上下に散らす
      var order = [];
      [[0, 0], [0, 1], [1, 0], [1, 1], [0, 2], [1, 3], [0, 3], [1, 2], [2, 0], [2, 1], [2, 2], [2, 3]].forEach(function (rc) { if (rc[0] < rowsW) order.push(lotsW[rc[0] * 4 + rc[1]]); });
      return { W: 1000, H: 176 + rowsW * 270 - 60, lots: order, rows: rowsW, tall: false };
    }
    var rows = Math.max(2, Math.ceil(Math.max(n, 1) / 2) + (n < 12 ? 1 : 0)); // 空き地を1列ぶん見せる
    rows = Math.min(rows, 6);
    var lots = [];
    for (var r = 0; r < rows; r++) { lots.push([118, 172 + r * 186]); lots.push([382, 172 + r * 186]); }
    return { W: 500, H: 172 + rows * 186 - 70, lots: lots, tall: true };
  }
  function mapTown(tall) {
    var shops = state.castles.slice().sort(function (a, b) { return a.slot - b.slot; });
    var g = townGeometry(tall, shops.length), ym = state.current, W = g.W, H = g.H;
    var svg = '<svg class="map town' + (tall ? " tall" : "") + '" viewBox="0 0 ' + W + " " + H + '" role="group" aria-label="城下町の地図。店（事業）を選ぶと詳しい数字が出ます">' +
      '<defs><pattern id="stone" width="24" height="16" patternUnits="userSpaceOnUse"><rect width="24" height="16" class="road-bg"/><path d="M0 8 H24 M12 0 V8 M0 8 V16 M24 8 V16" class="road-l"/></pattern></defs>' +
      '<rect width="' + W + '" height="' + H + '" class="ground"/>';
    if (!tall) {
      svg += '<rect x="466" y="0" width="68" height="' + H + '" fill="url(#stone)" class="road"/>';
      for (var rr = 0; rr < g.rows - 1; rr++) {
        var sy = 176 + rr * 270 + 98;
        svg += '<rect x="0" y="' + sy + '" width="' + W + '" height="62" fill="url(#stone)" class="road"/>' +
          '<text x="250" y="' + (sy + 39) + '" class="street-t">大通り</text><text x="760" y="' + (sy + 39) + '" class="street-t">大通り</text>' +
          '<g transform="translate(30 ' + (sy + 12) + ')"><path d="M0 18 V34" class="post"/><rect x="-7" y="0" width="14" height="18" rx="3" class="lamp"/></g>' +
          '<g transform="translate(970 ' + (sy + 12) + ')"><path d="M0 18 V34" class="post"/><rect x="-7" y="0" width="14" height="18" rx="3" class="lamp"/></g>';
      }
      svg += '<path d="M0 ' + (H - 30) + " C200 " + (H - 46) + " 380 " + (H - 18) + " 560 " + (H - 32) + " S860 " + (H - 46) + " 1000 " + (H - 28) + " V" + H + ' H0 Z" class="canal"/>' +
        '<path d="M454 ' + (H - 34) + " Q500 " + (H - 52) + " 546 " + (H - 34) + '" class="bridge"/><path d="M458 ' + (H - 28) + ' H542" class="bridge-r"/>';
      [[228, H - 52], [772, H - 52]].forEach(function (p) { svg += '<g transform="translate(' + p[0] + " " + p[1] + ')"><path d="M0 0 V-22" class="trunk"/><circle cy="-30" r="14" class="tree"/></g>'; });
    } else {
      svg += '<rect x="216" y="0" width="68" height="' + H + '" fill="url(#stone)" class="road"/>' +
        '<rect x="0" y="16" width="' + W + '" height="46" fill="url(#stone)" class="road"/>';
    }
    // 題箋
    var cw = tall ? 176 : 196;
    svg += '<g class="cartouche" transform="translate(' + (tall ? (W - cw) / 2 : 22) + " " + (tall ? 16 : 22) + ')"><rect width="' + cw + '" height="46" rx="3"/><rect x="5" y="5" width="' + (cw - 10) + '" height="36" class="inner"/><text x="' + (cw / 2) + '" y="31">' + esc(state.name || "わが家") + " 城下町</text></g>";
    // 店
    var used = {};
    shops.forEach(function (c, i) {
      var lot = g.lots[c.slot] && !used[c.slot] ? c.slot : -1;
      if (lot < 0) for (var j = 0; j < g.lots.length; j++) if (!used[j]) { lot = j; break; }
      if (lot < 0) return;
      used[lot] = 1;
      var p = g.lots[lot], pl = K.castlePL(state, ym, c.id), st = K.castleStatus(pl.rate, pl.target);
      var nm = mapLabel(c.name, tall), lw = Math.max(nm.length * (tall ? 20 : 21) + 20, 84), sel = ui.sel === c.id;
      var kura = K.monthsBack(ym, 3).some(function (k) { return K.castleMonth(state, k, c.id).stock > 0; });
      var initial = c.name.replace(/[（(].*$/, "").charAt(0);
      svg += '<g class="shop' + (sel ? " is-sel" : "") + '" data-id="' + esc(c.id) + '" transform="translate(' + p[0] + " " + p[1] + ')" tabindex="0" role="button" aria-pressed="' + sel + '" aria-label="' + esc(c.name) + "の店。" + st.label + "。商い高（売上）" + yen(pl.sales) + "、目標達成率" + pct(pl.rate) + '">' +
        '<rect x="' + (-Math.max(66, lw / 2)) + '" y="-102" width="' + Math.max(132, lw) + '" height="182" class="hit"/>' +
        '<rect x="-70" y="-80" width="140" height="128" rx="8" class="ring"/>' +
        shopIcon(st.key, initial, kura) +
        '<g transform="translate(0 -86)"><rect x="' + (-lw / 2) + '" y="-15" width="' + lw + '" height="30" rx="3" class="sign-bg"/><text class="sign" y="7">' + esc(nm) + "</text></g>" +
        '<g transform="translate(0 62)"><rect x="-50" y="-14" width="100" height="27" rx="13" class="badge badge-' + st.key + '"/><text class="badge-t" y="6">' + st.label + " " + (pl.target ? pct(pl.rate) : "") + "</text></g>" +
        "</g>";
    });
    // 空き地
    g.lots.forEach(function (p, j) {
      if (used[j]) return;
      svg += '<g class="vacant-lot" transform="translate(' + p[0] + " " + p[1] + ')" aria-hidden="true"><rect x="-56" y="-40" width="112" height="76" rx="4" class="lot"/><text y="6" class="lot-t">空き地</text></g>';
    });
    if (!shops.length) svg += '<text class="empty-t" x="' + (W / 2) + '" y="' + (H / 2) + '">「帳簿」で店（事業）を開いてください</text>';
    return svg + "</svg>";
  }

  // ---------- 上部のステータス帯 ----------
  function renderStatus() {
    var ym = state.current, l = ml(ym), co = K.companyPL(state, ym), sp = K.landSplit(state);
    $("#status").innerHTML =
      '<a class="brand" href="#/" aria-label="大地図へ（' + esc(state.name || "経営評定") + '）">' + kamon(40) +
      "<span><b>" + esc(state.name || "わが国") + "</b><small>経営評定</small></span></a>" +
      '<div class="date"><b>' + l.wareki + " " + l.wafu + "</b><small>" + l.seireki + "</small></div>" +
      '<dl class="stats">' +
      '<div class="koku" title="' + area(sp.realArea) + '"><dt>国力<small>実高</small></dt><dd>' + koku(sp.real) + (sp.expected ? ' <small class="exp">見込み+' + koku(sp.expected) + "</small>" : "") + "</dd></div>" +
      '<div title="' + yen(co.cash) + '"><dt>金<small>手元資金</small></dt><dd>' + man(co.cash) + "</dd></div>" +
      '<div title="' + yen(co.stock) + '"><dt>蔵<small>在庫</small></dt><dd>' + man(co.stock) + "</dd></div>" +
      '<div title="' + yen(co.sales) + '"><dt>商い高<small>今月の売上</small></dt><dd>' + man(co.sales) + "</dd></div>" +
      '<div><dt>達成<small>目標達成率</small></dt><dd>' + gauge(co.rate, "目標達成率") + "</dd></div>" +
      "</dl>";
  }

  // ---------- 大地図（国取り／商い） ----------
  var mqTall = window.matchMedia ? matchMedia("(max-width: 760px)") : { matches: false };
  function worldTabs(active) {
    return '<nav class="world-tabs" aria-label="地図の切り替え">' +
      '<a href="#/kuni"' + (active === "kuni" ? ' aria-current="page"' : "") + "><b>国取り</b><small>（農・圃場を広げる）</small></a>" +
      '<a href="#/akinai"' + (active === "akinai" ? ' aria-current="page"' : "") + "><b>商い</b><small>（商・店ごとの売上）</small></a></nav>";
  }
  function advisorWin(world) {
    var adv = K.advise(state, state.current, today());
    var mine = adv.filter(function (a) { return world === "kuni" ? a.area === "land" : ["shop", "cash", "measure"].indexOf(a.area) >= 0; });
    var top = mine[0] || adv[0];
    if (!top) return "";
    return '<div class="advisor-win"><div class="portrait">' + advisorFigure() + "<span>軍師 墨斎</span></div>" +
      '<div class="msg"><p class="who">軍師の進言<small>（数字から自動で出す注意・助言）</small></p>' +
      '<p><span class="lv lv' + top.lv + '">' + top.lvName + "</span></p>" +
      "<h2>" + esc(top.title) + "</h2><p>" + esc(top.text) + "</p>" +
      '<a class="btn" href="#/hyojo?advice">評定で進言をすべて見る（' + adv.length + "件）</a></div></div>";
  }
  function viewWorld(world) {
    rememberWorld(world);
    var tall = mqTall.matches;
    var map = world === "kuni" ? mapKuni(tall) : mapTown(tall);
    var legend = world === "kuni"
      ? '<ul class="legend" aria-label="凡例">' + K.FIELD_STATUSES.map(function (s) { return '<li><i class="lg lgl-' + s.key + '"></i>' + s.name + "（" + s.biz + "）</li>"; }).join("") + "</ul>"
      : '<ul class="legend" aria-label="凡例"><li><i class="lg lg-win"></i>繁盛（目標達成）</li><li><i class="lg lg-fight"></i>堅調（80%以上）</li><li><i class="lg lg-lose"></i>不振（80%未満）</li><li><i class="lg lg-none"></i>目標未定</li><li><i class="lg lg-kura"></i>蔵＝在庫を持つ店</li></ul>';
    var tools = world === "kuni" ? '<div class="map-tools"><button type="button" class="btn primary" id="sortie">＋ 出陣<small>（候補地を足す）</small></button></div>' : "";
    return '<h1 class="sr-only">' + (world === "kuni" ? "国取り" : "商い") + "</h1>" + worldTabs(world) +
      '<div class="map-layout">' +
      '<section class="panel map-wrap" aria-label="' + (world === "kuni" ? "国取りの地図" : "城下町の地図") + '">' + tools + map + legend + "</section>" +
      '<aside class="panel castle-panel" id="castle-panel" aria-label="要約">' + sidePanel(world) + "</aside>" +
      '<section class="advisor" aria-label="軍師の進言">' + advisorWin(world) + "</section></div>";
  }
  function sidePanel(world) { return world === "kuni" ? kuniPanel() : shopPanel(); }
  function shopPanel() {
    var ym = state.current;
    if (!state.castles.length) return '<h2 class="ph">店の一覧</h2><p class="empty">まだ店（事業）がありません。<a href="#/chobo">帳簿</a>で店を開いてください。</p>';
    var c = byId(state.castles, ui.sel);
    if (!c) {
      var co = K.companyPL(state, ym);
      return '<h2 class="ph"><span class="vt">商い</span><small>全体の様子</small></h2>' +
        '<dl class="kv"><div><dt>' + term("商い高", "売上") + "</dt><dd>" + yen(co.sales) + "</dd></div>" +
        "<div><dt>" + term("目標", "売上目標") + "</dt><dd>" + yen(co.target) + "</dd></div>" +
        "<div><dt>" + term("商い目標の達成", "達成率") + "</dt><dd>" + gauge(co.rate) + "</dd></div>" +
        "<div><dt>" + term("儲け", "粗利") + "</dt><dd>" + yen(co.gross) + "</dd></div>" +
        "<div><dt>" + term("営業利益", "儲け−販管費") + "</dt><dd>" + yen(co.op) + "</dd></div></dl>" +
        '<p class="hint">町の店を押すか、下の一覧から選んでください。</p>' +
        '<ul class="castle-list">' + state.castles.map(function (x) {
          var p = K.castlePL(state, ym, x.id), st = K.castleStatus(p.rate, p.target);
          return '<li><button type="button" class="castle-btn" data-pick="' + esc(x.id) + '"><i class="dot dot-' + st.key + '" aria-hidden="true"></i><span class="nm">' + esc(x.name) + '</span><span class="st">' + st.label + " " + (p.target ? pct(p.rate) : "") + "</span></button></li>";
        }).join("") + "</ul>";
    }
    var p = K.castlePL(state, ym, c.id), st = K.castleStatus(p.rate, p.target), lords = lordsOf(c.id);
    var ms = state.measures.filter(function (m) { return m.castle === c.id && m.status !== "done"; });
    return '<div class="cp-head"><h2 class="ph"><span class="vt">' + esc(c.name) + '</span></h2><span class="flagtag ft-' + st.key + '">' + st.label + "</span></div>" +
      '<div class="cp-gauge"><span class="gl">' + term("商い目標の達成", "目標達成率") + "</span>" + gauge(p.rate) + "</div>" +
      '<dl class="kv">' +
      "<div><dt>" + term("商い高", "売上") + "</dt><dd>" + yen(p.sales) + "</dd></div>" +
      "<div><dt>" + term("目標", "売上目標") + "</dt><dd>" + yen(p.target) + "</dd></div>" +
      "<div><dt>" + term("儲け", "粗利") + "</dt><dd>" + yen(p.gross) + ' <small class="sub">' + pct(p.margin) + "</small></dd></div>" +
      "<div><dt>" + term("贔屓", "リピート率") + "</dt><dd>" + (p.repeat === null ? "—" : p.repeat + "%") + "</dd></div>" +
      "<div><dt>" + term("蔵", "在庫") + "</dt><dd>" + yen(p.stock) + "</dd></div>" +
      "<div><dt>" + term("番頭", "担当") + "</dt><dd>" + (lords.length ? lords.map(function (g) { return esc(g.name); }).join("、") : '<span class="warn-t">不在</span>') + "</dd></div>" +
      "<div><dt>" + term("内政", "進行中の施策") + "</dt><dd>" + ms.length + "件</dd></div></dl>" +
      '<div class="btn-row"><a class="btn primary" href="#/shop/' + encodeURIComponent(c.id) + '">店の詳細を見る</a><button type="button" class="btn ghost" data-pick="">店の一覧へ</button></div>';
  }
  function kuniPanel() {
    var f = fieldOf(ui.sel);
    if (f) return fieldPanel(f);
    var sp = K.landSplit(state);
    var counts = K.FIELD_STATUSES.map(function (s) { return { s: s, n: state.fields.filter(function (x) { return x.status === s.key; }).length }; });
    return '<h2 class="ph"><span class="vt">国取り</span><small>領地の広がり</small></h2>' + tenkaGauge() +
      '<dl class="kv">' +
      "<div><dt>" + term("実高", "作付済みの圃場") + "</dt><dd>" + kokuLabel(sp.realArea) + "</dd></div>" +
      "<div><dt>" + term("見込み", "獲得・開墾中") + "</dt><dd>" + kokuLabel(sp.expectedArea) + "</dd></div>" +
      "<div><dt>" + term("狙い", "候補地・交渉中") + "</dt><dd>" + kokuLabel(sp.aimArea) + "</dd></div></dl>" +
      '<p class="hint">' + counts.map(function (c) { return c.s.name + " " + c.n; }).join("・") + "。地図の圃場を押すか、下の一覧から選んでください。</p>" +
      (state.fields.length ? '<ul class="castle-list">' + state.fields.map(function (x) {
        return '<li><button type="button" class="castle-btn" data-pick="' + esc(x.id) + '"><i class="dot dotl-' + x.status + '" aria-hidden="true"></i><span class="nm">' + esc(x.name) + '</span><span class="st">' + K.fieldStatus(x.status).name + " " + koku(K.kokuOf(state, x.area)) + "</span></button></li>";
      }).join("") + "</ul>" : '<p class="empty">まだ圃場がありません。「出陣」で候補地を足してください。</p>');
  }
  function fieldPanel(f) {
    var st = K.fieldStatus(f.status), i = K.FIELD_STATUSES.indexOf(st), next = K.FIELD_STATUSES[i + 1];
    var y = K.yieldPerTan(f);
    return '<div class="cp-head"><h2 class="ph"><span class="vt">' + esc(f.name) + '</span></h2><span class="flagtag ftl-' + f.status + '">' + st.name + "</span></div>" +
      '<ol class="steps" aria-label="国取りの段階">' + K.FIELD_STATUSES.map(function (s, j) { return '<li class="' + (j < i ? "done" : j === i ? "now" : "") + '"' + (j === i ? ' aria-current="step"' : "") + ">" + s.name + "</li>"; }).join("") + "</ol>" +
      '<dl class="kv">' +
      "<div><dt>" + term("石高", "圃場面積") + "</dt><dd>" + kokuLabel(f.area) + "</dd></div>" +
      "<div><dt>状態</dt><dd>" + st.name + '<small class="sub">（' + st.biz + "・" + ml(f.since).seireki + "から）</small></dd></div>" +
      "<div><dt>" + term("作物", "品種") + "</dt><dd>" + (esc(f.crop) || "—") + "</dd></div>" +
      "<div><dt>" + term("代官", "担当武将") + "</dt><dd>" + (f.general ? esc(generalName(f.general)) : '<span class="warn-t">不在</span>') + "</dd></div>" +
      "<div><dt>地主</dt><dd>" + (f.landlord ? '<a href="#/gaiko">' + esc(houseName(f.landlord)) + "</a>" : "—") + "</dd></div>" +
      "<div><dt>地代<small class=\"sub\">（年額）</small></dt><dd>" + (f.rent ? yen(f.rent) : "—") + "</dd></div>" +
      "<div><dt>開墾費用</dt><dd>" + (f.clearCost ? yen(f.clearCost) : "—") + "</dd></div>" +
      "<div><dt>収穫量</dt><dd>" + (f.harvestKg ? f.harvestKg.toLocaleString("en-US") + "kg" : "—") + "</dd></div>" +
      "<div><dt>反収<small class=\"sub\">（kg／反）</small></dt><dd>" + (y === null ? "—" : Math.round(y).toLocaleString("en-US") + "kg") + "</dd></div>" +
      (f.terms ? "<div><dt>条件</dt><dd>" + esc(f.terms) + "</dd></div>" : "") +
      (f.memo ? "<div><dt>メモ</dt><dd>" + esc(f.memo) + "</dd></div>" : "") + "</dl>" +
      '<div class="btn-row">' + (next ? '<button type="button" class="btn primary" data-advance="' + esc(f.id) + '">調略を進める<small>（→' + next.name + "）</small></button>" : "") +
      '<button type="button" class="btn" data-edf="' + esc(f.id) + '">編集</button>' +
      (f.status === "aim" || f.status === "talk" ? '<button type="button" class="btn ghost danger-t" data-retreat="' + esc(f.id) + '">撤退</button>' : "") +
      '<button type="button" class="btn ghost" data-pick="">一覧へ</button></div>';
  }
  function bindWorld(root, r) {
    var world = r.name === "kuni" ? "kuni" : "akinai";
    var redraw = function () {
      var wrap = $(".map-wrap", root);
      $(".map", wrap).outerHTML = world === "kuni" ? mapKuni(mqTall.matches) : mapTown(mqTall.matches);
      $("#castle-panel").innerHTML = sidePanel(world);
      bindInner();
    };
    var pick = function (id) { ui.sel = ui.sel === id ? "" : id; redraw(); };
    var bindInner = function () {
      $$(".map [data-id]", root).forEach(function (g) {
        var act = function () { var id = g.dataset.id; pick(id); var n = $('.map [data-id="' + cssEsc(id) + '"]', root); if (n) n.focus(); };
        g.addEventListener("click", act);
        g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } });
      });
      $$("[data-pick]", root).forEach(function (b) {
        b.addEventListener("click", function () {
          var id = b.dataset.pick;
          ui.sel = ""; pick(id);
          var t = id ? $("#castle-panel .btn.primary") || $("#castle-panel [data-pick]") : $("#castle-panel [data-pick]");
          if (t) t.focus();
        });
      });
      bindFieldActions(root);
    };
    bindInner();
    var sortie = $("#sortie", root);
    if (sortie) sortie.addEventListener("click", function () { openFieldDialog(null, "aim"); });
  }
  function bindFieldActions(root) {
    $$("[data-advance]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        try {
          var r = K.advanceField(state, b.dataset.advance, state.current, today());
          ui.sel = r.field.id;
          commit(r.state, "「" + r.field.name + "」が" + K.fieldStatus(r.field.status).name + "になりました" + (r.logged ? "（年表に記録）" : ""));
          var nb = $('[data-advance="' + cssEsc(r.field.id) + '"]') || $("#castle-panel .btn"); if (nb) nb.focus();
        } catch (e) { toast(e.message); }
      });
    });
    $$("[data-retreat]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var f = fieldOf(b.dataset.retreat);
        confirmDlg("撤退（候補から外す）", "「" + f.name + "」（" + area(f.area) + "）を候補から外します。よろしいですか。", "撤退する", function () {
          ui.sel = "";
          commit(K.retreatField(state, f.id), "「" + f.name + "」から撤退しました");
        });
      });
    });
    $$("[data-edf]", root).forEach(function (b) { b.addEventListener("click", function () { openFieldDialog(fieldOf(b.dataset.edf)); }); });
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'); }

  // 圃場の追加・編集（出陣もここ）
  function fieldForm(f, defStatus) {
    f = f || { name: "", area: 0, crop: "", general: "", memo: "", status: defStatus || "aim", landlord: "", terms: "", rent: 0, clearCost: 0, harvestKg: 0 };
    var unit = f.area && f.area % 100 === 0 ? "cho" : f.area && f.area % 10 === 0 ? "tan" : f.area ? "a" : "tan";
    var shown = f.area ? +(f.area / (unit === "cho" ? 100 : unit === "tan" ? 10 : 1)).toFixed(2) : "";
    var numIn = function (name, label, val, unitTxt) { return '<label class="f"><span>' + label + '</span><span class="inwrap"><input name="' + name + '" type="number" min="0" step="1" inputmode="numeric" value="' + (val || "") + '"><i>' + unitTxt + "</i></span></label>"; };
    return '<label class="f"><span>圃場の名前</span><input name="name" required maxlength="40" value="' + esc(f.name) + '" autocomplete="off" placeholder="例：西の段々畑"></label>' +
      '<div class="f2"><label class="f"><span>面積</span><input name="area" type="number" min="0" step="any" required inputmode="decimal" value="' + shown + '"></label>' +
      '<label class="f"><span>単位</span><select name="unit">' + K.AREA_UNITS.map(function (u) { return '<option value="' + u.key + '"' + (u.key === unit ? " selected" : "") + ">" + u.name + "</option>"; }).join("") + "</select></label></div>" +
      '<p class="note">石高は 1a＝' + koku(K.kokuOf(state, 1)) + " で換算します（帳簿で変更）。</p>" +
      '<div class="f2"><label class="f"><span>状態</span><select name="status">' + K.FIELD_STATUSES.map(function (s) { return '<option value="' + s.key + '"' + (s.key === f.status ? " selected" : "") + ">" + s.name + "（" + s.biz + "）</option>"; }).join("") + "</select></label>" +
      '<label class="f"><span>担当の武将</span><select name="general"><option value="">（担当なし）</option>' + state.generals.map(function (g) { return '<option value="' + esc(g.id) + '"' + (g.id === f.general ? " selected" : "") + ">" + esc(g.name) + "</option>"; }).join("") + "</select></label></div>" +
      '<label class="f"><span>作物・品種</span><input name="crop" maxlength="60" value="' + esc(f.crop) + '" autocomplete="off" placeholder="例：茶・やぶきた"></label>' +
      '<label class="f"><span>地主<small>（外交の諸家から選ぶ）</small></span><select name="landlord"><option value="">（なし）</option>' + state.houses.map(function (h) { return '<option value="' + esc(h.id) + '"' + (h.id === f.landlord ? " selected" : "") + ">" + esc(h.name) + "（" + K.houseKindName(h.kind) + "）</option>"; }).join("") + "</select></label>" +
      '<label class="f"><span>条件メモ</span><input name="terms" maxlength="300" value="' + esc(f.terms) + '" autocomplete="off" placeholder="例：10年契約、地代は年ごとに見直し"></label>' +
      '<div class="f2">' + numIn("rent", "地代（年額）", f.rent, "円") + numIn("clearCost", "開墾費用", f.clearCost, "円") + "</div>" +
      numIn("harvestKg", "収穫量（年）", f.harvestKg, "kg") +
      '<label class="f"><span>メモ</span><textarea name="memo" rows="2" maxlength="300">' + esc(f.memo) + "</textarea></label>";
  }
  function readField(form) {
    var fd = new FormData(form), out = {};
    out.name = String(fd.get("name") || "").trim();
    if (!out.name) return "圃場の名前を入れてください";
    var v = +fd.get("area");
    if (!isFinite(v) || v < 0) return "面積は0以上の数字で入れてください";
    out.area = Math.round(K.areaToA(v, String(fd.get("unit"))) * 100) / 100;
    ["crop", "general", "status", "landlord", "terms", "memo"].forEach(function (k) { out[k] = String(fd.get(k) || "").trim(); });
    var bad = "";
    ["rent", "clearCost", "harvestKg"].forEach(function (k) { var n = +(fd.get(k) || 0); if (!isFinite(n) || n < 0) bad = "金額・収穫量は0以上の数字で入れてください"; out[k] = Math.round(n); });
    return bad || out;
  }
  function openFieldDialog(f, defStatus) {
    dialog({ title: f ? "圃場の編集" : "出陣（候補地を足す）", body: fieldForm(f, defStatus), ok: f ? "保存する" : "出陣する", onOk: function (form) {
      var n = readField(form); if (typeof n === "string") return n;
      if (!f) {
        try { var r = K.addField(state, Object.assign({ date: today() }, n), state.current); ui.sel = r.field.id; commit(r.state, "「" + r.field.name + "」を" + K.fieldStatus(r.field.status).name + "に加えました"); }
        catch (e) { return e.message; }
        return;
      }
      if (state.fields.some(function (x) { return x.name === n.name && x.id !== f.id; })) return "同じ名前の圃場があります";
      var s = K.clone(state);
      s.fields = s.fields.map(function (x) {
        if (x.id !== f.id) return x;
        var y = Object.assign({}, x, n);
        if (y.status !== x.status) y.since = s.current;
        return y;
      });
      commit(s, "記録しました");
    } });
  }

  // ---------- グラフ ----------
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function trendChart(rows, title) {
    var W = 640, H = 270, L = 64, R = 12, T = 16, B = 34;
    var max = niceMax(Math.max.apply(null, rows.map(function (r) { return Math.max(r.sales, r.target); }).concat([1])));
    var bw = (W - L - R) / rows.length;
    var y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(title) + '">';
    [0, 0.5, 1].forEach(function (f) {
      var yy = y(max * f);
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" class="grid"/><text x="' + (L - 6) + '" y="' + (yy + 7) + '" class="ax ax-y">' + man(max * f) + "</text>";
    });
    rows.forEach(function (r, i) {
      var x = L + i * bw, st = K.castleStatus(r.rate, r.target).key, h = H - B - y(r.sales);
      s += '<rect x="' + (x + bw * 0.18).toFixed(1) + '" y="' + y(r.sales).toFixed(1) + '" width="' + (bw * 0.64).toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" class="cbar bar-' + st + '"/>';
      s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 10) + '" class="ax">' + (+r.ym.slice(5)) + "</text>";
    });
    s += '<polyline points="' + rows.map(function (r, i) { return (L + i * bw + bw / 2).toFixed(1) + "," + y(r.target).toFixed(1); }).join(" ") + '" class="tline"/>';
    rows.forEach(function (r, i) { s += '<circle cx="' + (L + i * bw + bw / 2).toFixed(1) + '" cy="' + y(r.target).toFixed(1) + '" r="4" class="tdot"/>'; });
    return s + "</svg>";
  }
  function cashChart(fc, curYm) {
    var items = [{ ym: curYm, cash: fc.start, now: true }].concat(fc.rows);
    var W = 640, H = 250, L = 64, R = 12, T = 18, B = 34;
    var vals = items.map(function (r) { return r.cash; });
    var max = niceMax(Math.max.apply(null, vals.concat([1]))), min = Math.min.apply(null, vals.concat([0]));
    if (min < 0) min = -niceMax(-min);
    var y = function (v) { return T + (H - T - B) * (max - v) / (max - min); };
    var bw = (W - L - R) / items.length;
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="手元資金の今後6か月の見込み">';
    [min, 0, max].filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (v) {
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="grid' + (v === 0 ? " zero" : "") + '"/><text x="' + (L - 6) + '" y="' + (y(v) + 7) + '" class="ax ax-y">' + man(v) + "</text>";
    });
    items.forEach(function (r, i) {
      var x = L + i * bw, top = Math.min(y(r.cash), y(0)), h = Math.abs(y(r.cash) - y(0));
      s += '<rect x="' + (x + bw * 0.2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + (bw * 0.6).toFixed(1) + '" height="' + h.toFixed(1) + '" class="cbar ' + (r.cash < 0 ? "bar-lose" : r.now ? "bar-now" : "bar-fc") + '"/>';
      s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 10) + '" class="ax">' + (r.now ? "今" : +r.ym.slice(5) + "月") + "</text>";
    });
    return s + "</svg>";
  }

  // ---------- 画面：店の詳細 ----------
  function viewShop(id) {
    var c = byId(state.castles, id);
    if (!c) return screenHead("店", "見つかりません") + '<section class="panel"><p class="empty">この店は見つかりません。<a href="#/akinai">商いの地図へ戻る</a></p></section>';
    ui.sel = c.id;
    var ym = state.current, p = K.castlePL(state, ym, c.id), st = K.castleStatus(p.rate, p.target);
    var rows = K.series(state, c.id, ym, 12), lords = lordsOf(c.id);
    var ms = state.measures.filter(function (m) { return m.castle === c.id && m.status !== "done"; });
    return screenHead(c.name, "店の詳細・" + ml(ym).seireki, "akinai") +
      '<div class="grid2">' +
      '<section class="panel"><h2 class="ph">今月の商い<small>' + ml(ym).seireki + '</small></h2><p><span class="flagtag ft-' + st.key + '">' + st.label + "</span></p>" +
      '<div class="cp-gauge"><span class="gl">' + term("商い目標の達成", "目標達成率") + "</span>" + gauge(p.rate) + "</div>" +
      '<dl class="kv">' +
      "<div><dt>" + term("商い高", "売上") + "</dt><dd>" + yen(p.sales) + "</dd></div>" +
      "<div><dt>原価</dt><dd>" + yen(p.cost) + "</dd></div>" +
      "<div><dt>" + term("儲け", "粗利") + "</dt><dd>" + yen(p.gross) + ' <small class="sub">粗利率 ' + pct(p.margin, 1) + "</small></dd></div>" +
      "<div><dt>" + term("目標", "売上目標") + "</dt><dd>" + yen(p.target) + ' <small class="sub">差 ' + yen(p.diff) + "</small></dd></div>" +
      "<div><dt>" + term("贔屓", "リピート率") + "</dt><dd>" + (p.repeat === null ? "—" : p.repeat + "%") + "</dd></div>" +
      "<div><dt>" + term("蔵", "在庫") + "</dt><dd>" + yen(p.stock) + "</dd></div></dl></section>" +
      '<section class="panel"><h2 class="ph">' + term("商い高の推移", "直近12か月の売上") + "</h2>" + trendChart(rows, c.name + "の直近12か月の売上と目標") +
      '<p class="chart-legend"><span><i class="lg lg-bar"></i>売上（棒の色は達成度）</span><span><i class="lg lg-line"></i>目標</span></p>' +
      '<details><summary>数字で見る</summary><table class="mini"><thead><tr><th scope="col">月</th><th scope="col">売上</th><th scope="col">目標</th><th scope="col">達成率</th></tr></thead><tbody>' +
      rows.map(function (r) { return "<tr><td>" + ml(r.ym).seireki + "</td><td>" + yen(r.sales) + "</td><td>" + yen(r.target) + "</td><td>" + pct(r.rate) + "</td></tr>"; }).join("") +
      "</tbody></table></details></section>" +
      '<section class="panel"><h2 class="ph">' + term("番頭", "担当武将") + "</h2>" +
      (lords.length ? '<ul class="lords">' + lords.map(function (g) { return "<li><b>" + esc(g.name) + '</b> <small class="sub">' + esc(g.role) + "</small>" + abilities(g) + "</li>"; }).join("") + "</ul>" : '<p class="empty warn-t">番頭（担当）がいません。</p>') +
      '<a class="btn" href="#/bushou">武将の配置を変える</a></section>' +
      '<section class="panel"><h2 class="ph">' + term("進行中の内政", "施策") + "</h2>" +
      (ms.length ? '<ul class="measures">' + ms.map(function (m) {
        var k = kindOf(m.kind);
        return '<li><span class="kind">' + k.name + "<small>" + k.biz + "</small></span><b>" + esc(m.title) + '</b><small class="sub">' + statusName(m.status) + (m.due ? "・期限 " + m.due : "") + (m.cost ? "・" + yen(m.cost) : "") + (m.general ? "・" + esc(generalName(m.general)) : "") + "</small></li>";
      }).join("") + "</ul>" : '<p class="empty">進行中の施策はありません。</p>') +
      '<a class="btn" href="#/naisei">内政（施策）を見る</a></section></div>';
  }
  function abilities(g) {
    var row = function (k, a, b) { return '<div class="ab"><span class="abl">' + a + "<small>" + b + '</small></span><span class="bar"><i style="width:' + g[k] + '%"></i></span><b>' + g[k] + "</b></div>"; };
    return '<div class="abs">' + row("tou", "統率", "マネジメント") + row("bu", "武勇", "営業") + row("chi", "知略", "企画") + row("sei", "政務", "事務") + "</div>";
  }
  function screenHead(title, sub, back) {
    var to = back === "kuni" ? ["#/kuni", "国取りへ"] : back === "akinai" ? ["#/akinai", "商いへ"] : ["#/", "大地図へ"];
    return '<div class="screen-head"><h1 tabindex="-1"><span class="vt">' + esc(title) + "</span>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</h1>" +
      '<a class="btn ghost back" href="' + to[0] + '">◀ ' + to[1] + "</a></div>" +
      (sub ? '<p class="screen-sub" aria-hidden="true">' + esc(title) + "・" + esc(sub) + "</p>" : "");
  }

  // ---------- 画面：評定 ----------
  function viewHyojo() {
    var months = K.monthsSorted(state);
    var ym = ui.hyMonth && state.months[ui.hyMonth] ? ui.hyMonth : state.current;
    var prevYm = K.monthAdd(ym, -1);
    var co = K.companyPL(state, ym), pr = K.companyPL(state, prevYm), hasPrev = !!state.months[prevYm];
    var ba = K.budgetActual(state, ym), fc = K.forecastCash(state, ym, 6), adv = K.advise(state, ym, today());
    var sp = K.landSplit(state), silent = K.silentHouses(state, today());
    var monthLetters = state.letters.filter(function (l) { return l.date.slice(0, 7) === ym; }).length;
    var line = function (label, a, b, opt) {
      var d = a - b;
      return "<tr" + (opt && opt.strong ? ' class="strong"' : "") + '><th scope="row">' + label + '</th><td data-label="今月">' + yen(a) + (opt && opt.rate !== undefined ? ' <small class="sub">' + pct(opt.rate, 1) + "</small>" : "") + '</td><td data-label="前月">' + (hasPrev ? yen(b) : "—") + '</td><td data-label="増減" class="' + (hasPrev ? (d * (opt && opt.cost ? -1 : 1) >= 0 ? "up" : "down") : "") + '">' + (hasPrev ? (d >= 0 ? "+" : "") + yen(d) : "—") + "</td></tr>";
    };
    var perA = K.incomePerManKoku(state, ym), perB = hasPrev ? K.incomePerManKoku(state, prevYm) : null, perD = perA !== null && perB !== null ? perA - perB : null;
    return screenHead("評定", "月次レビュー・" + ml(ym).seireki) + monthNav(ym, months, "hy") +
      '<div class="grid2">' +
      '<section class="panel"><h2 class="ph">' + term("勘定", "月次損益") + "</h2>" +
      '<table class="rtable keep"><thead><tr><th scope="col">項目</th><th scope="col">今月</th><th scope="col">前月</th><th scope="col">増減</th></tr></thead><tbody>' +
      line(term("商い高", "売上"), co.sales, pr.sales) + line("原価", co.cost, pr.cost, { cost: true }) +
      line(term("儲け", "粗利"), co.gross, pr.gross, { rate: co.margin }) + line("販管費", co.sga, pr.sga, { cost: true }) +
      line("営業利益", co.op, pr.op, { strong: true }) +
      '<tr><th scope="row">1万石あたりの商い高<small class="sub">（実高あたりの売上）</small></th><td data-label="今月">' + (perA === null ? "—" : yen(perA)) + '</td><td data-label="前月">' + (perB === null ? "—" : yen(perB)) + '</td><td data-label="増減" class="' + (perD === null ? "" : perD >= 0 ? "up" : "down") + '">' + (perD === null ? "—" : (perD >= 0 ? "+" : "") + yen(perD)) + "</td></tr>" +
      "</tbody></table></section>" +
      '<section class="panel"><h2 class="ph">' + term("金の見通し", "手元資金の6か月予測") + "</h2>" + cashChart(fc, ym) +
      '<p class="note">今の手元資金 ' + yen(fc.start) + " から、直近" + (fc.basis.length || 0) + "か月の営業利益の平均（月 " + yen(fc.avgNet) + "）を足し、未完了の施策の費用を期限の月に、獲得・開墾中の圃場の開墾費用を翌月に引いた概算です。</p>" +
      '<table class="rtable keep"><thead><tr><th scope="col">月</th><th scope="col">収支</th><th scope="col">施策・開墾</th><th scope="col">見込み残高</th></tr></thead><tbody>' +
      fc.rows.map(function (r) {
        return '<tr><th scope="row">' + ml(r.ym).seireki + '</th><td data-label="収支">' + yen(r.net) + '</td><td data-label="施策・開墾">' + (r.measures ? "-" + yen(r.measures) : "—") + '</td><td data-label="見込み残高" class="' + (r.cash < 0 ? "down" : "") + '">' + yen(r.cash) + "</td></tr>";
      }).join("") + "</tbody></table></section>" +
      '<section class="panel"><h2 class="ph">' + term("国取りの進み具合", "圃場の面積") + "</h2>" + tenkaGauge() +
      '<dl class="kv"><div><dt>' + term("実高", "作付済み") + "</dt><dd>" + kokuLabel(sp.realArea) + "</dd></div>" +
      "<div><dt>" + term("見込み", "獲得・開墾中") + "</dt><dd>" + kokuLabel(sp.expectedArea) + "</dd></div>" +
      "<div><dt>" + term("狙い", "候補地・交渉中") + "</dt><dd>" + kokuLabel(sp.aimArea) + "</dd></div>" +
      "<div><dt>目標</dt><dd>" + koku(K.tenka(state).target) + "</dd></div></dl>" +
      '<a class="btn" href="#/kuni">国取りの地図へ</a></section>' +
      '<section class="panel"><h2 class="ph">' + term("外交の要約", "取引先・地主との連絡") + "</h2>" +
      '<dl class="kv"><div><dt>音信の途絶えた相手<small class="sub">（友好度4以上・地主で' + K.TH.silentDays + "日以上）</small></dt><dd>" + (silent.length ? '<span class="warn-t">' + silent.length + "件</span>" : "0件") + "</dd></div>" +
      "<div><dt>諸家の数</dt><dd>" + state.houses.length + "件</dd></div>" +
      "<div><dt>この月に送った書状</dt><dd>" + monthLetters + "通</dd></div></dl>" +
      (silent.length ? '<ul class="plain">' + silent.map(function (x) { return "<li>" + esc(x.house.name) + ' <small class="sub">' + (x.days === null ? "記録なし" : x.days + "日") + "</small></li>"; }).join("") + "</ul>" : "") +
      '<a class="btn" href="#/gaiko">外交へ</a></section>' +
      '<section class="panel span2"><h2 class="ph">' + term("商い目標", "店ごとの予算と実績") + "</h2>" +
      '<table class="rtable"><thead><tr><th scope="col">店（事業）</th><th scope="col">目標</th><th scope="col">実績</th><th scope="col">商い目標の達成</th><th scope="col">差</th><th scope="col">粗利率</th></tr></thead><tbody>' +
      (ba.rows.length ? ba.rows.map(function (r) {
        return '<tr><th scope="row"><a href="#/shop/' + encodeURIComponent(r.id) + '">' + esc(r.name) + '</a></th><td data-label="目標">' + yen(r.target) + '</td><td data-label="実績">' + yen(r.sales) + '</td><td data-label="商い目標の達成">' + gauge(r.rate) + '</td><td data-label="差" class="' + (r.diff >= 0 ? "up" : "down") + '">' + yen(r.diff) + '</td><td data-label="粗利率">' + pct(r.margin, 1) + "</td></tr>";
      }).join("") : '<tr><td colspan="6">店がありません</td></tr>') +
      '<tr class="strong"><th scope="row">合計</th><td data-label="目標">' + yen(ba.total.target) + '</td><td data-label="実績">' + yen(ba.total.sales) + '</td><td data-label="商い目標の達成">' + gauge(ba.total.rate) + '</td><td data-label="差" class="' + (ba.total.diff >= 0 ? "up" : "down") + '">' + yen(ba.total.diff) + '</td><td data-label="粗利率">' + pct(ba.total.margin, 1) + "</td></tr>" +
      "</tbody></table></section>" +
      '<section class="panel span2" id="advice"><h2 class="ph">' + term("軍師の進言", "注意・助言 " + adv.length + "件") + "</h2>" +
      '<ol class="advice">' + adv.map(function (a) {
        var link = a.castle ? '<a href="#/shop/' + encodeURIComponent(a.castle) + '">' + esc(shopName(a.castle)) + "の店を見る</a>" : a.area === "land" ? '<a href="#/kuni">国取りへ</a>' : a.area === "diplo" ? '<a href="#/gaiko">外交へ</a>' : "";
        return '<li class="adv adv-' + a.lv + '"><span class="lv lv' + a.lv + '">' + a.lvName + "</span><div><b>" + esc(a.title) + "</b><p>" + esc(a.text) + "</p>" + link + "</div></li>";
      }).join("") + "</ol></section></div>";
  }

  // ---------- 画面：外交 ----------
  function houseOptions(sel) {
    return '<option value="">（相手を選ぶ）</option>' + state.houses.map(function (h) { return '<option value="' + esc(h.id) + '"' + (h.id === sel ? " selected" : "") + ">" + esc(h.name) + "（" + K.houseKindName(h.kind) + "）</option>"; }).join("");
  }
  function defaultSender(houseId) {
    var h = byId(state.houses, houseId);
    return h && h.general ? generalName(h.general) : state.generals[0] ? state.generals[0].name : "";
  }
  function ensureDraft() {
    if (!ui.draft) ui.draft = { house: "", tpl: "thanks", subject: "", body: "", sender: defaultSender(""), filled: "" };
    return ui.draft;
  }
  function viewGaiko() {
    var d = ensureDraft(), h = byId(state.houses, d.house);
    var letters = state.letters.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    return screenHead("外交", "取引先・地主との書状") +
      '<div class="grid2">' +
      '<section class="panel" id="letter-sec" tabindex="-1"><h2 class="ph">' + term("書状をしたためる", "メールの下書き") + "</h2>" +
      '<p class="notice">この画面からはメールを送りません。「メールアプリで開く」で、お使いのメールアプリに宛先・件名・本文が入った状態で開きます。</p>' +
      '<form id="letter" onsubmit="return false">' +
      '<div class="f2"><label class="f"><span>相手（諸家）</span><select name="house">' + houseOptions(d.house) + "</select></label>" +
      '<label class="f"><span>型</span><select name="tpl">' + K.LETTER_TEMPLATES.map(function (t) { return '<option value="' + t.key + '"' + (t.key === d.tpl ? " selected" : "") + ">" + t.name + "</option>"; }).join("") + "</select></label></div>" +
      '<label class="f"><span>署名<small>（差出人のお名前）</small></span><input name="sender" maxlength="40" value="' + esc(d.sender) + '" autocomplete="off"></label>' +
      '<div class="btn-row"><button type="button" class="btn" id="apply-tpl">型を当てる<small>（件名と本文を作る）</small></button></div>' +
      '<label class="f"><span>宛先</span><input name="to" type="email" readonly value="' + esc(h ? h.email : "") + '" placeholder="相手を選ぶと入ります"></label>' +
      (h && !h.email ? '<p class="note warn-t">この相手はメールアドレスが登録されていません。メールアプリで宛先を入れるか、手紙にしてください。</p>' : "") +
      '<label class="f"><span>件名</span><input name="subject" maxlength="200" value="' + esc(d.subject) + '" autocomplete="off"></label>' +
      '<label class="f"><span>本文</span><textarea name="body" rows="14" maxlength="8000">' + esc(d.body) + "</textarea></label>" +
      '<div class="btn-row"><a class="btn primary" id="mailto" href="' + esc(K.mailtoHref(h ? h.email : "", d.subject, d.body)) + '">メールアプリで開く</a>' +
      '<button type="button" class="btn" id="copy-letter">写す<small>（コピー）</small></button>' +
      '<button type="button" class="btn" id="record-letter">送ったと記録</button></div>' +
      '<p class="note">「送ったと記録」を押すと、下の書状の記録に残り、相手の「最後にやりとりした日」が今日になります。</p></form></section>' +
      '<section class="panel"><h2 class="ph">' + term("書状の記録", "送ったメール " + letters.length + "通") + "</h2>" +
      (letters.length ? '<ul class="letters">' + letters.map(function (l) {
        return '<li><details><summary><span class="ld">' + esc(l.date) + '</span><span class="lh">' + esc(houseName(l.house) || "（相手なし）") + '</span><span class="ls">' + esc(l.subject) + '</span></summary><pre class="pre letter-body">' + esc(l.body) + "</pre></details></li>";
      }).join("") + "</ul>" : '<p class="empty">まだ記録がありません。</p>') + "</section>" +
      '<section class="panel span2"><h2 class="ph">' + term("諸家", "取引先・地主など " + state.houses.length + "件") + "</h2>" +
      '<div class="toolbar"><button type="button" class="btn primary" id="add-house">＋ 諸家を加える</button></div>' +
      (state.houses.length ? '<table class="rtable"><thead><tr><th scope="col">名前</th><th scope="col">担当者</th><th scope="col">メール</th><th scope="col">友好度</th><th scope="col">担当の武将</th><th scope="col">最後のやりとり</th><th scope="col">操作</th></tr></thead><tbody>' +
        state.houses.map(function (x) {
          return '<tr><th scope="row"><b>' + esc(x.name) + '</b><small class="sub">' + K.houseKindName(x.kind) + (x.memo ? "・" + esc(x.memo.slice(0, 30)) + (x.memo.length > 30 ? "…" : "") : "") + "</small></th>" +
            '<td data-label="担当者">' + (esc(x.contact) || "—") + '</td><td data-label="メール" class="mail">' + (x.email ? esc(x.email) : '<span class="muted">なし</span>') + "</td>" +
            '<td data-label="友好度">' + stars(x.friend) + '</td><td data-label="担当の武将">' + (x.general ? esc(generalName(x.general)) : '<span class="muted">未定</span>') + "</td>" +
            '<td data-label="最後のやりとり"><span>' + daysAgo(x.last) + "</span></td>" +
            '<td data-label="操作" class="ops"><button type="button" class="btn" data-write="' + esc(x.id) + '">書状を書く</button><button type="button" class="btn ghost" data-edh="' + esc(x.id) + '">編集</button><button type="button" class="btn ghost danger-t" data-delh="' + esc(x.id) + '">削除</button></td></tr>';
        }).join("") + "</tbody></table>" : '<p class="empty">まだ諸家がありません。</p>') +
      '<p class="note">メールアドレスなどは、この端末のブラウザの中だけに保存されます。</p></section></div>';
  }
  function houseForm(h) {
    h = h || { name: "", kind: "trade", contact: "", email: "", friend: 3, general: "", last: "", memo: "" };
    return '<label class="f"><span>名前<small>（会社名・お名前）</small></span><input name="name" required maxlength="60" value="' + esc(h.name) + '" autocomplete="off"></label>' +
      '<div class="f2"><label class="f"><span>種別</span><select name="kind">' + K.HOUSE_KINDS.map(function (k) { return '<option value="' + k.key + '"' + (k.key === h.kind ? " selected" : "") + ">" + k.name + "</option>"; }).join("") + "</select></label>" +
      '<label class="f"><span>友好度<small>（5段階）</small></span><select name="friend">' + [1, 2, 3, 4, 5].map(function (n) { return '<option value="' + n + '"' + (n === h.friend ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select></label></div>" +
      '<label class="f"><span>担当者名</span><input name="contact" maxlength="60" value="' + esc(h.contact) + '" autocomplete="off"></label>' +
      '<label class="f"><span>メールアドレス</span><input name="email" type="email" maxlength="120" value="' + esc(h.email) + '" autocomplete="off" inputmode="email"></label>' +
      '<div class="f2"><label class="f"><span>担当の武将</span><select name="general"><option value="">（未定）</option>' + state.generals.map(function (g) { return '<option value="' + esc(g.id) + '"' + (g.id === h.general ? " selected" : "") + ">" + esc(g.name) + "</option>"; }).join("") + "</select></label>" +
      '<label class="f"><span>最後にやりとりした日</span><input name="last" type="date" value="' + esc(h.last) + '"></label></div>' +
      '<label class="f"><span>メモ</span><textarea name="memo" rows="3" maxlength="500">' + esc(h.memo) + "</textarea></label>";
  }
  function readHouse(form, base) {
    var fd = new FormData(form), out = K.clone(base || {});
    out.name = String(fd.get("name") || "").trim();
    if (!out.name) return "名前を入れてください";
    out.kind = String(fd.get("kind")); out.friend = +fd.get("friend") || 3;
    out.contact = String(fd.get("contact") || "").trim(); out.email = String(fd.get("email") || "").trim();
    if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) return "メールアドレスの形を確かめてください";
    out.general = String(fd.get("general") || ""); out.last = /^\d{4}-\d{2}-\d{2}$/.test(String(fd.get("last"))) ? String(fd.get("last")) : "";
    out.memo = String(fd.get("memo") || "").trim();
    return out;
  }
  function bindGaiko(root) {
    var form = $("#letter", root), d = ensureDraft();
    var mail = $("#mailto", root);
    var sync = function () {
      d.house = form.house.value; d.tpl = form.tpl.value; d.subject = form.subject.value; d.body = form.body.value; d.sender = form.sender.value;
      var h = byId(state.houses, d.house);
      form.to.value = h ? h.email : "";
      mail.href = K.mailtoHref(h ? h.email : "", d.subject, d.body);
    };
    var fill = function () {
      var r = K.fillLetter(state, form.tpl.value, form.house.value, form.sender.value.trim(), today());
      form.subject.value = r.subject; form.body.value = r.body; d.filled = r.body; sync();
    };
    var fillAsk = function () {
      if (form.body.value.trim() && form.body.value !== d.filled) {
        confirmDlg("型を当てる", "いま書いている本文を、型の文面で置き換えます。よろしいですか。", "置き換える", function () { fill(); toast("型を当てました"); });
      } else { fill(); toast("型を当てました"); }
    };
    form.addEventListener("input", sync);
    form.house.addEventListener("change", function () {
      var prevSender = d.sender;
      if (!form.sender.value.trim() || form.sender.value === prevSender) form.sender.value = defaultSender(form.house.value);
      sync(); renderView(); var s = $("#letter [name=house]"); if (s) s.focus();
    });
    form.tpl.addEventListener("change", sync);
    $("#apply-tpl", root).addEventListener("click", fillAsk);
    $("#copy-letter", root).addEventListener("click", function () { sync(); copyText("件名：" + d.subject + "\n\n" + d.body, "件名と本文を写しました"); });
    mail.addEventListener("click", function () { sync(); toast("メールアプリを開きます。送ったら「送ったと記録」を押してください"); });
    $("#record-letter", root).addEventListener("click", function () {
      sync();
      if (!d.house) { toast("相手を選んでください"); form.house.focus(); return; }
      if (!d.subject.trim() && !d.body.trim()) { toast("件名か本文を書いてください"); form.subject.focus(); return; }
      var r = K.recordLetter(state, { date: today(), house: d.house, subject: d.subject, body: d.body });
      ui.draft = { house: d.house, tpl: d.tpl, subject: "", body: "", sender: d.sender, filled: "" };
      commit(r.state, "「" + houseName(d.house) + "」への書状を記録しました");
    });
    $("#add-house", root).addEventListener("click", function () {
      dialog({ title: "諸家を加える", body: houseForm(), ok: "加える", onOk: function (f) {
        var h = readHouse(f); if (typeof h === "string") return h;
        var s = K.clone(state); h.id = K.newId(s, "h"); s.houses.push(h);
        commit(s, "「" + h.name + "」を加えました");
      } });
    });
    $$("[data-edh]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var h = byId(state.houses, b.dataset.edh);
        dialog({ title: "諸家の編集", body: houseForm(h), ok: "保存する", onOk: function (f) {
          var n = readHouse(f, h); if (typeof n === "string") return n;
          var s = K.clone(state); s.houses = s.houses.map(function (x) { return x.id === h.id ? n : x; });
          commit(s, "記録しました");
        } });
      });
    });
    $$("[data-delh]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var h = byId(state.houses, b.dataset.delh);
        confirmDlg("諸家の削除", "「" + h.name + "」を一覧から消します。圃場の地主の欄は空になり、書状の記録は相手なしで残ります。よろしいですか。", "削除する", function () {
          if (d.house === h.id) d.house = "";
          commit(K.removeHouse(state, h.id), "削除しました");
        });
      });
    });
    $$("[data-write]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        d.house = b.dataset.write; d.sender = defaultSender(d.house);
        var r = K.fillLetter(state, d.tpl, d.house, d.sender, today());
        d.subject = r.subject; d.body = r.body; d.filled = r.body;
        renderView();
        var sec = $("#letter-sec"); if (sec) { sec.focus(); sec.scrollIntoView({ block: "start" }); }
        toast("「" + houseName(d.house) + "」宛ての下書きを作りました");
      });
    });
  }

  // ---------- 画面：奉行所 ----------
  function viewBugyo() {
    return screenHead("奉行所", "部署ごとのAIへの依頼") +
      '<section class="panel"><p class="notice">下知状を写して、お使いのAI（Claude など）に貼り付けてください。数字はこの端末の外へ自動では送られません。返ってきた答えは「報告を記録」で残せます。</p>' +
      '<div class="toolbar"><button type="button" class="btn primary" id="add-bugyo">＋ 奉行を任じる<small>（追加）</small></button>' +
      (state.bugyo.length ? "" : '<button type="button" class="btn" id="restore-bugyo">初期の5人を呼び戻す</button>') + "</div></section>" +
      (state.bugyo.length ? '<div class="bugyo-grid">' + state.bugyo.map(function (b) {
        var reps = state.reports.filter(function (r) { return r.bugyo === b.id; }).sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : 0; });
        return '<section class="panel bugyo" aria-label="' + esc(b.name) + '"><div class="bg-head">' + bugyoFigure(b.icon) + '<div><h2 class="ph">' + esc(b.name) + (b.role !== b.name ? '<small class="sub">' + esc(b.role) + "</small>" : "") + '</h2><p class="duty">' + esc(b.duty || "（役目は未記入）") + "</p></div></div>" +
          '<p class="chips" aria-label="渡す資料">' + (b.data.length ? b.data.map(function (k) { var x = K.DATA_KEYS.filter(function (d) { return d.key === k; })[0]; return '<span class="chip">' + esc(x ? x.name : k) + "</span>"; }).join("") : '<span class="muted">資料なし</span>') + "</p>" +
          '<details class="instr"><summary>指示書を見る</summary><pre class="pre">' + esc(b.instructions || "（なし）") + "</pre></details>" +
          '<div class="btn-row"><button type="button" class="btn primary" data-order="' + esc(b.id) + '">下知する<small>（依頼する）</small></button><button type="button" class="btn" data-report="' + esc(b.id) + '">報告を記録</button>' +
          '<button type="button" class="btn ghost" data-edb="' + esc(b.id) + '">編集</button><button type="button" class="btn ghost danger-t" data-delb="' + esc(b.id) + '">削除</button></div>' +
          '<details class="reports"' + (reps.length ? "" : "") + "><summary>報告の履歴（" + reps.length + "件）</summary>" +
          (reps.length ? '<ol class="rep-list">' + reps.map(function (r) {
            return '<li><p class="rep-meta">' + esc(r.date) + "</p>" + (r.request ? '<p class="rep-req"><b>依頼：</b>' + esc(r.request) + "</p>" : "") + '<pre class="pre rep-body">' + esc(r.report) + "</pre>" +
              '<div class="btn-row">' + (b.icon === "gaiko" ? '<button type="button" class="btn" data-todraft="' + esc(r.id) + '">書状の下書きに使う</button>' : "") +
              '<button type="button" class="btn ghost" data-copyrep="' + esc(r.id) + '">写す</button><button type="button" class="btn ghost danger-t" data-delrep="' + esc(r.id) + '">削除</button></div></li>';
          }).join("") + "</ol>" : '<p class="empty">まだ報告はありません。</p>') + "</details></section>";
      }).join("") + "</div>" : '<section class="panel"><p class="empty">奉行がいません。「奉行を任じる」か「初期の5人を呼び戻す」で作ってください。</p></section>');
  }
  function bugyoForm(b) {
    b = b || { name: "", role: "", duty: "", instructions: "", data: ["pl"], icon: "other" };
    return '<div class="f2"><label class="f"><span>名前</span><input name="name" required maxlength="40" value="' + esc(b.name) + '" autocomplete="off" placeholder="例：普請奉行"></label>' +
      '<label class="f"><span>役職</span><input name="role" maxlength="40" value="' + esc(b.role) + '" autocomplete="off" placeholder="例：設備担当"></label></div>' +
      '<label class="f"><span>役目<small>（一言）</small></span><input name="duty" maxlength="120" value="' + esc(b.duty) + '" autocomplete="off"></label>' +
      '<label class="f"><span>姿</span><select name="icon">' + K.BUGYO_ICONS.map(function (x) { return '<option value="' + x.key + '"' + (x.key === b.icon ? " selected" : "") + ">" + x.name + "</option>"; }).join("") + "</select></label>" +
      '<label class="f"><span>指示書<small>（このAIへの常の指示）</small></span><textarea name="instructions" rows="9" maxlength="8000">' + esc(b.instructions) + "</textarea></label>" +
      '<fieldset class="f checks"><legend>渡す資料<small>（下知状に今の数字を入れる）</small></legend>' + K.DATA_KEYS.map(function (d) {
        return '<label class="chk"><input type="checkbox" name="data" value="' + d.key + '"' + (b.data.indexOf(d.key) >= 0 ? " checked" : "") + "><span>" + d.name + "</span></label>";
      }).join("") + "</fieldset>";
  }
  function readBugyo(form, base) {
    var fd = new FormData(form), out = K.clone(base || {});
    out.name = String(fd.get("name") || "").trim();
    if (!out.name) return "名前を入れてください";
    out.role = String(fd.get("role") || "").trim() || out.name;
    out.duty = String(fd.get("duty") || "").trim(); out.icon = String(fd.get("icon") || "other");
    out.instructions = String(fd.get("instructions") || "").trim(); out.data = fd.getAll("data").map(String);
    return out;
  }
  function parseDraft(text) { // 「件名：」で始まる行を件名に、残りを本文に
    var lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    var i = lines.findIndex(function (l) { return /^\s*件名[：:]/.test(l); });
    if (i < 0) return { subject: "", body: String(text || "").trim() };
    var subject = lines[i].replace(/^\s*件名[：:]\s*/, "").trim();
    return { subject: subject, body: lines.slice(0, i).concat(lines.slice(i + 1)).join("\n").trim() };
  }
  function bindBugyo(root) {
    var find = function (id) { return byId(state.bugyo, id); };
    $("#add-bugyo", root).addEventListener("click", function () {
      dialog({ title: "奉行を任じる（追加）", body: bugyoForm(), ok: "任じる", onOk: function (f) {
        var b = readBugyo(f); if (typeof b === "string") return b;
        var s = K.clone(state); b.id = K.newId(s, "b"); s.bugyo.push(b);
        commit(s, "「" + b.name + "」を任じました");
      } });
    });
    var rb = $("#restore-bugyo", root);
    if (rb) rb.addEventListener("click", function () {
      var s = K.clone(state);
      K.defaultBugyo().forEach(function (b) { if (byId(s.bugyo, b.id) || s.castles.some(function (c) { return c.id === b.id; })) b.id = K.newId(s, "b"); s.bugyo.push(b); });
      commit(s, "初期の5人を呼び戻しました");
    });
    $$("[data-edb]", root).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var b = find(btn.dataset.edb);
        dialog({ title: "奉行の編集", body: bugyoForm(b), ok: "保存する", onOk: function (f) {
          var n = readBugyo(f, b); if (typeof n === "string") return n;
          var s = K.clone(state); s.bugyo = s.bugyo.map(function (x) { return x.id === b.id ? n : x; });
          commit(s, "記録しました");
        } });
      });
    });
    $$("[data-delb]", root).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var b = find(btn.dataset.delb);
        confirmDlg("奉行の削除", "「" + b.name + "」と、その報告の履歴を消します。よろしいですか。", "削除する", function () { commit(K.removeBugyo(state, b.id), "削除しました"); });
      });
    });
    $$("[data-order]", root).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var b = find(btn.dataset.order);
        var prev = ui.lastOrder && ui.lastOrder.bugyo === b.id ? ui.lastOrder.request : "";
        dialog({
          title: "下知する：" + b.name, ok: "閉じる", cancel: false,
          body: '<p class="notice">下知状を写して、お使いのAI（Claude など）に貼り付けてください。数字はこの端末の外へ自動では送られません。</p>' +
            '<label class="f"><span>依頼文</span><textarea name="request" rows="4" maxlength="4000" placeholder="例：今月の数字で、来月いちばん気をつけることを3つ教えて">' + esc(prev) + "</textarea></label>" +
            '<div class="btn-row"><button type="button" class="btn primary" id="make-order">下知状を作る</button></div>' +
            '<div id="order-out" hidden><label class="f"><span>下知状<small>（このまま AI に渡せる文面）</small></span><textarea name="order" rows="14" readonly></textarea></label>' +
            '<div class="btn-row"><button type="button" class="btn primary" id="copy-order">写す<small>（コピー）</small></button></div></div>',
          onOk: function () { }
        });
        var dlg = $("#dlg");
        $("#make-order", dlg).addEventListener("click", function () {
          var req = $("[name=request]", dlg).value;
          if (!req.trim()) { $(".dlg-err", dlg).textContent = "依頼文を書いてください"; $("[name=request]", dlg).focus(); return; }
          $(".dlg-err", dlg).textContent = "";
          ui.lastOrder = { bugyo: b.id, request: req.trim() };
          $("[name=order]", dlg).value = K.buildOrder(state, b, req, { today: today() });
          $("#order-out", dlg).hidden = false;
          $("#copy-order", dlg).focus();
        });
        $("#copy-order", dlg).addEventListener("click", function () { copyText($("[name=order]", dlg).value, "下知状を写しました。AI に貼り付けてください"); });
      });
    });
    $$("[data-report]", root).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var b = find(btn.dataset.report);
        var prev = ui.lastOrder && ui.lastOrder.bugyo === b.id ? ui.lastOrder.request : "";
        dialog({ title: "報告を記録：" + b.name, ok: "記録する",
          body: '<label class="f"><span>依頼<small>（何を頼んだか）</small></span><textarea name="request" rows="2" maxlength="4000">' + esc(prev) + "</textarea></label>" +
            '<label class="f"><span>報告<small>（AI の返答を貼り付け）</small></span><textarea name="report" rows="10" maxlength="20000" required></textarea></label>',
          onOk: function (f) {
            try { var r = K.addReport(state, b.id, f.request.value, f.report.value, today()); commit(r.state, "「" + b.name + "」の報告を記録しました"); }
            catch (e) { return e.message; }
          } });
      });
    });
    $$("[data-todraft]", root).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var r = byId(state.reports, btn.dataset.todraft), p = parseDraft(r.report), d = ensureDraft();
        d.subject = p.subject || d.subject; d.body = p.body; d.filled = p.body;
        toast("報告を書状の下書きに入れました。相手を選んで確かめてください");
        location.hash = "#/gaiko";
      });
    });
    $$("[data-copyrep]", root).forEach(function (btn) { btn.addEventListener("click", function () { copyText(byId(state.reports, btn.dataset.copyrep).report); }); });
    $$("[data-delrep]", root).forEach(function (btn) {
      btn.addEventListener("click", function () {
        confirmDlg("報告の削除", "この報告を消します。よろしいですか。", "削除する", function () {
          var s = K.clone(state); s.reports = s.reports.filter(function (x) { return x.id !== btn.dataset.delrep; }); commit(s, "削除しました");
        });
      });
    });
  }

  // ---------- 画面：武将 ----------
  function castleOptions(sel, emptyLabel) {
    return '<option value="">' + esc(emptyLabel || "（なし）") + "</option>" + state.castles.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === sel ? " selected" : "") + ">" + esc(c.name) + "</option>";
    }).join("");
  }
  function viewBushou() {
    var bar = function (g, k) { return '<span class="abar"><span class="bar"><i style="width:' + g[k] + '%"></i></span><b>' + g[k] + "</b></span>"; };
    return screenHead("武将", "メンバー " + state.generals.length + "名") +
      '<section class="panel"><div class="toolbar"><button type="button" class="btn primary" id="add-gen">＋ 武将を召し抱える<small>（メンバー追加）</small></button></div>' +
      (state.generals.length ? '<table class="rtable"><thead><tr><th scope="col">武将</th><th scope="col">' + term("知行", "担当圃場の石高") + '</th><th scope="col">' + term("統率", "マネジメント") + '</th><th scope="col">' + term("武勇", "営業") + '</th><th scope="col">' + term("知略", "企画") + '</th><th scope="col">' + term("政務", "事務") + '</th><th scope="col">担当の店</th><th scope="col">操作</th></tr></thead><tbody>' +
        state.generals.map(function (g) {
          var gf = K.generalFields(state, g.id);
          return '<tr><th scope="row"><b>' + esc(g.name) + '</b><small class="sub">' + esc(g.role) + "</small></th>" +
            '<td data-label="知行（担当圃場の石高）"><span><b>知行 ' + koku(K.generalKoku(state, g.id)) + "</b>" + '<small class="sub fl">' + (gf.length ? gf.map(function (f) { return esc(f.name) + (f.status === "own" ? "" : "（" + K.fieldStatus(f.status).name + "）"); }).join("・") : "圃場なし") + "</small></span></td>" +
            '<td data-label="統率（マネジメント）">' + bar(g, "tou") + '</td><td data-label="武勇（営業）">' + bar(g, "bu") + '</td><td data-label="知略（企画）">' + bar(g, "chi") + '</td><td data-label="政務（事務）">' + bar(g, "sei") + "</td>" +
            '<td data-label="担当の店"><label class="sr-only" for="as-' + esc(g.id) + '">' + esc(g.name) + 'の担当の店</label><select id="as-' + esc(g.id) + '" data-assign="' + esc(g.id) + '">' + castleOptions(g.castle, "（担当なし）") + "</select></td>" +
            '<td data-label="操作" class="ops"><button type="button" class="btn ghost" data-edit-gen="' + esc(g.id) + '">編集</button><button type="button" class="btn ghost danger-t" data-del-gen="' + esc(g.id) + '">削除</button></td></tr>';
        }).join("") + "</tbody></table>" : '<p class="empty">まだ武将（メンバー）がいません。</p>') +
      '<p class="note">知行は、担当している圃場のうち獲得・開墾中・自領の石高の合計です。</p></section>';
  }
  function generalForm(g) {
    g = g || { name: "", role: "", tou: 50, bu: 50, chi: 50, sei: 50, castle: "" };
    var ab = function (k, a, b) { return '<label class="f"><span>' + a + "<small>（" + b + "）</small></span><input type=\"number\" name=\"" + k + '" min="1" max="100" step="1" required value="' + g[k] + '" inputmode="numeric"></label>'; };
    return '<label class="f"><span>名前</span><input name="name" required maxlength="40" value="' + esc(g.name) + '" autocomplete="off"></label>' +
      '<label class="f"><span>役職<small>（例：家老＝番頭、奉行＝担当者）</small></span><input name="role" maxlength="40" value="' + esc(g.role) + '" autocomplete="off"></label>' +
      '<div class="f2">' + ab("tou", "統率", "マネジメント") + ab("bu", "武勇", "営業") + ab("chi", "知略", "企画") + ab("sei", "政務", "事務") + "</div>" +
      '<label class="f"><span>担当の店</span><select name="castle">' + castleOptions(g.castle, "（担当なし）") + "</select></label>" +
      (state.fields.length ? '<fieldset class="f checks"><legend>担当の圃場<small>（知行。1枚の圃場の担当は1人）</small></legend>' + state.fields.map(function (f) {
        var other = f.general && f.general !== g.id ? generalName(f.general) : "";
        return '<label class="chk"><input type="checkbox" name="fields" value="' + esc(f.id) + '"' + (g.id && f.general === g.id ? " checked" : "") + "><span>" + esc(f.name) + ' <small class="sub">' + K.fieldStatus(f.status).name + "・" + koku(K.kokuOf(state, f.area)) + (other ? "・今は" + esc(other) : "") + "</small></span></label>";
      }).join("") + "</fieldset>" : "") +
      '<p class="note">能力値は 1〜100 で、自分たちの目安で付けてください。</p>';
  }
  function readGeneral(form, base) {
    var fd = new FormData(form), out = K.clone(base || {});
    out.name = String(fd.get("name") || "").trim();
    if (!out.name) return "名前を入れてください";
    out.role = String(fd.get("role") || "").trim();
    ["tou", "bu", "chi", "sei"].forEach(function (k) { var n = Math.round(+fd.get(k)); out[k] = Math.max(1, Math.min(100, isFinite(n) && n ? n : 1)); });
    out.castle = String(fd.get("castle") || "");
    out._fields = fd.getAll("fields").map(String);
    return out;
  }
  function applyFields(s, g) {
    var picked = g._fields || [];
    delete g._fields;
    s.fields.forEach(function (f) {
      if (picked.indexOf(f.id) >= 0) f.general = g.id;
      else if (f.general === g.id) f.general = "";
    });
  }
  function bindBushou(root) {
    var add = $("#add-gen", root);
    if (add) add.addEventListener("click", function () {
      dialog({ title: "武将を召し抱える（メンバー追加）", body: generalForm(), ok: "召し抱える", onOk: function (f) {
        var g = readGeneral(f); if (typeof g === "string") return g;
        var s = K.clone(state); g.id = K.newId(s, "g"); applyFields(s, g); s.generals.push(g);
        commit(s, g.name + "を召し抱えました");
      } });
    });
    $$("[data-edit-gen]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var g = byId(state.generals, b.dataset.editGen);
        dialog({ title: "武将の編集", body: generalForm(g), ok: "保存する", onOk: function (f) {
          var n = readGeneral(f, g); if (typeof n === "string") return n;
          var s = K.clone(state); applyFields(s, n); s.generals = s.generals.map(function (x) { return x.id === g.id ? n : x; });
          commit(s, "記録しました");
        } });
      });
    });
    $$("[data-del-gen]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var g = byId(state.generals, b.dataset.delGen);
        confirmDlg("武将の削除", g.name + " を一覧から外します。担当している施策・圃場・諸家の担当も空になります。よろしいですか。", "削除する", function () {
          commit(K.removeGeneral(state, g.id), g.name + "を外しました");
        });
      });
    });
    $$("[data-assign]", root).forEach(function (sel) {
      sel.addEventListener("change", function () {
        var s = K.clone(state);
        s.generals.forEach(function (x) { if (x.id === sel.dataset.assign) x.castle = sel.value; });
        state = s; save(); renderStatus();
        toast(generalName(sel.dataset.assign) + "を" + (sel.value ? shopName(sel.value) + "の番頭に任じました" : "担当なしにしました"));
      });
    });
  }

  // ---------- 画面：内政 ----------
  function viewNaisei() {
    var order = { doing: 0, todo: 1, done: 2 };
    var list = state.measures.slice().sort(function (a, b) { return order[a.status] - order[b.status] || (a.due || "9999").localeCompare(b.due || "9999"); });
    var cur = state.current;
    return screenHead("内政", "施策 " + state.measures.filter(function (m) { return m.status !== "done"; }).length + "件が進行・未着手") +
      '<section class="panel"><div class="toolbar"><button type="button" class="btn primary" id="add-ms">＋ 施策を命じる<small>（追加）</small></button></div>' +
      '<ul class="kinds" aria-label="施策の種類">' + K.KINDS.map(function (k) { return "<li><b>" + k.name + "</b><small>" + k.biz + "</small></li>"; }).join("") + "</ul>" +
      (list.length ? '<table class="rtable"><thead><tr><th scope="col">施策</th><th scope="col">種類</th><th scope="col">対象の店</th><th scope="col">担当</th><th scope="col">費用</th><th scope="col">期限</th><th scope="col">状態</th><th scope="col">操作</th></tr></thead><tbody>' +
        list.map(function (m) {
          var k = kindOf(m.kind), over = m.status !== "done" && m.due && m.due.slice(0, 7) < cur;
          return '<tr class="' + (m.status === "done" ? "is-done" : "") + '"><th scope="row">' + esc(m.title) + "</th>" +
            '<td data-label="種類"><span class="kind">' + k.name + "<small>" + k.biz + "</small></span></td>" +
            '<td data-label="対象の店">' + (m.castle ? esc(shopName(m.castle)) : "全体") + "</td>" +
            '<td data-label="担当">' + (m.general ? esc(generalName(m.general)) : '<span class="muted">未定</span>') + "</td>" +
            '<td data-label="費用">' + (m.cost ? yen(m.cost) : "—") + "</td>" +
            '<td data-label="期限" class="' + (over ? "down" : "") + '"><span>' + (m.due || "—") + (over ? "<small>（期限切れ）</small>" : "") + "</span></td>" +
            '<td data-label="状態"><span class="stt stt-' + m.status + '">' + statusName(m.status) + "</span></td>" +
            '<td data-label="操作" class="ops">' + (m.status !== "done" ? '<button type="button" class="btn" data-done-ms="' + esc(m.id) + '">完了</button>' : "") +
            '<button type="button" class="btn ghost" data-edit-ms="' + esc(m.id) + '">編集</button><button type="button" class="btn ghost danger-t" data-del-ms="' + esc(m.id) + '">削除</button></td></tr>';
        }).join("") + "</tbody></table>" : '<p class="empty">まだ施策がありません。「施策を命じる」から加えてください。</p>') +
      '<p class="note">費用は、完了していない施策のぶんだけ「評定」の資金繰り予測で期限の月に差し引きます。</p></section>';
  }
  function measureForm(m) {
    m = m || { title: "", kind: "shogyo", castle: "", general: "", cost: 0, due: "", status: "todo" };
    return '<label class="f"><span>施策の名前</span><input name="title" required maxlength="80" value="' + esc(m.title) + '" autocomplete="off"></label>' +
      '<label class="f"><span>種類</span><select name="kind">' + K.KINDS.map(function (k) { return '<option value="' + k.key + '"' + (k.key === m.kind ? " selected" : "") + ">" + k.name + "（" + k.biz + "）</option>"; }).join("") + "</select></label>" +
      '<div class="f2"><label class="f"><span>対象の店</span><select name="castle">' + castleOptions(m.castle, "全体") + "</select></label>" +
      '<label class="f"><span>担当</span><select name="general"><option value="">未定</option>' + state.generals.map(function (g) { return '<option value="' + esc(g.id) + '"' + (g.id === m.general ? " selected" : "") + ">" + esc(g.name) + "</option>"; }).join("") + "</select></label>" +
      '<label class="f"><span>費用（円）</span><input name="cost" type="number" min="0" step="1" inputmode="numeric" value="' + (m.cost || 0) + '"></label>' +
      '<label class="f"><span>期限</span><input name="due" type="date" value="' + esc(m.due) + '"></label></div>' +
      '<label class="f"><span>状態</span><select name="status">' + K.STATUSES.map(function (s) { return '<option value="' + s.key + '"' + (s.key === m.status ? " selected" : "") + ">" + s.name + "</option>"; }).join("") + "</select></label>";
  }
  function readMeasure(form, base) {
    var fd = new FormData(form), out = K.clone(base || {});
    out.title = String(fd.get("title") || "").trim();
    if (!out.title) return "施策の名前を入れてください";
    out.kind = String(fd.get("kind")); out.castle = String(fd.get("castle") || ""); out.general = String(fd.get("general") || "");
    var c = +fd.get("cost"); if (!isFinite(c) || c < 0) return "費用は0以上の数字で入れてください";
    out.cost = Math.round(c);
    out.due = /^\d{4}-\d{2}-\d{2}$/.test(String(fd.get("due"))) ? String(fd.get("due")) : "";
    out.status = String(fd.get("status"));
    return out;
  }
  function bindNaisei(root) {
    $("#add-ms", root).addEventListener("click", function () {
      dialog({ title: "施策を命じる（追加）", body: measureForm(), ok: "命じる", onOk: function (f) {
        var m = readMeasure(f); if (typeof m === "string") return m;
        var s = K.clone(state); m.id = K.newId(s, "m"); s.measures.push(m);
        commit(s, "施策「" + m.title + "」を命じました");
      } });
    });
    var find = function (id) { return byId(state.measures, id); };
    $$("[data-edit-ms]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var m = find(b.dataset.editMs);
        dialog({ title: "施策の編集", body: measureForm(m), ok: "保存する", onOk: function (f) {
          var n = readMeasure(f, m); if (typeof n === "string") return n;
          var s = K.clone(state); s.measures = s.measures.map(function (x) { return x.id === m.id ? n : x; });
          commit(s, "記録しました");
        } });
      });
    });
    $$("[data-done-ms]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var s = K.clone(state), t = "";
        s.measures.forEach(function (x) { if (x.id === b.dataset.doneMs) { x.status = "done"; t = x.title; } });
        commit(s, "「" + t + "」を完了にしました");
      });
    });
    $$("[data-del-ms]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var m = find(b.dataset.delMs);
        confirmDlg("施策の削除", "施策「" + m.title + "」を削除します。よろしいですか。", "削除する", function () {
          var s = K.clone(state); s.measures = s.measures.filter(function (x) { return x.id !== m.id; });
          commit(s, "削除しました");
        });
      });
    });
  }

  // ---------- 画面：帳簿 ----------
  var FIELDS = [
    { k: "sales", a: "商い高", b: "売上", unit: "円" },
    { k: "cost", a: "原価", b: "仕入・材料など", unit: "円" },
    { k: "target", a: "目標", b: "売上目標", unit: "円" },
    { k: "stock", a: "蔵", b: "月末の在庫金額", unit: "円" },
    { k: "repeat", a: "贔屓", b: "リピート率", unit: "%" }
  ];
  function viewChobo() {
    var months = K.monthsSorted(state);
    var ym = ui.chMonth && state.months[ui.chMonth] ? ui.chMonth : state.current;
    var m = state.months[ym], sp = K.landSplit(state);
    var inp = function (name, val, label, unit, attrs) {
      return '<label class="f"><span>' + label + '</span><span class="inwrap"><input type="number" ' + attrs + ' inputmode="decimal" name="' + name + '" value="' + (val === null || val === undefined ? "" : val) + '"><i>' + unit + "</i></span></label>";
    };
    return screenHead("帳簿", "数字の入力・" + ml(ym).seireki) + monthNav(ym, months, "ch") +
      '<p class="note lead">入力欄を離れると自動で保存されます（この端末の中だけに保存）。' + (ym !== state.current ? "<b>今月ではなく過去の月を直しています。</b>" : "") + "</p>" +
      '<form class="ledger" id="ledger" data-ym="' + ym + '" onsubmit="return false">' +
      '<fieldset class="panel ledger-card co"><legend class="ph">全社<small>（' + ml(ym).seireki + '）</small></legend><div class="lgrid">' +
      inp("sga", m.sga, "販管費<small>（人件費・家賃・送料・広告など）</small>", "円", 'min="0" step="1"') +
      inp("cash", m.cash, "金<small>（月末の手元資金）</small>", "円", 'step="1"') + "</div></fieldset>" +
      state.castles.map(function (c) {
        var v = K.castleMonth(state, ym, c.id);
        return '<fieldset class="panel ledger-card"><legend class="ph">' + esc(c.name) + '</legend><div class="lgrid">' +
          FIELDS.map(function (f) {
            return inp(c.id + "." + f.k, f.k === "repeat" ? v.repeat : v[f.k], esc(f.a) + "<small>（" + esc(f.b) + "）</small>", f.unit, f.k === "repeat" ? 'min="0" max="100" step="0.1"' : 'min="0" step="1"');
          }).join("") + "</div></fieldset>";
      }).join("") + "</form>" +
      '<div class="grid2">' +
      '<section class="panel"><h2 class="ph">' + term("店構え", "事業の追加・名前の変更・削除") + "</h2>" +
      '<ul class="castle-admin">' + state.castles.map(function (c) {
        return "<li><span>" + esc(c.name) + '</span><span class="ops"><button type="button" class="btn ghost" data-ren="' + esc(c.id) + '">名前の変更</button><button type="button" class="btn ghost danger-t" data-delc="' + esc(c.id) + '">削除</button></span></li>';
      }).join("") + "</ul>" +
      (state.castles.length < K.MAX_CASTLES ? '<form class="add-castle" id="add-castle"><label class="f"><span>新しい店（事業・販路）の名前</span><input name="name" maxlength="40" required autocomplete="off" placeholder="例：百貨店催事"></label><button class="btn primary">店を開く（追加）</button></form>' : '<p class="note">店は' + K.MAX_CASTLES + "までです。</p>") +
      "</section>" +
      '<section class="panel" id="fields-sec" tabindex="-1"><h2 class="ph">' + term("領地", "圃場の追加・編集・削除") + "</h2>" +
      '<p class="note">国力（実高） <b>' + koku(sp.real) + "</b>（" + area(sp.realArea) + "）・見込み " + koku(sp.expected) + "・狙い " + koku(sp.aim) + "</p>" +
      (state.fields.length ? '<ul class="castle-admin">' + state.fields.map(function (f) {
        return "<li><span>" + esc(f.name) + '<small class="sub fl">' + K.fieldStatus(f.status).name + "・" + koku(K.kokuOf(state, f.area)) + "（" + area(f.area) + "）" + (f.crop ? "・" + esc(f.crop) : "") + "・" + (f.general ? esc(generalName(f.general)) : '<span class="warn-t">担当なし</span>') + '</small></span><span class="ops"><button type="button" class="btn ghost" data-edf="' + esc(f.id) + '">編集</button><button type="button" class="btn ghost danger-t" data-delf="' + esc(f.id) + '">削除</button></span></li>';
      }).join("") + "</ul>" : '<p class="empty">まだ圃場がありません。</p>') +
      (state.fields.length < K.MAX_FIELDS ? '<button type="button" class="btn primary" id="add-field">＋ 圃場を加える</button>' : '<p class="note">圃場は' + K.MAX_FIELDS + "枚までです。</p>") +
      '<form class="koku-set" id="koku-set"><div class="f2"><label class="f"><span>石高の換算<small>（1aあたりの石数。既定は1,000＝1反で1万石）</small></span><span class="inwrap"><input type="number" name="rate" min="1" step="1" required inputmode="numeric" value="' + state.kokuPerA + '"><i>石/a</i></span></label>' +
      '<label class="f"><span>天下取りの目標<small>（目標石高）</small></span><span class="inwrap"><input type="number" name="target" min="1" step="1" required inputmode="numeric" value="' + state.targetKoku + '"><i>石</i></span></label></div>' +
      '<p class="note">今の換算：1a＝' + koku(K.kokuOf(state, 1)) + "、1反＝" + koku(K.kokuOf(state, 10)) + "、1町＝" + koku(K.kokuOf(state, 100)) + '</p><button class="btn">換算と目標を変える</button></form>' +
      "</section>" +
      '<section class="panel span2"><h2 class="ph">' + term("文書蔵", "取り込み・書き出し・バックアップ") + "</h2>" +
      '<div class="btn-grid">' +
      '<button type="button" class="btn" id="csv-out">数字のCSVを書き出す</button>' +
      '<button type="button" class="btn" id="fcsv-out">圃場のCSVを書き出す</button>' +
      '<button type="button" class="btn" id="hcsv-out">諸家のCSVを書き出す</button>' +
      '<button type="button" class="btn" id="csv-in">CSVを取り込む</button>' +
      '<button type="button" class="btn" id="json-out">バックアップ（JSON）</button>' +
      '<button type="button" class="btn" id="json-in">バックアップから復元</button>' +
      '<button type="button" class="btn ghost" id="reset-sample">サンプルに戻す</button>' +
      '<button type="button" class="btn ghost danger-t" id="wipe">すべて消す</button></div>' +
      '<details class="csv-help"><summary>CSVの形</summary>' +
      "<p>数字の表：1行目の見出し <code>" + K.CSV_COLS.join(",") + "</code>。店ごとに1行。販管費と手元資金は、店の欄を「" + K.COMPANY_ROW + "」にした行に書きます。空の欄は今の値のまま。知らない店の名前は新しい店として加えます（第1版の「城」の見出しも読めます）。</p>" +
      "<p>圃場の表：<code>" + K.FIELD_COLS.join(",") + "</code>。面積は a の数字のほか「1町2反」とも書けます。状態は 狙い・調略中・獲得・開墾中・自領。</p>" +
      "<p>諸家の表：<code>" + K.HOUSE_COLS.join(",") + "</code>。</p>" +
      "<p>取り込みは同じボタンで、見出しを見て自動で見分けます。書き出しは UTF-8（BOM付き）です。</p></details>" +
      "</section></div>";
  }
  function bindChobo(root) {
    var form = $("#ledger", root);
    form.addEventListener("change", function (e) {
      var el = e.target; if (!el.name) return;
      var ym = form.dataset.ym, s = K.clone(state), m = s.months[ym];
      var raw = el.value.trim(), v = raw === "" ? null : +raw;
      if (raw !== "" && !isFinite(v)) { toast("数字で入れてください"); return; }
      if (el.name === "sga" || el.name === "cash") m[el.name] = v === null ? 0 : v;
      else {
        var parts = el.name.split("."), cid = parts[0], k = parts[1];
        var cur = m.c[cid] || { sales: 0, cost: 0, target: 0, stock: 0, repeat: null };
        if (k === "repeat") cur.repeat = v === null ? null : Math.max(0, Math.min(100, v));
        else cur[k] = v === null ? 0 : v;
        m.c[cid] = cur;
      }
      state = s; save(); renderStatus();
      toast("記帳しました");
    });
    var addf = $("#add-castle", root);
    if (addf) addf.addEventListener("submit", function (e) {
      e.preventDefault();
      try {
        var r = K.addCastle(state, new FormData(addf).get("name"));
        var s = r.state, m = s.months[s.current];
        if (m) m.c[r.castle.id] = { sales: 0, cost: 0, target: 0, stock: 0, repeat: null };
        commit(s, "「" + r.castle.name + "」の店を開きました");
        var f = $("#add-castle input"); if (f) f.focus();
      } catch (err) { toast(err.message); }
    });
    $$("[data-ren]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.dataset.ren;
        dialog({ title: "店の名前の変更", body: '<label class="f"><span>新しい名前</span><input name="name" required maxlength="40" value="' + esc(shopName(id)) + '" autocomplete="off"></label>', ok: "変更する", onOk: function (f) {
          var n = String(new FormData(f).get("name") || "").trim();
          if (!n) return "名前を入れてください";
          if (state.castles.some(function (c) { return c.name === n && c.id !== id; })) return "同じ名前の店があります";
          var s = K.clone(state); s.castles.forEach(function (c) { if (c.id === id) c.name = n; });
          commit(s, "名前を「" + n + "」に変えました");
        } });
      });
    });
    $$("[data-delc]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.dataset.delc, n = shopName(id);
        confirmDlg("店の削除", "「" + n + "」の店と、すべての月の数字を消します。担当の武将と施策の対象は空になります。元に戻せません。よろしいですか。", "削除する", function () {
          if (ui.sel === id) ui.sel = "";
          commit(K.removeCastle(state, id), "「" + n + "」を削除しました");
        });
      });
    });
    var addF = $("#add-field", root);
    if (addF) addF.addEventListener("click", function () { openFieldDialog(null, "own"); });
    $$("[data-edf]", root).forEach(function (b) { b.addEventListener("click", function () { openFieldDialog(fieldOf(b.dataset.edf)); }); });
    $$("[data-delf]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var fl = fieldOf(b.dataset.delf);
        confirmDlg("圃場の削除", "圃場「" + fl.name + "」（" + area(fl.area) + "）を削除します。元に戻せません。よろしいですか。", "削除する", function () {
          if (ui.sel === fl.id) ui.sel = "";
          commit(K.removeField(state, fl.id), "「" + fl.name + "」を削除しました");
        });
      });
    });
    var ks = $("#koku-set", root);
    ks.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = +ks.rate.value, t = +ks.target.value;
      if (!isFinite(v) || v <= 0 || !isFinite(t) || t <= 0) { toast("1以上の数字を入れてください"); return; }
      var s = K.clone(state); s.kokuPerA = v; s.targetKoku = Math.round(t);
      commit(s, "換算を1a＝" + koku(v) + "、目標を" + koku(t) + "にしました");
    });
    var stamp = function () { return today(); };
    $("#csv-out", root).addEventListener("click", function () { download("keiei-" + stamp() + ".csv", "﻿" + K.toCSV(state), "text/csv"); toast("数字のCSVを書き出しました"); });
    $("#fcsv-out", root).addEventListener("click", function () { download("keiei-fields-" + stamp() + ".csv", "﻿" + K.fieldsToCSV(state), "text/csv"); toast("圃場のCSVを書き出しました"); });
    $("#hcsv-out", root).addEventListener("click", function () { download("keiei-houses-" + stamp() + ".csv", "﻿" + K.housesToCSV(state), "text/csv"); toast("諸家のCSVを書き出しました"); });
    $("#json-out", root).addEventListener("click", function () { download("keiei-backup-" + stamp() + ".json", JSON.stringify(state, null, 1), "application/json"); toast("バックアップを書き出しました"); });
    $("#csv-in", root).addEventListener("click", function () {
      pickFile(".csv,text/csv", function (text) {
        var r = K.importAnyCSV(state, text);
        if (!r.imported) { alertDlg("取り込めませんでした", r.errors.slice(0, 8).join("\n") || "読める行がありません"); return; }
        var what = r.kind === "fields" ? "圃場" : r.kind === "houses" ? "諸家" : "店";
        var msg = r.imported + "行を取り込みました" + (r.created.length ? "（新しい" + what + "：" + r.created.join("、") + "）" : "");
        commit(r.state, msg);
        if (r.errors.length) alertDlg(r.skipped ? "一部の行を飛ばしました" : "取り込みました（注意あり）", msg + (r.skipped ? "\n飛ばした行：" + r.skipped : "") + "\n" + r.errors.slice(0, 8).join("\n"));
      });
    });
    $("#json-in", root).addEventListener("click", function () {
      pickFile(".json,application/json", function (text) {
        var s;
        try { s = K.normalize(JSON.parse(text)); } catch (e) { alertDlg("復元できませんでした", "経営評定のバックアップ（JSON）ではないようです。"); return; }
        confirmDlg("バックアップから復元", "今の数字をすべて、このバックアップの内容に置き換えます。よろしいですか。", "復元する", function () { ui.sel = ""; ui.chMonth = null; ui.hyMonth = null; ui.draft = null; commit(s, "復元しました"); });
      });
    });
    $("#reset-sample", root).addEventListener("click", function () {
      confirmDlg("サンプルに戻す", "今の数字をすべて消して、架空の会社「悠三堂」のサンプルに戻します。先にバックアップを取ることをおすすめします。よろしいですか。", "サンプルに戻す", function () {
        ui.sel = ""; ui.chMonth = null; ui.hyMonth = null; ui.draft = null; commit(K.normalize(SAMPLE.build()), "サンプルに戻しました");
      });
    });
    $("#wipe", root).addEventListener("click", function () {
      confirmDlg("すべて消す", "店・数字・圃場・武将・施策・諸家・書状・奉行・年表をすべて消して、空の状態から始めます。元に戻せません。よろしいですか。", "すべて消す", function () {
        ui.sel = ""; ui.chMonth = null; ui.hyMonth = null; ui.draft = null;
        commit(K.emptyState(K.ymOf()), "すべて消しました");
      });
    });
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type + ";charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function pickFile(accept, cb) {
    var inp = $("#file-in");
    inp.value = ""; inp.accept = accept;
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      if (f.size > 5 * 1024 * 1024) { alertDlg("ファイルが大きすぎます", "5MB までのファイルにしてください。"); return; }
      var rd = new FileReader();
      rd.onload = function () { cb(String(rd.result || "")); };
      rd.onerror = function () { alertDlg("読み込めませんでした", "ファイルを開けませんでした。"); };
      rd.readAsText(f, "utf-8");
    };
    inp.click();
  }

  // ---------- 画面：年表 ----------
  function viewNenpyo() {
    var list = state.chronicle.slice().reverse();
    var nClose = list.filter(function (e) { return e.kind !== "event"; }).length, nEv = list.length - nClose;
    return screenHead("年表", "月次締め " + nClose + "件・国取り " + nEv + "件") +
      '<section class="panel">' +
      (list.length ? '<table class="rtable chron"><thead><tr><th scope="col">月</th><th scope="col">' + term("商い高", "売上") + '</th><th scope="col">営業利益</th><th scope="col">達成率</th><th scope="col">一言・出来事</th></tr></thead><tbody>' +
        list.map(function (e) {
          var l = ml(e.ym);
          var head = '<th scope="row"><b>' + l.wareki + " " + l.wafu + '</b><small class="sub">' + l.seireki + (e.date ? "・" + esc(e.date.slice(5).replace("-", "/")) : "") + "</small></th>";
          if (e.kind === "event") return '<tr class="ev">' + head + '<td data-label="出来事" colspan="4" class="ev-t"><span><span class="evtag">国取り</span>' + esc(e.text) + "</span></td></tr>";
          return "<tr>" + head + '<td data-label="商い高（売上）">' + yen(e.sales) + '</td><td data-label="営業利益" class="' + (e.op >= 0 ? "" : "down") + '">' + yen(e.op) + '</td><td data-label="達成率">' + gauge(e.rate) + '</td><td data-label="一言">' + esc(e.note || "—") + "</td></tr>";
        }).join("") + "</tbody></table>" : '<p class="empty">まだ記録がありません。月末に「次の月へ」で締めると、ここに残ります。圃場を獲得・自領にしたときも記録されます。</p>') +
      "</section>";
  }

  // ---------- 次の月へ ----------
  function nextMonth() {
    closeMore();
    var ym = state.current, l = ml(ym), co = K.companyPL(state, ym), nx = ml(K.monthAdd(ym, 1));
    var adv = K.advise(state, ym, today());
    var suggest = !co.hasData ? "" : co.rate !== null && co.rate >= 1 ? "商い目標を達成。よい月だった。" : adv[0] ? adv[0].title + "。" : "";
    dialog({
      title: "次の月へ（月次締め）",
      body: "<p>" + l.wareki + " " + l.wafu + "（" + l.seireki + "）を締めて、年表に記録し、" + nx.wafu + "（" + nx.seireki + "）へ進みます。</p>" +
        '<dl class="kv"><div><dt>' + term("商い高", "売上") + "</dt><dd>" + yen(co.sales) + "</dd></div><div><dt>営業利益</dt><dd>" + yen(co.op) + "</dd></div><div><dt>達成率</dt><dd>" + gauge(co.rate) + "</dd></div></dl>" +
        (!co.hasData ? '<p class="warn-t">今月の帳簿がまだ空です。このまま締めても大丈夫ですが、あとから「帳簿」で直せます。</p>' : "") +
        '<label class="f"><span>この月の一言（年表に残ります）</span><textarea name="note" rows="2" maxlength="200">' + esc(suggest) + "</textarea></label>" +
        '<p class="note">翌月は目標・在庫・リピート率・手元資金を引き継ぎ、売上・原価・販管費は0から入力します。</p>',
      ok: "締めて次の月へ",
      onOk: function (f) {
        var s = K.closeMonth(state, String(new FormData(f).get("note") || "").trim());
        ui.chMonth = null; ui.hyMonth = null;
        commit(s, ml(s.current).wareki + " " + ml(s.current).wafu + "（" + ml(s.current).short + "）に進みました");
      }
    });
  }

  // ---------- ダイアログ ----------
  var lastFocus = null;
  function dialog(o) {
    var dlg = $("#dlg");
    lastFocus = document.activeElement;
    dlg.innerHTML = '<form class="dlg-form" novalidate><h2 id="dlg-title">' + esc(o.title) + '</h2><div class="dlg-body">' + o.body + '</div><p class="dlg-err" role="alert"></p>' +
      '<div class="dlg-btns">' + (o.cancel === false ? "" : '<button type="button" class="btn ghost" data-x>' + esc(o.cancel || "やめる") + "</button>") +
      '<button type="submit" class="btn ' + (o.danger ? "danger" : "primary") + '">' + esc(o.ok || "決定") + "</button></div></form>";
    var form = $("form", dlg);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        var bad = $(":invalid", form);
        $(".dlg-err", dlg).textContent = (bad && bad.validationMessage) || "入力を確かめてください";
        if (bad) bad.focus();
        return;
      }
      var r = o.onOk ? o.onOk(form) : undefined;
      if (typeof r === "string") { $(".dlg-err", dlg).textContent = r; return; }
      closeDlg();
    });
    var x = $("[data-x]", dlg);
    if (x) x.addEventListener("click", function () { closeDlg(); });
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    var first = $("input:not([readonly]), select, textarea:not([readonly])", form) || $('button[type="submit"]', form);
    if (first) first.focus();
  }
  function closeDlg() {
    var dlg = $("#dlg");
    if (dlg.open) { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); }
  }
  function confirmDlg(title, text, ok, fn) {
    dialog({ title: title, body: "<p>" + esc(text) + "</p>", ok: ok, danger: true, onOk: function () { fn(); } });
  }
  function alertDlg(title, text) {
    dialog({ title: title, body: '<p class="pre">' + esc(text) + "</p>", ok: "閉じる", cancel: false });
  }

  // ---------- 「その他」メニュー（スマホ） ----------
  function closeMore() {
    var b = $("#cmd-more"), p = $("#more-panel");
    if (!b || !p || b.getAttribute("aria-expanded") !== "true") return;
    b.setAttribute("aria-expanded", "false"); p.classList.remove("open");
  }
  function bindMore() {
    var b = $("#cmd-more"), p = $("#more-panel");
    b.addEventListener("click", function () {
      var open = b.getAttribute("aria-expanded") !== "true";
      b.setAttribute("aria-expanded", String(open)); p.classList.toggle("open", open);
      if (open) { var f = $("a, button", p); if (f) f.focus(); }
    });
    p.addEventListener("click", function (e) { if (e.target.closest("a")) closeMore(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && b.getAttribute("aria-expanded") === "true") { closeMore(); b.focus(); } });
    document.addEventListener("click", function (e) { if (!e.target.closest(".commands")) closeMore(); });
  }

  // ---------- ルーティング ----------
  function route() {
    var h = (location.hash || "").replace(/^#\/?/, "");
    var q = h.indexOf("?"), query = q >= 0 ? h.slice(q + 1) : "";
    if (q >= 0) h = h.slice(0, q);
    var parts = h.split("/");
    var name = parts[0] || ui.world;
    if (name === "map") name = ui.world;
    if (name === "castle") name = "shop"; // 第1版のリンク
    return { name: name, arg: decodeURIComponent(parts[1] || ""), query: query };
  }
  var VIEWS = {
    kuni: { view: function () { return viewWorld("kuni"); }, bind: bindWorld, title: "国取り", nav: "kuni" },
    akinai: { view: function () { return viewWorld("akinai"); }, bind: bindWorld, title: "商い", nav: "akinai" },
    shop: { view: function (r) { return viewShop(r.arg); }, title: "店の詳細", nav: "akinai" },
    hyojo: { view: viewHyojo, bind: function (root) { bindMonthNav(root, K.monthsSorted(state), function (m) { ui.hyMonth = m; }); }, title: "評定", nav: "hyojo" },
    gaiko: { view: viewGaiko, bind: bindGaiko, title: "外交", nav: "gaiko" },
    bugyo: { view: viewBugyo, bind: bindBugyo, title: "奉行所", nav: "bugyo" },
    bushou: { view: viewBushou, bind: bindBushou, title: "武将", nav: "bushou" },
    naisei: { view: viewNaisei, bind: bindNaisei, title: "内政", nav: "naisei" },
    chobo: { view: viewChobo, bind: function (root) { bindMonthNav(root, K.monthsSorted(state), function (m) { ui.chMonth = m; }); bindChobo(root); }, title: "帳簿", nav: "chobo" },
    nenpyo: { view: viewNenpyo, title: "年表", nav: "nenpyo" }
  };
  var lastRoute = "";
  function renderView() {
    var r = route(), key = VIEWS[r.name] ? r.name : "akinai", v = VIEWS[key];
    if (key !== lastRoute && (key === "kuni" || key === "akinai") && lastRoute !== "" && !(lastRoute === "shop" && key === "akinai")) ui.sel = "";
    lastRoute = key;
    var main = $("#main");
    main.className = "view-" + key;
    main.innerHTML = v.view(r);
    if (v.bind) v.bind(main, r);
    document.title = v.title + "｜経営評定";
    $$(".commands [data-route]").forEach(function (a) {
      if (a.dataset.route === v.nav) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    var more = $("#cmd-more");
    if (more) more.classList.toggle("has-current", !!$("#more-panel [aria-current]"));
  }
  function render() { renderStatus(); renderView(); }
  function focusView() {
    var r = route();
    if (r.name === "hyojo" && r.query === "advice") {
      var a = $("#advice"); if (a) { a.setAttribute("tabindex", "-1"); a.focus(); a.scrollIntoView({ block: "start" }); return; }
    }
    if (r.name === "chobo" && r.query === "fields") {
      var fsec = $("#fields-sec"); if (fsec) { fsec.focus(); fsec.scrollIntoView({ block: "start" }); return; }
    }
    var h = $("#main h1[tabindex]");
    (h || $("#main")).focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  function onRoute() {
    closeMore();
    if (!ui.booted || reduceMotion()) { render(); if (ui.booted) focusView(); ui.booted = true; return; }
    var fus = $("#fusuma");
    fus.classList.add("shut");
    setTimeout(function () { render(); focusView(); fus.classList.remove("shut"); }, 170);
  }

  // ---------- 起動 ----------
  state = load();
  save();
  $("#cmd-next").addEventListener("click", nextMonth);
  bindMore();
  window.addEventListener("hashchange", onRoute);
  if (mqTall.addEventListener) mqTall.addEventListener("change", function () { var n = route().name; if (n === "kuni" || n === "akinai") renderView(); });
  $("#dlg").addEventListener("close", function () {
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    else { var h = $("#main h1[tabindex]"); (h || $("#main")).focus(); }
  });
  onRoute();
})();
