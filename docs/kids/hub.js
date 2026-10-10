/* まなびの いりぐち。さいしょに だれが やるかを えらび、その子の ポイント・ゲームじかん・アプリを出す。
 * 記録は points.js（KidsPoints）、アプリ一覧は apps.js */
(function () {
  "use strict";
  var KP = window.KidsPoints, APPS = window.KIDS_APPS, EXTRA = window.KIDS_APP_EXTRA;
  var $ = function (id) { return document.getElementById(id); };
  var PICKED = "kids-hub:picked";           // このタブで もう えらんだか（アプリから もどったときは 聞かない）
  var TIMER = "kids-hub:game-timer:v1";     // { kid, end, min }
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === "text") el.textContent = attrs[k];
      else if (k === "style") el.style.cssText = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function appInfo(id) {
    return APPS.filter(function (a) { return a.id === id; })[0] || EXTRA[id] ||
      (id === "spend" ? { name: "ゲーム", icon: "🎮", color: "#999" } : { name: id, icon: "⭐", color: "#999" });
  }
  function when(t) {
    var d = new Date(t), now = new Date();
    var hm = d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
    if (d.toDateString() === now.toDateString()) return "きょう " + hm;
    var y = new Date(now); y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "きのう " + hm;
    return (d.getMonth() + 1) + "/" + d.getDate();
  }
  function mmss(sec) { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }

  // 同じサイト内のアプリが まだ公開されていないときは「じゅんびちゅう」にする
  var missing = {};
  function probe() {
    APPS.forEach(function (a) {
      if (!a.url || /^https?:/.test(a.url) || !window.fetch) return;
      fetch(a.url, { method: "HEAD", cache: "no-store" }).then(function (r) {
        var was = !!missing[a.id]; missing[a.id] = r.status === 404;
        if (was !== missing[a.id]) render();
      }).catch(function () {});
    });
  }

  function picked() { return ss(PICKED) && KP.kids().some(function (k) { return k.id === ss(PICKED); }); }

  // ---------- 1. だれが やる？ ----------
  function renderPick() {
    var grid = $("pickgrid"); grid.textContent = "";
    KP.kids().forEach(function (k) {
      var b = h("button", { type: "button", class: "pickcard" }, [
        h("span", { class: "pk-ic", text: k.icon }),
        h("span", { class: "pk-nm", text: k.name }),
        h("span", { class: "pk-pt" }, [h("b", { text: String(KP.earned(k.id)) }), " ポイント（るいけい）"]),
        h("span", { class: "pk-gm", text: "🎮 ゲーム " + KP.gameMinutes(k.id) + "ぷん ぶん" }),
      ]);
      b.onclick = function () { choose(k.id); };
      grid.appendChild(b);
    });
  }
  function choose(id) { KP.setCurrent(id); ss(PICKED, id); show(); window.scrollTo(0, 0); }

  // ---------- 2. その子の ページ ----------
  function renderHome() {
    var kid = KP.current();
    $("whochip").textContent = kid.icon + " " + kid.name + " ・ きりかえ";
    var earned = KP.earned(kid.id), lv = KP.level(earned), bal = KP.balance(kid.id);
    $("who").textContent = kid.icon + " " + kid.name + " の ポイント";
    $("balance").textContent = bal;
    $("gamemin").textContent = KP.gameMinutes(kid.id);
    $("lv").textContent = "Lv." + lv.level;
    $("lvbar").style.width = Math.round(lv.ratio * 100) + "%";
    $("lvrest").textContent = "つぎまで " + lv.rest;
    $("today").textContent = KP.today(kid.id);
    $("earned").textContent = earned;
    $("streak").textContent = KP.streak(kid.id);

    renderGame(kid);

    var by = KP.byApp(kid.id), max = 1, ids = APPS.map(function (a) { return a.id; });
    Object.keys(by).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); max = Math.max(max, by[id]); });
    var box = $("apps"); box.textContent = "";
    var hasSoon = false;
    ids.forEach(function (id) {
      var a = appInfo(id), pts = by[id] || 0, url = missing[id] ? null : a.url;
      var isApp = APPS.indexOf(a) >= 0, soon = isApp && !url, showPts = a.points !== false;
      if (soon) hasSoon = true;
      var el = h(url ? "a" : "div", {
        class: "app" + (soon ? " soon" : "") + (isApp ? "" : " extra"), style: "--c:" + a.color,
        "aria-label": a.name + (soon ? "（じゅんびちゅう）" : ""),
      }, [
        h("span", { class: "ic", text: a.icon }),
        h("span", { class: "tx" }, [
          h("div", { class: "nm", text: a.name }),
          h("div", { class: "kn", text: a.kana || "" }),
          a.desc ? h("div", { class: "ds", text: a.desc }) : null,
        ]),
        showPts ? h("span", { class: "pt" }, [String(pts), h("small", { text: "ポイント" })]) : null,
        showPts ? h("span", { class: "appbar" }, [h("i", { style: "width:" + Math.round(pts / max * 100) + "%" })]) : null,
        isApp ? h("span", { class: "go", text: soon ? "じゅんびちゅう" : "ひらく ▶" }) : null,
      ]);
      if (url) { el.href = url; if (/^https?:/.test(url)) el.rel = "noopener"; }
      box.appendChild(el);
    });
    $("soonnote").hidden = !hasSoon;

    var ul = $("recent"); ul.textContent = "";
    var ev = KP.events(kid.id).slice(0, 20);
    if (!ev.length) ul.appendChild(h("li", { class: "empty", text: "まだ ありません。アプリで 1もん せいかいすると 5ポイント たまるよ！" }));
    ev.forEach(function (e) {
      var a = appInfo(e.app), minus = e.points < 0;
      ul.appendChild(h("li", {}, [
        h("span", { text: minus ? "🎮" : a.icon }),
        h("span", { class: "r" }, [e.reason || a.name, h("small", { text: when(e.at) })]),
        h("span", { class: "p" + (minus ? " minus" : ""), text: (minus ? "" : "+") + e.points }),
      ]));
    });

    var kl = $("kidlist"); kl.textContent = "";
    var kids = KP.kids();
    kids.forEach(function (k) {
      var ren = h("button", { type: "button", text: "なまえを変える" });
      ren.onclick = function () { var n = prompt("あたらしい なまえ", k.name); if (n && n.trim()) KP.renameKid(k.id, n.trim()); };
      var del = h("button", { type: "button", text: "消す" });
      del.onclick = function () {
        // confirm が出ない環境（ホーム画面アプリなど）もあるので、2回押しで消す
        if (del.dataset.armed) { KP.removeKid(k.id); if (ss(PICKED) === k.id) ss(PICKED, null); }
        else { del.dataset.armed = "1"; del.textContent = "もう一度押すと記録ごと消えます"; }
      };
      kl.appendChild(h("li", {}, [h("span", { text: k.icon + " " + k.name + "（るいけい " + KP.earned(k.id) + "）" }), ren, kids.length > 1 ? del : null]));
    });
  }

  // ---------- ゲームじかん（ポイントと こうかん） ----------
  var tick = null, warned = {};
  function timer() { try { return JSON.parse(ls(TIMER) || "null"); } catch (e) { return null; } }
  function renderGame(kid) {
    var t = timer(), running = t && t.kid === kid.id && t.end > Date.now();
    $("gamerun").hidden = !running; $("gamepick").hidden = !!running;
    if (running) { startTick(); return; }
    var pick = $("gamepick"); pick.textContent = "";
    var can = KP.gameMinutes(kid.id);
    [10, 20, 30].forEach(function (m) {
      var b = h("button", { type: "button", class: "gbtn" }, [h("b", { text: m + "ぷん" }), h("small", { text: (m * KP.GAME_PER_MIN) + "ポイント" })]);
      if (m > can) b.disabled = true;
      b.onclick = function () { startGame(kid, m); };
      pick.appendChild(b);
    });
    if (can > 0 && can % 10) {
      var all = h("button", { type: "button", class: "gbtn" }, [h("b", { text: can + "ぷん" }), h("small", { text: "ぜんぶ つかう" })]);
      all.onclick = function () { startGame(kid, can); };
      pick.appendChild(all);
    }
    if (!can) pick.appendChild(h("p", { class: "note", text: "ポイントが たりないよ。2もん せいかいすると ゲーム 1ぷん ぶん たまるよ！" }));
  }
  function startGame(kid, min) {
    var used = KP.spend(min * KP.GAME_PER_MIN, "ゲーム " + min + "ぷん", kid.id);
    if (!used) return;
    var realMin = used / KP.GAME_PER_MIN;
    ls(TIMER, JSON.stringify({ kid: kid.id, end: Date.now() + realMin * 60000, min: realMin }));
    warned = {};
    render();
  }
  function beep() {
    try {
      var C = window.AudioContext || window.webkitAudioContext, c = new C();
      [0, 0.35, 0.7].forEach(function (d) { var o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(0.25, c.currentTime + d); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d + 0.3); o.start(c.currentTime + d); o.stop(c.currentTime + d + 0.3); });
    } catch (e) { /* なし */ }
    if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
  }
  function startTick() {
    if (tick) return;
    tick = setInterval(function () {
      var t = timer();
      if (!t) { clearInterval(tick); tick = null; return; }
      var left = (t.end - Date.now()) / 1000;
      $("gleft").textContent = mmss(left);
      if (left <= 60 && !warned.one) { warned.one = 1; $("gmsg").textContent = "のこり 1ぷん だよ"; }
      if (left <= 0) {
        clearInterval(tick); tick = null; ls(TIMER, null);
        $("gmsg").textContent = "⏰ ゲームの じかんは おしまい！";
        beep();
        setTimeout(render, 4000);
      }
    }, 250);
  }
  $("gstop").onclick = function () {
    // 早く おわっても ポイントは もどらない（えらぶ ときに じかんを きめる）
    if ($("gstop").dataset.armed) { ls(TIMER, null); $("gstop").dataset.armed = ""; $("gstop").textContent = "おわりに する"; render(); }
    else { $("gstop").dataset.armed = "1"; $("gstop").textContent = "もういちど おすと おわる（ポイントは もどらないよ）"; }
  };

  function show() {
    var p = picked();
    $("pick").hidden = !!p; $("home").hidden = !p; $("whochip").hidden = !p;
    render();
  }
  function render() { if (picked()) renderHome(); else renderPick(); }

  $("whochip").onclick = function () { ss(PICKED, null); show(); };
  function addFrom(form, pick) {
    var n = form.name.value.trim();
    if (!n) return;
    var k = KP.addKid(n);
    form.reset();
    if (pick) choose(k.id); else KP.setCurrent(k.id);
  }
  $("addkid2").onsubmit = function (e) { e.preventDefault(); addFrom(e.target, true); };
  $("addkid").onsubmit = function (e) { e.preventDefault(); addFrom(e.target, false); };
  $("export").onclick = function () {
    var blob = new Blob([KP.exportData()], { type: "application/json" });
    var a = h("a", { href: URL.createObjectURL(blob), download: "manabi-points-" + new Date().toISOString().slice(0, 10) + ".json" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  };
  $("import").onchange = function (e) {
    var file = e.target.files[0];
    if (!file) return;
    file.text().then(function (t) { KP.importData(t); $("iomsg").textContent = "読み込みました"; })
      .catch(function (err) { $("iomsg").textContent = "読み込めませんでした：" + err.message; });
    e.target.value = "";
  };

  if (/[?&]demo\b/.test(location.search)) {
    $("demo").hidden = false; $("parent").open = true;
    APPS.forEach(function (a) {
      var b = h("button", { type: "button", text: a.icon + " +100" });
      b.onclick = function () { KP.award({ app: a.id, points: 100, reason: a.name + " テスト 20もん" }); };
      $("demobtns").appendChild(b);
    });
  }

  KP.onChange(render);
  show();
  probe();
})();
