// 経営評定：画面（大地図・城・評定・武将・内政・帳簿・年表）。計算は logic.js（window.KEIEI）。
(function () {
  "use strict";
  var K = window.KEIEI, SAMPLE = window.KEIEI_SAMPLE;
  var KEY = "keiei:v1";
  var state;
  var ui = { sel: "", chMonth: null, hyMonth: null, booted: false };

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var yen = K.fmtYen, man = K.fmtMan, pct = K.fmtPct;
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

  // ---------- 小物 ----------
  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2800);
  }
  function castleName(id) { var c = state.castles.filter(function (x) { return x.id === id; })[0]; return c ? c.name : ""; }
  function generalName(id) { var g = state.generals.filter(function (x) { return x.id === id; })[0]; return g ? g.name : ""; }
  function fieldOf(id) { return (state.fields || []).filter(function (x) { return x.id === id; })[0]; }
  function kokuLabel(a) { return K.fmtKoku(K.kokuOf(state, a)) + '<small class="sub">（' + K.fmtArea(a) + "）</small>"; }
  function lordsOf(cid) { return state.generals.filter(function (g) { return g.castle === cid; }); }
  function kindOf(key) { return K.KINDS.filter(function (k) { return k.key === key; })[0] || K.KINDS[0]; }
  function statusName(key) { var s = K.STATUSES.filter(function (x) { return x.key === key; })[0]; return s ? s.name : ""; }
  function ml(ym) { return K.monthLabel(ym); }
  function term(main, sub) { return esc(main) + '<small class="sub">（' + esc(sub) + "）</small>"; }
  function gauge(rate, label) {
    var w = rate === null ? 0 : Math.max(0, Math.min(1, rate)) * 100;
    var st = K.castleStatus(rate, rate === null ? 0 : 1).key;
    return '<span class="gauge g-' + st + '" role="img" aria-label="' + esc(label || "達成率") + " " + pct(rate) + '"><i style="width:' + w.toFixed(1) + '%"></i><b>' + pct(rate) + "</b></span>";
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
      '<path d="M40 14 Q50 2 62 10 L60 30 L40 30 Z" class="sil"/>' +            // 頭巾
      '<circle cx="50" cy="38" r="12" class="sil"/>' +                         // 顔
      '<path d="M14 112 Q16 66 50 56 Q84 66 86 112 Z" class="sil"/>' +          // 着物
      '<path d="M50 58 L40 84 M50 58 L60 84" class="line"/>' +                  // 襟
      '<path d="M62 76 L88 52 L94 62 Z" class="fan"/>' +                        // 扇
      '<path d="M62 76 L88 52 M62 76 L91 57 M62 76 L94 62" class="line"/>' +
      "</svg>";
  }
  function castleIcon(st) {
    return '<g class="ico ico-' + st + '">' +
      '<path d="M-30 24 L-23 6 L23 6 L30 24 Z" class="wall"/>' +
      '<path d="M-26 25 H26 M-24 15 H24" class="joint"/>' +
      '<rect x="-17" y="-8" width="34" height="14" class="keep"/>' +
      '<path d="M-29 -4 L-20 -15 L20 -15 L29 -4 Q0 -9 -29 -4 Z" class="roof"/>' +
      '<rect x="-11" y="-26" width="22" height="11" class="keep"/>' +
      '<path d="M-20 -22 L-13 -31 L13 -31 L20 -22 Q0 -26 -20 -22 Z" class="roof"/>' +
      '<path d="M-7 -31 L0 -40 L7 -31 Z" class="roof"/>' +
      '<line x1="27" y1="10" x2="27" y2="-52" class="pole"/>' +
      '<path d="M27 -52 H41 V-22 H27 Z" class="flag"/>' +
      '<circle cx="34" cy="-42" r="3.5" class="flagmon"/>' +
      "</g>";
  }

  // ---------- 地図の形（抽象的な島をボロノイ風に区切る） ----------
  var SLOTS = [[-0.58, -0.32], [0.02, -0.52], [0.56, -0.28], [-0.48, 0.42], [0.08, 0.2], [0.62, 0.45],
    [-0.22, -0.02], [0.34, -0.04], [-0.12, 0.66], [0.38, 0.72], [-0.84, 0.04], [0.86, 0.06]];
  // スマホ（縦長の地図）での城の位置：左右に互い違いに並べる（x は rx、y は ry に対する比）
  var TSLOTS = [[-0.43, -0.66], [0.43, -0.38], [-0.43, -0.1], [0.43, 0.18], [-0.42, 0.46], [0.4, 0.7],
    [0.02, -0.86], [0.0, 0.04], [0.0, 0.88], [-0.6, 0.86], [0.6, -0.86], [0.66, 0.46]];
  // 圃場（領地）の置き場所。城の名札とぶつからない位置を選んである
  var FSLOTS = [[-0.27, -0.44], [0.3, -0.5], [0.34, 0.08], [-0.84, -0.02], [-0.17, 0.58], [0.86, -0.1],
    [-0.24, 0.1], [0.36, 0.66], [-0.66, 0.78], [-0.78, -0.56], [0.74, -0.66], [0.9, 0.5]];
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
    var fsite = function (slot) {
      var s = FSLOTS[slot] || [0, 0];
      return tall ? [cx + s[1] * rx * 0.72, cy + s[0] * ry * 0.86] : [cx + s[0] * rx * 0.9, cy + s[1] * ry * 0.86];
    };
    return { W: W, H: H, cx: cx, cy: cy, rx: rx, ry: ry, island: pts, site: site, fsite: fsite };
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
  function centroid(poly) {
    var x = 0, y = 0;
    poly.forEach(function (p) { x += p[0]; y += p[1]; });
    return poly.length ? [x / poly.length, y / poly.length] : [0, 0];
  }

  function inPoly(pt, poly) {
    var x = pt[0], y = pt[1], inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function rectGap(a, b) { // 2つの矩形のすき間（重なっていれば負）
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

  function mapSVG(tall) {
    var g = geometry(tall), ym = state.current;
    var sites = state.castles.map(function (c) { return { c: c, p: g.site(c.slot) }; });
    var cells = sites.map(function (s) {
      var poly = g.island;
      sites.forEach(function (o) { if (o !== s) poly = clipHalf(poly, s.p, o.p); });
      return poly;
    });
    var island = pathOf(g.island);
    // 配置：城（名札・旗まで）と題箋・方位をよけて、圃場と山を置く
    var CW = tall ? 21 : 23;
    var obstacles = sites.map(function (s) {
      var hw = Math.max(52, (mapLabel(s.c.name, tall).length * CW + 20) / 2);
      return [s.p[0] - hw, s.p[1] - 58, s.p[0] + hw, s.p[1] + 98];
    });
    obstacles.push([10, 10, 22 + (tall ? 186 : 196) + 8, 86], [g.W - 108, 14, g.W - 18, 104]);
    var fields = state.fields || [];
    var maxA = Math.max.apply(null, fields.map(function (f) { return f.area; }).concat([1]));
    var fplace = fields.map(function (f) {
      var k = 0.75 + 0.5 * Math.sqrt(f.area / maxA), w = (tall ? 54 : 62) * k, h = (tall ? 36 : 40) * k;
      var nm = mapLabel(f.name, true), lw = Math.max(nm.length * 19 + 16, 70);
      var hx = Math.max(w / 2 + 6, lw / 2);
      var rel = [-hx, -h / 2 - 7, hx, h / 2 + 60];
      var pos = placeFree(g, rel, [[0, 0], [-w / 2, 0], [w / 2, 0]], g.fsite(f.slot), obstacles, 8);
      obstacles.push([pos[0] + rel[0], pos[1] + rel[1], pos[0] + rel[2], pos[1] + rel[3]]);
      return { f: f, p: pos, w: w, h: h, nm: nm, lw: lw };
    });
    var mtns = sites.slice(0, 6).map(function (s, i) {
      var pos = placeFree(g, [-18, -20, 34, 4], [[-14, 0], [30, 0]], [s.p[0] + (i % 2 ? 80 : -80), s.p[1] + (i % 3 ? -70 : 60)], obstacles, 14);
      obstacles.push([pos[0] - 18, pos[1] - 20, pos[0] + 34, pos[1] + 4]);
      return pos;
    });
    var svg = '<svg class="map' + (tall ? " tall" : "") + '" viewBox="0 0 ' + g.W + " " + g.H + '" role="group" aria-label="領国図。城（事業）を選ぶと詳しい数字が出ます">' +
      "<defs>" +
      '<pattern id="wave" width="44" height="22" patternUnits="userSpaceOnUse"><path d="M0 22 A22 22 0 0 1 44 22 M11 22 A11 11 0 0 1 33 22" class="wave"/></pattern>' +
      '<clipPath id="isl"><path d="' + island + '"/></clipPath>' +
      "</defs>" +
      '<rect width="' + g.W + '" height="' + g.H + '" class="sea"/><rect width="' + g.W + '" height="' + g.H + '" fill="url(#wave)"/>' +
      // 金雲
      '<path class="cloud" d="M-10 ' + (g.H * 0.16) + " q40 -34 90 -12 q30 -30 80 -6 q36 -18 64 10 q-30 22 -70 10 q-40 22 -84 4 q-40 18 -80 4 Z\"/>" +
      '<path class="cloud" d="M' + (g.W + 10) + " " + (g.H * 0.88) + " q-40 -30 -88 -10 q-34 -28 -82 -4 q-34 -14 -60 12 q32 22 70 8 q42 22 86 2 q38 16 74 2 Z\"/>" +
      // 島の影と本体
      '<path d="' + island + '" class="island-shadow" transform="translate(6 8)"/>' +
      '<path d="' + island + '" class="island"/>' +
      '<g clip-path="url(#isl)">';
    cells.forEach(function (poly, i) {
      var p = K.castlePL(state, ym, sites[i].c.id), st = K.castleStatus(p.rate, p.target).key;
      svg += '<path d="' + pathOf(poly) + '" class="cell cell-' + st + (ui.sel === sites[i].c.id ? " cell-sel" : "") + '"/>';
    });
    // 山と川（飾り）
    var mt = function (x, y, s) { return '<path class="mtn" d="M' + (x - 14 * s) + " " + y + " L" + x + " " + (y - 16 * s) + " L" + (x + 14 * s) + " " + y + " M" + (x + 6 * s) + " " + y + " L" + (x + 18 * s) + " " + (y - 10 * s) + " L" + (x + 30 * s) + " " + y + '"/>'; };
    svg += '<path class="river" d="M' + (g.cx - g.rx * 0.15) + " " + (g.cy - g.ry * 1.1) + " C" + (g.cx + g.rx * 0.05) + " " + (g.cy - g.ry * 0.4) + " " + (g.cx - g.rx * 0.32) + " " + (g.cy + g.ry * 0.1) + " " + (g.cx - g.rx * 0.05) + " " + (g.cy + g.ry * 1.2) + '"/>';
    mtns.forEach(function (m) { svg += mt(m[0], m[1], 1); });
    cells.forEach(function (poly) { svg += '<path d="' + pathOf(poly) + '" class="border"/>'; });
    svg += "</g>";
    svg += '<path d="' + island + '" class="coast"/>';
    // 圃場（領地）：茶畑の畝を描いた区画。城とは形も色も変える
    fplace.forEach(function (fp) {
      var f = fp.f, p = fp.p, w = fp.w, h = fp.h, nm = fp.nm, lw = fp.lw;
      var sel = ui.sel === f.id;
      var rows = "";
      for (var r = 1; r <= 4; r++) { var yy = -h / 2 + h * r / 5; rows += '<path d="M' + (-w / 2 + 6) + " " + yy.toFixed(1) + " Q0 " + (yy - 5).toFixed(1) + " " + (w / 2 - 6) + " " + yy.toFixed(1) + '" class="furrow"/>'; }
      svg += '<g class="field' + (sel ? " is-sel" : "") + '" data-id="' + esc(f.id) + '" transform="translate(' + p[0].toFixed(1) + " " + p[1].toFixed(1) + ')" tabindex="0" role="button" aria-pressed="' + sel + '" aria-label="' + esc(f.name) + "（圃場・領地）。石高" + K.fmtKoku(K.kokuOf(state, f.area)) + "、" + K.fmtArea(f.area) + (f.crop ? "、" + esc(f.crop) : "") + (f.general ? "、担当 " + esc(generalName(f.general)) : "、担当なし") + '">' +
        '<rect x="' + (-w / 2 - 8) + '" y="' + (-h / 2 - 8) + '" width="' + (w + 16) + '" height="' + (h + 66) + '" class="hit"/>' +
        '<rect x="' + (-w / 2 - 5) + '" y="' + (-h / 2 - 5) + '" width="' + (w + 10) + '" height="' + (h + 10) + '" rx="8" class="ring"/>' +
        '<path d="M' + (-w / 2) + " " + (-h / 2 + 6) + " Q" + (-w / 2) + " " + (-h / 2) + " " + (-w / 2 + 6) + " " + (-h / 2) + " L" + (w / 2 - 4) + " " + (-h / 2 + 3) + " Q" + (w / 2) + " " + (-h / 2 + 4) + " " + (w / 2) + " " + (-h / 2 + 9) + " L" + (w / 2 - 2) + " " + (h / 2 - 5) + " Q" + (w / 2 - 2) + " " + (h / 2) + " " + (w / 2 - 8) + " " + (h / 2) + " L" + (-w / 2 + 5) + " " + (h / 2 - 2) + " Q" + (-w / 2) + " " + (h / 2 - 3) + " " + (-w / 2) + " " + (h / 2 - 8) + ' Z" class="plot' + (f.general ? "" : " plot-vacant") + '"/>' + rows +
        '<g transform="translate(0 ' + (h / 2 + 20).toFixed(1) + ')"><rect x="' + (-lw / 2) + '" y="-14" width="' + lw + '" height="28" rx="14" class="flabel-bg"/><text class="flabel" y="6">' + esc(nm) + "</text></g>" +
        '<text class="fkoku" y="' + (h / 2 + 52).toFixed(1) + '">' + K.fmtKoku(K.kokuOf(state, f.area)) + "</text>" +
        "</g>";
    });
    // 城
    sites.forEach(function (s) {
      var c = s.c, p = K.castlePL(state, ym, c.id), st = K.castleStatus(p.rate, p.target);
      var nm = mapLabel(c.name, tall);
      var lw = Math.max(nm.length * CW + 20, 84);
      var sel = ui.sel === c.id;
      svg += '<g class="castle' + (sel ? " is-sel" : "") + '" data-id="' + esc(c.id) + '" transform="translate(' + s.p[0].toFixed(1) + " " + s.p[1].toFixed(1) + ')" tabindex="0" role="button" aria-pressed="' + sel + '" aria-label="' + esc(c.name) + "の城。" + st.label + "。収入（売上）" + yen(p.sales) + "、目標達成率" + pct(p.rate) + '">' +
        '<circle r="50" class="hit"/><circle r="47" class="ring"/>' + castleIcon(st.key) +
        '<g transform="translate(0 46)"><rect x="' + (-lw / 2) + '" y="-17" width="' + lw + '" height="34" rx="4" class="label-bg"/>' +
        '<text class="label" y="7">' + esc(nm) + "</text></g>" +
        '<g transform="translate(0 82)"><rect x="-40" y="-14" width="80" height="27" rx="13" class="badge badge-' + st.key + '"/><text class="badge-t" y="6">' + (p.target ? pct(p.rate) : "目標なし") + "</text></g>" +
        "</g>";
    });
    // 方位と題箋
    var cxp = g.W - 64, cyp = 64;
    svg += '<g class="compass" transform="translate(' + cxp + " " + cyp + ')"><circle r="34"/><path d="M0 -30 L7 0 L0 30 L-7 0 Z M-30 0 L0 6 L30 0 L0 -6 Z"/><text y="-40">北</text></g>';
    svg += '<g class="cartouche" transform="translate(22 22)"><rect width="' + (tall ? 186 : 196) + '" height="54" rx="3"/><rect x="5" y="5" width="' + (tall ? 176 : 186) + '" height="44" class="inner"/><text x="' + (tall ? 93 : 98) + '" y="36">' + esc(state.name || "わが国") + " 領国之図</text></g>";
    if (!state.castles.length && !fields.length) svg += '<text class="empty-t" x="' + g.cx + '" y="' + g.cy + '">「帳簿」で城（事業）や圃場を加えてください</text>';
    svg += "</svg>";
    return svg;
  }

  // ---------- 上部のステータス帯 ----------
  function renderStatus() {
    var ym = state.current, l = ml(ym), co = K.companyPL(state, ym);
    $("#status").innerHTML =
      '<a class="brand" href="#/" aria-label="大地図へ（' + esc(state.name || "経営評定") + '）">' + kamon(40) +
      '<span><b>' + esc(state.name || "わが国") + "</b><small>経営評定</small></span></a>" +
      '<div class="date"><b>' + l.wareki + " " + l.wafu + "</b><small>" + l.seireki + "</small></div>" +
      '<dl class="stats">' +
      '<div class="koku" title="' + K.fmtArea(K.totalArea(state)) + '"><dt>国力<small>総石高</small></dt><dd>' + K.fmtKoku(K.totalKoku(state)) + "</dd></div>" +
      '<div title="' + yen(co.cash) + '"><dt>金<small>手元資金</small></dt><dd>' + man(co.cash) + "</dd></div>" +
      '<div title="' + yen(co.stock) + '"><dt>兵糧<small>在庫</small></dt><dd>' + man(co.stock) + "</dd></div>" +
      '<div title="' + yen(co.sales) + '"><dt>収入<small>今月の売上</small></dt><dd>' + man(co.sales) + "</dd></div>" +
      '<div><dt>達成<small>目標達成率</small></dt><dd>' + gauge(co.rate, "目標達成率") + "</dd></div>" +
      "</dl>";
  }

  // ---------- 画面：大地図 ----------
  var mqTall = window.matchMedia ? matchMedia("(max-width: 760px)") : { matches: false };
  function viewMap() {
    var adv = K.advise(state), top = adv[0];
    return '<h1 class="sr-only">大地図</h1><div class="map-layout">' +
      '<section class="panel map-wrap" aria-label="領国図">' + mapSVG(mqTall.matches) +
      '<ul class="legend" aria-label="凡例"><li><i class="lg lg-win"></i>攻略（目標達成）</li><li><i class="lg lg-fight"></i>交戦中（80%以上）</li><li><i class="lg lg-lose"></i>苦戦（80%未満）</li><li><i class="lg lg-none"></i>目標未定</li><li><i class="lg lg-field"></i>圃場（領地）・石高＝面積</li></ul></section>' +
      '<aside class="panel castle-panel" id="castle-panel" aria-label="城の要約">' + castlePanel() + "</aside>" +
      '<section class="advisor" aria-label="軍師の進言">' + advisorWin(top, adv.length) + "</section>" +
      "</div>";
  }
  function advisorWin(top, n) {
    if (!top) return "";
    return '<div class="advisor-win">' + '<div class="portrait">' + advisorFigure() + "<span>軍師 墨斎</span></div>" +
      '<div class="msg"><p class="who">軍師の進言<small>（数字から自動で出す注意・助言）</small></p>' +
      '<p><span class="lv lv' + top.lv + '">' + top.lvName + "</span></p>" +
      "<h2>" + esc(top.title) + "</h2><p>" + esc(top.text) + "</p>" +
      '<a class="btn" href="#/hyojo?advice">評定で進言をすべて見る（' + n + "件）</a></div></div>";
  }
  function castlePanel() {
    var ym = state.current;
    var fsel = fieldOf(ui.sel);
    if (fsel) return fieldPanel(fsel);
    if (!state.castles.length && !(state.fields || []).length) return '<h2 class="ph">城の一覧</h2><p class="empty">まだ城（事業）も圃場もありません。<a href="#/chobo">帳簿</a>で加えてください。</p>';
    var c = state.castles.filter(function (x) { return x.id === ui.sel; })[0];
    if (!c) {
      var co = K.companyPL(state, ym);
      return '<h2 class="ph"><span class="vt">全軍</span><small>全体の様子</small></h2>' +
        '<dl class="kv"><div><dt>' + term("収入", "売上") + "</dt><dd>" + yen(co.sales) + "</dd></div>" +
        "<div><dt>" + term("目標", "売上目標") + "</dt><dd>" + yen(co.target) + "</dd></div>" +
        "<div><dt>" + term("攻略ゲージ", "達成率") + "</dt><dd>" + gauge(co.rate) + "</dd></div>" +
        "<div><dt>" + term("営業利益", "粗利−販管費") + "</dt><dd>" + yen(co.op) + "</dd></div></dl>" +
        '<p class="hint">地図の城（事業）や圃場（領地）を押すか、下の一覧から選んでください。</p>' +
        '<ul class="castle-list">' + state.castles.map(function (x) {
          var p = K.castlePL(state, ym, x.id), st = K.castleStatus(p.rate, p.target);
          return '<li><button type="button" class="castle-btn" data-pick="' + esc(x.id) + '"><i class="dot dot-' + st.key + '" aria-hidden="true"></i><span class="nm">' + esc(x.name) + '</span><span class="st">' + st.label + " " + (p.target ? pct(p.rate) : "") + "</span></button></li>";
        }).join("") + "</ul>" +
        ((state.fields || []).length ? '<h3 class="ph3">' + term("領地", "圃場") + " 国力 " + K.fmtKoku(K.totalKoku(state)) + "</h3>" +
        '<ul class="castle-list">' + state.fields.map(function (f) {
          return '<li><button type="button" class="castle-btn" data-pick="' + esc(f.id) + '"><i class="dot dot-field" aria-hidden="true"></i><span class="nm">' + esc(f.name) + '</span><span class="st">' + K.fmtKoku(K.kokuOf(state, f.area)) + (f.general ? "" : "・担当なし") + "</span></button></li>";
        }).join("") + "</ul>" : "");
    }
    var p = K.castlePL(state, ym, c.id), st = K.castleStatus(p.rate, p.target);
    var lords = lordsOf(c.id);
    var ms = state.measures.filter(function (m) { return m.castle === c.id && m.status !== "done"; });
    return '<div class="cp-head"><h2 class="ph"><span class="vt">' + esc(c.name) + '</span></h2><span class="flagtag ft-' + st.key + '">' + st.label + "</span></div>" +
      '<div class="cp-gauge"><span class="gl">' + term("攻略ゲージ", "目標達成率") + "</span>" + gauge(p.rate) + "</div>" +
      '<dl class="kv">' +
      "<div><dt>" + term("収入", "売上") + "</dt><dd>" + yen(p.sales) + "</dd></div>" +
      "<div><dt>" + term("目標", "売上目標") + "</dt><dd>" + yen(p.target) + "</dd></div>" +
      "<div><dt>" + term("粗利", "売上−原価") + "</dt><dd>" + yen(p.gross) + ' <small class="sub">' + pct(p.margin) + "</small></dd></div>" +
      "<div><dt>" + term("民忠", "リピート率") + "</dt><dd>" + (p.repeat === null ? "—" : p.repeat + "%") + "</dd></div>" +
      "<div><dt>" + term("兵糧", "在庫") + "</dt><dd>" + yen(p.stock) + "</dd></div>" +
      "<div><dt>" + term("城主", "担当") + "</dt><dd>" + (lords.length ? lords.map(function (g) { return esc(g.name); }).join("、") : '<span class="warn-t">不在</span>') + "</dd></div>" +
      "<div><dt>" + term("内政", "進行中の施策") + "</dt><dd>" + ms.length + "件</dd></div>" +
      "</dl>" +
      '<div class="btn-row"><a class="btn primary" href="#/castle/' + encodeURIComponent(c.id) + '">城の詳細を見る</a><button type="button" class="btn ghost" data-pick="">全軍の一覧へ</button></div>';
  }
  function fieldPanel(f) {
    return '<div class="cp-head"><h2 class="ph"><span class="vt">' + esc(f.name) + '</span></h2><span class="flagtag ft-field">圃場（領地）</span></div>' +
      '<dl class="kv">' +
      "<div><dt>" + term("石高", "圃場面積") + "</dt><dd>" + kokuLabel(f.area) + "</dd></div>" +
      "<div><dt>" + term("作物", "品種") + "</dt><dd>" + (esc(f.crop) || "—") + "</dd></div>" +
      "<div><dt>" + term("代官", "担当武将") + "</dt><dd>" + (f.general ? esc(generalName(f.general)) : '<span class="warn-t">不在</span>') + "</dd></div>" +
      (f.memo ? "<div><dt>メモ</dt><dd>" + esc(f.memo) + "</dd></div>" : "") +
      "</dl>" +
      '<p class="note">全領地 ' + K.fmtKoku(K.totalKoku(state)) + " のうち " + pct(K.totalKoku(state) ? K.kokuOf(state, f.area) / K.totalKoku(state) : null) + "。</p>" +
      '<div class="btn-row"><a class="btn primary" href="#/chobo?fields">帳簿で圃場を直す</a><button type="button" class="btn ghost" data-pick="">全軍の一覧へ</button></div>';
  }
  function bindMap(root) {
    var pick = function (id) {
      ui.sel = ui.sel === id ? "" : id;
      var svgWrap = $(".map-wrap", root);
      $(".map", svgWrap).outerHTML = mapSVG(mqTall.matches);
      $("#castle-panel").innerHTML = castlePanel();
      bindMapInner(root);
      var g = ui.sel && $('[data-id="' + cssEsc(ui.sel) + '"]', root);
      if (g && document.activeElement === document.body) g.focus();
    };
    root._pick = pick;
    bindMapInner(root);
  }
  function bindMapInner(root) {
    $$(".map [data-id]", root).forEach(function (g) {
      var act = function () { var id = g.dataset.id; root._pick(id); var n = $('.map [data-id="' + cssEsc(id) + '"]', root); if (n) n.focus(); };
      g.addEventListener("click", act);
      g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } });
    });
    $$("[data-pick]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.dataset.pick;
        ui.sel = "";
        root._pick(id);
        var target = id ? $("#castle-panel .btn.primary") || $("#castle-panel [data-pick]") : $('#castle-panel [data-pick]');
        if (target) target.focus();
      });
    });
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'); }

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
      var x = L + i * bw, st = K.castleStatus(r.rate, r.target).key;
      var h = H - B - y(r.sales);
      s += '<rect x="' + (x + bw * 0.18).toFixed(1) + '" y="' + y(r.sales).toFixed(1) + '" width="' + (bw * 0.64).toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" class="cbar bar-' + st + '"/>';
      s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 10) + '" class="ax">' + (+r.ym.slice(5)) + "</text>";
    });
    var pts = rows.map(function (r, i) { return (L + i * bw + bw / 2).toFixed(1) + "," + y(r.target).toFixed(1); });
    s += '<polyline points="' + pts.join(" ") + '" class="tline"/>';
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

  // ---------- 画面：城の詳細 ----------
  function viewCastle(id) {
    var c = state.castles.filter(function (x) { return x.id === id; })[0];
    if (!c) return screenHead("城", "見つかりません") + '<section class="panel"><p class="empty">この城は見つかりません。<a href="#/">大地図へ戻る</a></p></section>';
    ui.sel = c.id;
    var ym = state.current, p = K.castlePL(state, ym, c.id), st = K.castleStatus(p.rate, p.target);
    var rows = K.series(state, c.id, ym, 12);
    var lords = lordsOf(c.id);
    var ms = state.measures.filter(function (m) { return m.castle === c.id && m.status !== "done"; });
    return screenHead(c.name, "城の詳細・" + ml(ym).seireki) +
      '<div class="grid2">' +
      '<section class="panel"><h2 class="ph">今月の戦況<small>' + ml(ym).seireki + '</small></h2><p><span class="flagtag ft-' + st.key + '">' + st.label + "</span></p>" +
      '<div class="cp-gauge"><span class="gl">' + term("攻略ゲージ", "目標達成率") + "</span>" + gauge(p.rate) + "</div>" +
      '<dl class="kv">' +
      "<div><dt>" + term("収入", "売上") + "</dt><dd>" + yen(p.sales) + "</dd></div>" +
      "<div><dt>原価</dt><dd>" + yen(p.cost) + "</dd></div>" +
      "<div><dt>" + term("粗利", "売上−原価") + "</dt><dd>" + yen(p.gross) + ' <small class="sub">粗利率 ' + pct(p.margin, 1) + "</small></dd></div>" +
      "<div><dt>" + term("目標", "売上目標") + "</dt><dd>" + yen(p.target) + ' <small class="sub">差 ' + yen(p.diff) + "</small></dd></div>" +
      "<div><dt>" + term("民忠", "リピート率") + "</dt><dd>" + (p.repeat === null ? "—" : p.repeat + "%") + "</dd></div>" +
      "<div><dt>" + term("兵糧", "在庫") + "</dt><dd>" + yen(p.stock) + "</dd></div></dl></section>" +
      '<section class="panel"><h2 class="ph">' + term("収入の推移", "直近12か月の売上") + "</h2>" + trendChart(rows, c.name + "の直近12か月の売上と目標") +
      '<p class="chart-legend"><span><i class="lg lg-bar"></i>売上（棒の色は達成度）</span><span><i class="lg lg-line"></i>目標</span></p>' +
      '<details><summary>数字で見る</summary><table class="mini"><thead><tr><th scope="col">月</th><th scope="col">売上</th><th scope="col">目標</th><th scope="col">達成率</th></tr></thead><tbody>' +
      rows.map(function (r) { return "<tr><td>" + ml(r.ym).seireki + "</td><td>" + yen(r.sales) + "</td><td>" + yen(r.target) + "</td><td>" + pct(r.rate) + "</td></tr>"; }).join("") +
      "</tbody></table></details></section>" +
      '<section class="panel"><h2 class="ph">' + term("城主", "担当武将") + "</h2>" +
      (lords.length ? '<ul class="lords">' + lords.map(function (g) {
        return "<li><b>" + esc(g.name) + '</b> <small class="sub">' + esc(g.role) + "</small>" + abilities(g) + "</li>";
      }).join("") + "</ul>" : '<p class="empty warn-t">城主（担当）がいません。</p>') +
      '<a class="btn" href="#/bushou">武将の配置を変える</a></section>' +
      '<section class="panel"><h2 class="ph">' + term("進行中の内政", "施策") + "</h2>" +
      (ms.length ? '<ul class="measures">' + ms.map(function (m) {
        var k = kindOf(m.kind);
        return '<li><span class="kind">' + k.name + "<small>" + k.biz + "</small></span><b>" + esc(m.title) + '</b><small class="sub">' + statusName(m.status) + (m.due ? "・期限 " + m.due : "") + (m.cost ? "・" + yen(m.cost) : "") + (m.general ? "・" + esc(generalName(m.general)) : "") + "</small></li>";
      }).join("") + "</ul>" : '<p class="empty">進行中の施策はありません。</p>') +
      '<a class="btn" href="#/naisei">内政（施策）を見る</a></section>' +
      "</div>";
  }
  function abilities(g) {
    var row = function (k, a, b) { return '<div class="ab"><span class="abl">' + a + "<small>" + b + '</small></span><span class="bar"><i style="width:' + g[k] + '%"></i></span><b>' + g[k] + "</b></div>"; };
    return '<div class="abs">' + row("tou", "統率", "マネジメント") + row("bu", "武勇", "営業") + row("chi", "知略", "企画") + row("sei", "政務", "事務") + "</div>";
  }
  function screenHead(title, sub, extra) {
    return '<div class="screen-head"><h1 tabindex="-1"><span class="vt">' + esc(title) + "</span>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</h1>" +
      '<a class="btn ghost back" href="#/">◀ 大地図へ</a>' + (extra || "") + "</div>" +
      (sub ? '<p class="screen-sub" aria-hidden="true">' + esc(title) + "・" + esc(sub) + "</p>" : "");
  }

  // ---------- 画面：評定 ----------
  function viewHyojo() {
    var months = K.monthsSorted(state);
    var ym = ui.hyMonth && state.months[ui.hyMonth] ? ui.hyMonth : state.current;
    var prevYm = K.monthAdd(ym, -1);
    var co = K.companyPL(state, ym), pr = K.companyPL(state, prevYm), hasPrev = !!state.months[prevYm];
    var ba = K.budgetActual(state, ym);
    var fc = K.forecastCash(state, ym, 6);
    var adv = K.advise(state, ym);
    var line = function (label, a, b, opt) {
      var d = a - b;
      return "<tr" + (opt && opt.strong ? ' class="strong"' : "") + '><th scope="row">' + label + '</th><td data-label="今月">' + yen(a) + (opt && opt.rate !== undefined ? ' <small class="sub">' + pct(opt.rate, 1) + "</small>" : "") + '</td><td data-label="前月">' + (hasPrev ? yen(b) : "—") + '</td><td data-label="増減" class="' + (hasPrev ? (d * (opt && opt.cost ? -1 : 1) >= 0 ? "up" : "down") : "") + '">' + (hasPrev ? (d >= 0 ? "+" : "") + yen(d).replace("-¥", "-¥") : "—") + "</td></tr>";
    };
    return screenHead("評定", "月次レビュー・" + ml(ym).seireki) + monthNav(ym, months, "hy") +
      '<div class="grid2">' +
      '<section class="panel"><h2 class="ph">' + term("勘定", "月次損益") + "</h2>" +
      '<table class="rtable keep"><thead><tr><th scope="col">項目</th><th scope="col">今月</th><th scope="col">前月</th><th scope="col">増減</th></tr></thead><tbody>' +
      line(term("収入", "売上"), co.sales, pr.sales) + line("原価", co.cost, pr.cost, { cost: true }) +
      line("粗利", co.gross, pr.gross, { rate: co.margin }) + line("販管費", co.sga, pr.sga, { cost: true }) +
      line("営業利益", co.op, pr.op, { strong: true }) +
      (function () {
        var a = K.incomePerManKoku(state, ym), b = hasPrev ? K.incomePerManKoku(state, prevYm) : null;
        var d = a !== null && b !== null ? a - b : null;
        return '<tr><th scope="row">1万石あたりの収入<small class="sub">（圃場面積あたりの売上）</small></th><td data-label="今月">' + (a === null ? "—" : yen(a)) + '</td><td data-label="前月">' + (b === null ? "—" : yen(b)) + '</td><td data-label="増減" class="' + (d === null ? "" : d >= 0 ? "up" : "down") + '">' + (d === null ? "—" : (d >= 0 ? "+" : "") + yen(d)) + "</td></tr>";
      })() +
      "</tbody></table>" +
      '<p class="note">国力（総石高） ' + K.fmtKoku(K.totalKoku(state)) + "（" + K.fmtArea(K.totalArea(state)) + "）。圃場は今の登録内容で計算します。</p></section>" +
      '<section class="panel"><h2 class="ph">' + term("金の見通し", "手元資金の6か月予測") + "</h2>" + cashChart(fc, ym) +
      '<p class="note">今の手元資金 ' + yen(fc.start) + " から、直近" + (fc.basis.length || 0) + "か月の営業利益の平均（月 " + yen(fc.avgNet) + "）を足し、未完了の施策の費用を期限の月に引いた概算です。</p>" +
      '<table class="rtable keep"><thead><tr><th scope="col">月</th><th scope="col">収支</th><th scope="col">施策費用</th><th scope="col">見込み残高</th></tr></thead><tbody>' +
      fc.rows.map(function (r) {
        return '<tr><th scope="row">' + ml(r.ym).seireki + '</th><td data-label="収支">' + yen(r.net) + '</td><td data-label="施策費用">' + (r.measures ? "-" + yen(r.measures) : "—") + '</td><td data-label="見込み残高" class="' + (r.cash < 0 ? "down" : "") + '">' + yen(r.cash) + "</td></tr>";
      }).join("") + "</tbody></table></section>" +
      '<section class="panel span2"><h2 class="ph">' + term("合戦", "事業別の予算と実績") + "</h2>" +
      '<table class="rtable"><thead><tr><th scope="col">城（事業）</th><th scope="col">目標</th><th scope="col">実績</th><th scope="col">攻略ゲージ</th><th scope="col">差</th><th scope="col">粗利率</th></tr></thead><tbody>' +
      (ba.rows.length ? ba.rows.map(function (r) {
        return '<tr><th scope="row"><a href="#/castle/' + encodeURIComponent(r.id) + '">' + esc(r.name) + '</a></th><td data-label="目標">' + yen(r.target) + '</td><td data-label="実績">' + yen(r.sales) + '</td><td data-label="攻略ゲージ">' + gauge(r.rate) + '</td><td data-label="差" class="' + (r.diff >= 0 ? "up" : "down") + '">' + yen(r.diff) + '</td><td data-label="粗利率">' + pct(r.margin, 1) + "</td></tr>";
      }).join("") : '<tr><td colspan="6">城がありません</td></tr>') +
      '<tr class="strong"><th scope="row">全軍（合計）</th><td data-label="目標">' + yen(ba.total.target) + '</td><td data-label="実績">' + yen(ba.total.sales) + '</td><td data-label="攻略ゲージ">' + gauge(ba.total.rate) + '</td><td data-label="差" class="' + (ba.total.diff >= 0 ? "up" : "down") + '">' + yen(ba.total.diff) + '</td><td data-label="粗利率">' + pct(ba.total.margin, 1) + "</td></tr>" +
      "</tbody></table></section>" +
      '<section class="panel span2" id="advice"><h2 class="ph">' + term("軍師の進言", "注意・助言 " + adv.length + "件") + "</h2>" +
      '<ol class="advice">' + adv.map(function (a) {
        return '<li class="adv adv-' + a.lv + '"><span class="lv lv' + a.lv + '">' + a.lvName + "</span><div><b>" + esc(a.title) + "</b><p>" + esc(a.text) + "</p>" +
          (a.castle ? '<a href="#/castle/' + encodeURIComponent(a.castle) + '">' + esc(castleName(a.castle)) + "の城を見る</a>" : "") + "</div></li>";
      }).join("") + "</ol></section>" +
      "</div>";
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
      (state.generals.length ? '<table class="rtable"><thead><tr><th scope="col">武将</th><th scope="col">' + term("知行", "担当圃場の石高") + '</th><th scope="col">' + term("統率", "マネジメント") + '</th><th scope="col">' + term("武勇", "営業") + '</th><th scope="col">' + term("知略", "企画") + '</th><th scope="col">' + term("政務", "事務") + '</th><th scope="col">担当の城</th><th scope="col">操作</th></tr></thead><tbody>' +
        state.generals.map(function (g) {
          var gf = K.generalFields(state, g.id);
          return '<tr><th scope="row"><b>' + esc(g.name) + '</b><small class="sub">' + esc(g.role) + "</small></th>" +
            '<td data-label="知行（担当圃場の石高）"><span><b>知行 ' + K.fmtKoku(K.generalKoku(state, g.id)) + "</b>" + (gf.length ? '<small class="sub fl">' + gf.map(function (f) { return esc(f.name); }).join("・") + "</small>" : '<small class="sub fl">圃場なし</small>') + "</span></td>" +
            '<td data-label="統率（マネジメント）">' + bar(g, "tou") + '</td><td data-label="武勇（営業）">' + bar(g, "bu") + '</td><td data-label="知略（企画）">' + bar(g, "chi") + '</td><td data-label="政務（事務）">' + bar(g, "sei") + "</td>" +
            '<td data-label="担当の城"><label class="sr-only" for="as-' + esc(g.id) + '">' + esc(g.name) + 'の担当の城</label><select id="as-' + esc(g.id) + '" data-assign="' + esc(g.id) + '">' + castleOptions(g.castle, "（担当なし）") + "</select></td>" +
            '<td data-label="操作" class="ops"><button type="button" class="btn ghost" data-edit-gen="' + esc(g.id) + '">編集</button><button type="button" class="btn ghost danger-t" data-del-gen="' + esc(g.id) + '">削除</button></td></tr>';
        }).join("") + "</tbody></table>" : '<p class="empty">まだ武将（メンバー）がいません。</p>') +
      "</section>";
  }
  function generalForm(g) {
    g = g || { name: "", role: "", tou: 50, bu: 50, chi: 50, sei: 50, castle: "" };
    var ab = function (k, a, b) { return '<label class="f"><span>' + a + "<small>（" + b + "）</small></span><input type=\"number\" name=\"" + k + '" min="1" max="100" step="1" required value="' + g[k] + '" inputmode="numeric"></label>'; };
    return '<label class="f"><span>名前</span><input name="name" required maxlength="40" value="' + esc(g.name) + '" autocomplete="off"></label>' +
      '<label class="f"><span>役職<small>（例：家老＝番頭、奉行＝担当者）</small></span><input name="role" maxlength="40" value="' + esc(g.role) + '" autocomplete="off"></label>' +
      '<div class="f2">' + ab("tou", "統率", "マネジメント") + ab("bu", "武勇", "営業") + ab("chi", "知略", "企画") + ab("sei", "政務", "事務") + "</div>" +
      '<label class="f"><span>担当の城</span><select name="castle">' + castleOptions(g.castle, "（担当なし）") + "</select></label>" +
      ((state.fields || []).length ? '<fieldset class="f checks"><legend>担当の圃場<small>（知行。1枚の圃場の担当は1人）</small></legend>' + state.fields.map(function (f) {
        var other = f.general && f.general !== g.id ? generalName(f.general) : "";
        return '<label class="chk"><input type="checkbox" name="fields" value="' + esc(f.id) + '"' + (g.id && f.general === g.id ? " checked" : "") + "><span>" + esc(f.name) + ' <small class="sub">' + K.fmtKoku(K.kokuOf(state, f.area)) + (other ? "・今は" + esc(other) : "") + "</small></span></label>";
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
        var g = readGeneral(f);
        if (typeof g === "string") return g;
        var s = K.clone(state); g.id = K.newId(s, "g"); applyFields(s, g); s.generals.push(g);
        commit(s, g.name + "を召し抱えました");
      } });
    });
    $$("[data-edit-gen]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var g = state.generals.filter(function (x) { return x.id === b.dataset.editGen; })[0];
        dialog({ title: "武将の編集", body: generalForm(g), ok: "保存する", onOk: function (f) {
          var n = readGeneral(f, g);
          if (typeof n === "string") return n;
          var s = K.clone(state); applyFields(s, n); s.generals = s.generals.map(function (x) { return x.id === g.id ? n : x; });
          commit(s, "記録しました");
        } });
      });
    });
    $$("[data-del-gen]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var g = state.generals.filter(function (x) { return x.id === b.dataset.delGen; })[0];
        confirmDlg("武将の削除", g.name + " を一覧から外します。担当している施策と圃場の担当も空になります。よろしいですか。", "削除する", function () {
          commit(K.removeGeneral(state, g.id), g.name + "を外しました");
        });
      });
    });
    $$("[data-assign]", root).forEach(function (sel) {
      sel.addEventListener("change", function () {
        var s = K.clone(state);
        s.generals.forEach(function (x) { if (x.id === sel.dataset.assign) x.castle = sel.value; });
        state = s; save(); renderStatus();
        toast(generalName(sel.dataset.assign) + "を" + (sel.value ? castleName(sel.value) + "の城主に任じました" : "担当なしにしました"));
      });
    });
  }

  // ---------- 画面：内政 ----------
  function viewNaisei() {
    var order = { doing: 0, todo: 1, done: 2 };
    var list = state.measures.slice().sort(function (a, b) {
      return order[a.status] - order[b.status] || (a.due || "9999") .localeCompare(b.due || "9999");
    });
    var cur = state.current;
    return screenHead("内政", "施策 " + state.measures.filter(function (m) { return m.status !== "done"; }).length + "件が進行・未着手") +
      '<section class="panel"><div class="toolbar"><button type="button" class="btn primary" id="add-ms">＋ 施策を命じる<small>（追加）</small></button></div>' +
      '<ul class="kinds" aria-label="施策の種類">' + K.KINDS.map(function (k) { return '<li><b>' + k.name + "</b><small>" + k.biz + "</small></li>"; }).join("") + "</ul>" +
      (list.length ? '<table class="rtable"><thead><tr><th scope="col">施策</th><th scope="col">種類</th><th scope="col">対象の城</th><th scope="col">担当</th><th scope="col">費用</th><th scope="col">期限</th><th scope="col">状態</th><th scope="col">操作</th></tr></thead><tbody>' +
        list.map(function (m) {
          var k = kindOf(m.kind), over = m.status !== "done" && m.due && m.due.slice(0, 7) < cur;
          return '<tr class="' + (m.status === "done" ? "is-done" : "") + '"><th scope="row">' + esc(m.title) + "</th>" +
            '<td data-label="種類"><span class="kind">' + k.name + "<small>" + k.biz + "</small></span></td>" +
            '<td data-label="対象の城">' + (m.castle ? esc(castleName(m.castle)) : "全体") + "</td>" +
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
      '<div class="f2"><label class="f"><span>対象の城</span><select name="castle">' + castleOptions(m.castle, "全体") + "</select></label>" +
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
    var find = function (id) { return state.measures.filter(function (x) { return x.id === id; })[0]; };
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
    { k: "sales", a: "収入", b: "売上", unit: "円" },
    { k: "cost", a: "原価", b: "仕入・材料など", unit: "円" },
    { k: "target", a: "目標", b: "売上目標", unit: "円" },
    { k: "stock", a: "兵糧", b: "月末の在庫金額", unit: "円" },
    { k: "repeat", a: "民忠", b: "リピート率", unit: "%" }
  ];
  function viewChobo() {
    var months = K.monthsSorted(state);
    var ym = ui.chMonth && state.months[ui.chMonth] ? ui.chMonth : state.current;
    var m = state.months[ym];
    var inp = function (name, val, label, unit, attrs) {
      return '<label class="f"><span>' + label + "</span><span class=\"inwrap\"><input type=\"number\" " + attrs + ' inputmode="decimal" name="' + name + '" value="' + (val === null || val === undefined ? "" : val) + '"><i>' + unit + "</i></span></label>";
    };
    return screenHead("帳簿", "数字の入力・" + ml(ym).seireki) + monthNav(ym, months, "ch") +
      '<p class="note lead">入力欄を離れると自動で保存されます（この端末の中だけに保存）。' + (ym !== state.current ? "<b>今月ではなく過去の月を直しています。</b>" : "") + "</p>" +
      '<form class="ledger" id="ledger" data-ym="' + ym + '" onsubmit="return false">' +
      '<fieldset class="panel ledger-card co"><legend class="ph">全社<small>（' + ml(ym).seireki + "）</small></legend><div class=\"lgrid\">" +
      inp("sga", m.sga, "販管費<small>（人件費・家賃・送料・広告など）</small>", "円", 'min="0" step="1"') +
      inp("cash", m.cash, "金<small>（月末の手元資金）</small>", "円", 'step="1"') + "</div></fieldset>" +
      state.castles.map(function (c) {
        var v = K.castleMonth(state, ym, c.id);
        return '<fieldset class="panel ledger-card"><legend class="ph">' + esc(c.name) + "</legend><div class=\"lgrid\">" +
          FIELDS.map(function (f) {
            return inp(c.id + "." + f.k, f.k === "repeat" ? v.repeat : v[f.k], esc(f.a) + (f.a !== f.b ? "<small>（" + esc(f.b) + "）</small>" : "<small>（" + esc(f.b) + "）</small>"), f.unit,
              f.k === "repeat" ? 'min="0" max="100" step="0.1"' : 'min="0" step="1"');
          }).join("") + "</div></fieldset>";
      }).join("") +
      "</form>" +
      '<div class="grid2">' +
      '<section class="panel"><h2 class="ph">' + term("城の普請", "事業の追加・名前の変更・削除") + "</h2>" +
      '<ul class="castle-admin">' + state.castles.map(function (c) {
        return "<li><span>" + esc(c.name) + '</span><span class="ops"><button type="button" class="btn ghost" data-ren="' + esc(c.id) + '">名前の変更</button><button type="button" class="btn ghost danger-t" data-delc="' + esc(c.id) + '">削除</button></span></li>';
      }).join("") + "</ul>" +
      (state.castles.length < K.MAX_CASTLES ? '<form class="add-castle" id="add-castle"><label class="f"><span>新しい城（事業・販路）の名前</span><input name="name" maxlength="40" required autocomplete="off" placeholder="例：百貨店催事"></label><button class="btn primary">城を築く（追加）</button></form>' : '<p class="note">城は' + K.MAX_CASTLES + "までです。</p>") +
      "</section>" +
      '<section class="panel" id="fields-sec" tabindex="-1"><h2 class="ph">' + term("領地", "圃場の追加・編集・削除") + "</h2>" +
      '<p class="note">国力（総石高） <b>' + K.fmtKoku(K.totalKoku(state)) + "</b>（" + K.fmtArea(K.totalArea(state)) + "）</p>" +
      ((state.fields || []).length ? '<ul class="castle-admin">' + state.fields.map(function (f) {
        return '<li><span>' + esc(f.name) + '<small class="sub fl">' + K.fmtKoku(K.kokuOf(state, f.area)) + "（" + K.fmtArea(f.area) + "）" + (f.crop ? "・" + esc(f.crop) : "") + "・" + (f.general ? esc(generalName(f.general)) : '<span class="warn-t">担当なし</span>') + '</small></span><span class="ops"><button type="button" class="btn ghost" data-edf="' + esc(f.id) + '">編集</button><button type="button" class="btn ghost danger-t" data-delf="' + esc(f.id) + '">削除</button></span></li>';
      }).join("") + "</ul>" : '<p class="empty">まだ圃場がありません。</p>') +
      (state.fields.length < K.MAX_FIELDS ? '<button type="button" class="btn primary" id="add-field">＋ 圃場を加える</button>' : '<p class="note">圃場は' + K.MAX_FIELDS + "枚までです。</p>") +
      '<form class="koku-set" id="koku-set"><label class="f"><span>石高の換算<small>（1aあたりの石数。既定は1,000＝1反で1万石）</small></span><span class="inwrap"><input type="number" name="rate" min="1" step="1" required inputmode="numeric" value="' + state.kokuPerA + '"><i>石/a</i></span></label>' +
      '<p class="note">今の換算：1a＝' + K.fmtKoku(K.kokuOf(state, 1)) + "、1反＝" + K.fmtKoku(K.kokuOf(state, 10)) + "、1町＝" + K.fmtKoku(K.kokuOf(state, 100)) + '</p><button class="btn">換算を変える</button></form>' +
      "</section>" +
      '<section class="panel"><h2 class="ph">' + term("文書蔵", "取り込み・書き出し・バックアップ") + "</h2>" +
      '<div class="btn-grid">' +
      '<button type="button" class="btn" id="csv-out">CSVを書き出す</button>' +
      '<button type="button" class="btn" id="csv-in">CSVを取り込む</button>' +
      '<button type="button" class="btn" id="fcsv-out">圃場のCSVを書き出す</button>' +
      '<button type="button" class="btn" id="json-out">バックアップ（JSON）</button>' +
      '<button type="button" class="btn" id="json-in">バックアップから復元</button>' +
      '<button type="button" class="btn ghost" id="reset-sample">サンプルに戻す</button>' +
      '<button type="button" class="btn ghost danger-t" id="wipe">すべて消す</button></div>' +
      '<details class="csv-help"><summary>CSVの形</summary><p>1行目の見出し：<code>' + K.CSV_COLS.join(",") + '</code></p><p>城ごとに1行（月・城・売上・原価・目標・在庫・リピート率）。販管費と手元資金は、城の欄を「' + K.COMPANY_ROW + '」にした行に書きます。空の欄は今の値のまま。知らない城の名前は新しい城として加えます。</p><p>圃場のCSVは見出しが <code>' + K.FIELD_COLS.join(",") + '</code> の別の表です（取り込みは同じボタンで、見出しを見て自動で見分けます）。面積は a の数字のほか「1町2反」のようにも書けます。担当は武将の名前で書きます。表計算ソフトで開けるよう、書き出しは UTF-8（BOM付き）です。</p></details>' +
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
        commit(s, "「" + r.castle.name + "」の城を築きました");
        var f = $("#add-castle input"); if (f) f.focus();
      } catch (err) { toast(err.message); }
    });
    $$("[data-ren]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.dataset.ren;
        dialog({ title: "城の名前の変更", body: '<label class="f"><span>新しい名前</span><input name="name" required maxlength="40" value="' + esc(castleName(id)) + '" autocomplete="off"></label>', ok: "変更する", onOk: function (f) {
          var n = String(new FormData(f).get("name") || "").trim();
          if (!n) return "名前を入れてください";
          if (state.castles.some(function (c) { return c.name === n && c.id !== id; })) return "同じ名前の城があります";
          var s = K.clone(state); s.castles.forEach(function (c) { if (c.id === id) c.name = n; });
          commit(s, "名前を「" + n + "」に変えました");
        } });
      });
    });
    $$("[data-delc]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.dataset.delc, n = castleName(id);
        confirmDlg("城の削除", "「" + n + "」の城と、すべての月の数字を消します。担当の武将と施策の対象は空になります。元に戻せません。よろしいですか。", "削除する", function () {
          if (ui.sel === id) ui.sel = "";
          commit(K.removeCastle(state, id), "「" + n + "」を削除しました");
        });
      });
    });
    var stamp = function () { return new Date().toISOString().slice(0, 10); };
    $("#csv-out", root).addEventListener("click", function () { download("keiei-" + stamp() + ".csv", "﻿" + K.toCSV(state), "text/csv"); toast("CSVを書き出しました"); });
    $("#fcsv-out", root).addEventListener("click", function () { download("keiei-fields-" + stamp() + ".csv", "\uFEFF" + K.fieldsToCSV(state), "text/csv"); toast("圃場のCSVを書き出しました"); });
    var addF = $("#add-field", root);
    if (addF) addF.addEventListener("click", function () {
      dialog({ title: "圃場を加える", body: fieldForm(), ok: "加える", onOk: function (f) {
        var n = readField(f); if (typeof n === "string") return n;
        var s = K.clone(state); n.id = K.newId(s, "f"); n.slot = K.freeSlot(s, s.fields, K.MAX_FIELDS); s.fields.push(n);
        commit(s, "圃場「" + n.name + "」を加えました（" + K.fmtKoku(K.kokuOf(s, n.area)) + "）");
      } });
    });
    $$("[data-edf]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var fl = fieldOf(b.dataset.edf);
        dialog({ title: "圃場の編集", body: fieldForm(fl), ok: "保存する", onOk: function (f) {
          var n = readField(f, fl); if (typeof n === "string") return n;
          var s = K.clone(state); s.fields = s.fields.map(function (x) { return x.id === fl.id ? n : x; });
          commit(s, "記録しました");
        } });
      });
    });
    $$("[data-delf]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var fl = fieldOf(b.dataset.delf);
        confirmDlg("圃場の削除", "圃場「" + fl.name + "」（" + K.fmtArea(fl.area) + "）を削除します。元に戻せません。よろしいですか。", "削除する", function () {
          if (ui.sel === fl.id) ui.sel = "";
          commit(K.removeField(state, fl.id), "「" + fl.name + "」を削除しました");
        });
      });
    });
    var ks = $("#koku-set", root);
    ks.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = +new FormData(ks).get("rate");
      if (!isFinite(v) || v <= 0) { toast("1以上の数字を入れてください"); return; }
      var s = K.clone(state); s.kokuPerA = v;
      commit(s, "換算を1a＝" + K.fmtKoku(v) + "にしました");
    });
    $("#json-out", root).addEventListener("click", function () { download("keiei-backup-" + stamp() + ".json", JSON.stringify(state, null, 1), "application/json"); toast("バックアップを書き出しました"); });
    $("#csv-in", root).addEventListener("click", function () {
      pickFile(".csv,text/csv", function (text) {
        var r = K.importAnyCSV(state, text);
        if (!r.imported) { alertDlg("取り込めませんでした", r.errors.slice(0, 8).join("\n") || "読める行がありません"); return; }
        var what = r.kind === "fields" ? "圃場" : "城";
        var msg = r.imported + "行を取り込みました" + (r.created.length ? "（新しい" + what + "：" + r.created.join("、") + "）" : "");
        commit(r.state, msg);
        if (r.errors.length) alertDlg(r.skipped ? "一部の行を飛ばしました" : "取り込みました（注意あり）", msg + (r.skipped ? "\n飛ばした行：" + r.skipped : "") + "\n" + r.errors.slice(0, 8).join("\n"));
      });
    });
    $("#json-in", root).addEventListener("click", function () {
      pickFile(".json,application/json", function (text) {
        var s;
        try { s = K.normalize(JSON.parse(text)); } catch (e) { alertDlg("復元できませんでした", "経営評定のバックアップ（JSON）ではないようです。"); return; }
        confirmDlg("バックアップから復元", "今の数字をすべて、このバックアップの内容に置き換えます。よろしいですか。", "復元する", function () { ui.sel = ""; ui.chMonth = null; ui.hyMonth = null; commit(s, "復元しました"); });
      });
    });
    $("#reset-sample", root).addEventListener("click", function () {
      confirmDlg("サンプルに戻す", "今の数字をすべて消して、架空の会社「悠三堂」のサンプルに戻します。先にバックアップを取ることをおすすめします。よろしいですか。", "サンプルに戻す", function () {
        ui.sel = ""; ui.chMonth = null; ui.hyMonth = null; commit(K.normalize(SAMPLE.build()), "サンプルに戻しました");
      });
    });
    $("#wipe", root).addEventListener("click", function () {
      confirmDlg("すべて消す", "城・数字・武将・施策・年表をすべて消して、空の状態から始めます。元に戻せません。よろしいですか。", "すべて消す", function () {
        ui.sel = ""; ui.chMonth = null; ui.hyMonth = null;
        var s = K.emptyState(K.ymOf()); commit(s, "すべて消しました");
      });
    });
  }
  function fieldForm(f) {
    f = f || { name: "", area: 0, crop: "", general: "", memo: "" };
    var unit = f.area && f.area % 100 === 0 ? "cho" : f.area && f.area % 10 === 0 ? "tan" : "a";
    var shown = f.area ? +(f.area / (unit === "cho" ? 100 : unit === "tan" ? 10 : 1)).toFixed(2) : "";
    return '<label class="f"><span>圃場の名前</span><input name="name" required maxlength="40" value="' + esc(f.name) + '" autocomplete="off"></label>' +
      '<div class="f2"><label class="f"><span>面積</span><input name="area" type="number" min="0" step="any" required inputmode="decimal" value="' + shown + '"></label>' +
      '<label class="f"><span>単位</span><select name="unit">' + K.AREA_UNITS.map(function (u) { return '<option value="' + u.key + '"' + (u.key === unit ? " selected" : "") + ">" + u.name + "</option>"; }).join("") + "</select></label></div>" +
      '<p class="note">石高は 1a＝' + K.fmtKoku(K.kokuOf(state, 1)) + " で換算します（帳簿の「石高の換算」で変更）。</p>" +
      '<label class="f"><span>作物・品種</span><input name="crop" maxlength="60" value="' + esc(f.crop) + '" autocomplete="off" placeholder="例：茶・やぶきた"></label>' +
      '<label class="f"><span>担当の武将</span><select name="general"><option value="">（担当なし）</option>' + state.generals.map(function (g) { return '<option value="' + esc(g.id) + '"' + (g.id === f.general ? " selected" : "") + ">" + esc(g.name) + "</option>"; }).join("") + "</select></label>" +
      '<label class="f"><span>メモ</span><textarea name="memo" rows="2" maxlength="300">' + esc(f.memo) + "</textarea></label>";
  }
  function readField(form, base) {
    var fd = new FormData(form), out = K.clone(base || {});
    out.name = String(fd.get("name") || "").trim();
    if (!out.name) return "圃場の名前を入れてください";
    if (state.fields.some(function (x) { return x.name === out.name && (!base || x.id !== base.id); })) return "同じ名前の圃場があります";
    var v = +fd.get("area");
    if (!isFinite(v) || v < 0) return "面積は0以上の数字で入れてください";
    out.area = Math.round(K.areaToA(v, String(fd.get("unit"))) * 100) / 100;
    out.crop = String(fd.get("crop") || "").trim();
    out.general = String(fd.get("general") || "");
    out.memo = String(fd.get("memo") || "").trim();
    return out;
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
    return screenHead("年表", "月次締めの履歴 " + list.length + "件") +
      '<section class="panel scroll-panel">' +
      (list.length ? '<table class="rtable chron"><thead><tr><th scope="col">月</th><th scope="col">' + term("収入", "売上") + '</th><th scope="col">営業利益</th><th scope="col">達成率</th><th scope="col">一言</th></tr></thead><tbody>' +
        list.map(function (e) {
          var l = ml(e.ym);
          return '<tr><th scope="row"><b>' + l.wareki + " " + l.wafu + '</b><small class="sub">' + l.seireki + '</small></th><td data-label="収入（売上）">' + yen(e.sales) + '</td><td data-label="営業利益" class="' + (e.op >= 0 ? "" : "down") + '">' + yen(e.op) + '</td><td data-label="達成率">' + gauge(e.rate) + '</td><td data-label="一言">' + esc(e.note || "—") + "</td></tr>";
        }).join("") + "</tbody></table>" : '<p class="empty">まだ記録がありません。月末に下の「次の月へ」で締めると、ここに残ります。</p>') +
      "</section>";
  }

  // ---------- 次の月へ ----------
  function nextMonth() {
    var ym = state.current, l = ml(ym), co = K.companyPL(state, ym), nx = ml(K.monthAdd(ym, 1));
    var adv = K.advise(state, ym);
    var suggest = !co.hasData ? "" : co.rate !== null && co.rate >= 1 ? "目標を攻略。よい月だった。" : adv[0] ? adv[0].title + "。" : "";
    dialog({
      title: "次の月へ（月次締め）",
      body: '<p>' + l.wareki + " " + l.wafu + "（" + l.seireki + "）を締めて、年表に記録し、" + nx.wafu + "（" + nx.seireki + "）へ進みます。</p>" +
        '<dl class="kv"><div><dt>' + term("収入", "売上") + "</dt><dd>" + yen(co.sales) + "</dd></div><div><dt>営業利益</dt><dd>" + yen(co.op) + "</dd></div><div><dt>達成率</dt><dd>" + gauge(co.rate) + "</dd></div></dl>" +
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
      closeDlg(o.onOk ? null : undefined);
    });
    var x = $("[data-x]", dlg);
    if (x) x.addEventListener("click", function () { closeDlg(); });
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    var first = $("input, select, textarea", form) || $('button[type="submit"]', form);
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

  // ---------- ルーティング ----------
  function route() {
    var h = (location.hash || "").replace(/^#\/?/, "");
    var q = h.indexOf("?"), query = q >= 0 ? h.slice(q + 1) : "";
    if (q >= 0) h = h.slice(0, q);
    var parts = h.split("/");
    return { name: parts[0] || "map", arg: decodeURIComponent(parts[1] || ""), query: query };
  }
  var VIEWS = {
    map: { view: viewMap, bind: bindMap, title: "大地図" },
    castle: { view: function (r) { return viewCastle(r.arg); }, title: "城の詳細" },
    hyojo: { view: viewHyojo, bind: function (root) { bindMonthNav(root, K.monthsSorted(state), function (m) { ui.hyMonth = m; }); }, title: "評定" },
    bushou: { view: viewBushou, bind: bindBushou, title: "武将" },
    naisei: { view: viewNaisei, bind: bindNaisei, title: "内政" },
    chobo: { view: viewChobo, bind: function (root) { bindMonthNav(root, K.monthsSorted(state), function (m) { ui.chMonth = m; }); bindChobo(root); }, title: "帳簿" },
    nenpyo: { view: viewNenpyo, title: "年表" }
  };
  function renderView() {
    var r = route(), v = VIEWS[r.name] || VIEWS.map;
    var main = $("#main");
    main.className = "view-" + (VIEWS[r.name] ? r.name : "map");
    main.innerHTML = v.view(r);
    if (v.bind) v.bind(main, r);
    document.title = v.title + "｜経営評定";
    $$(".commands [data-route]").forEach(function (a) {
      if (a.dataset.route === r.name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
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
    if (!ui.booted || reduceMotion()) { render(); if (ui.booted) focusView(); ui.booted = true; return; }
    var fus = $("#fusuma");
    fus.classList.add("shut");
    setTimeout(function () {
      render(); focusView();
      fus.classList.remove("shut");
    }, 170);
  }

  // ---------- 起動 ----------
  state = load();
  save();
  $("#cmd-next").addEventListener("click", nextMonth);
  window.addEventListener("hashchange", onRoute);
  if (mqTall.addEventListener) mqTall.addEventListener("change", function () { if (route().name === "map") renderView(); });
  $("#dlg").addEventListener("close", function () {
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    else { var h = $("#main h1[tabindex]"); (h || $("#main")).focus(); }
  });
  onRoute();
})();
