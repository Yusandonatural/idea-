/* まなびポイントの入口ページ。記録は points.js（KidsPoints）、アプリ一覧は apps.js */
(function () {
  "use strict";
  var KP = window.KidsPoints, APPS = window.KIDS_APPS, EXTRA = window.KIDS_APP_EXTRA;
  var $ = function (id) { return document.getElementById(id); };
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
  function appInfo(id) {
    return APPS.filter(function (a) { return a.id === id; })[0] || EXTRA[id] || { name: id, icon: "⭐", color: "#999" };
  }
  function when(t) {
    var d = new Date(t), now = new Date();
    var hm = d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
    if (d.toDateString() === now.toDateString()) return "きょう " + hm;
    var y = new Date(now); y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "きのう " + hm;
    return (d.getMonth() + 1) + "/" + d.getDate();
  }

  function render() {
    var kid = KP.current(), kids = KP.kids();

    var nav = $("kids"); nav.textContent = "";
    if (kids.length > 1) kids.forEach(function (k) {
      var b = h("button", { type: "button", "aria-pressed": String(k.id === kid.id), text: k.icon + " " + k.name });
      b.onclick = function () { KP.setCurrent(k.id); };
      nav.appendChild(b);
    });

    var earned = KP.earned(kid.id), lv = KP.level(earned);
    $("who").textContent = kid.icon + " " + kid.name + " の ポイント";
    $("balance").textContent = KP.balance(kid.id);
    $("lv").textContent = "Lv." + lv.level;
    $("lvbar").style.width = Math.round(lv.ratio * 100) + "%";
    $("lvrest").textContent = "つぎまで " + lv.rest;
    $("today").textContent = KP.today(kid.id);
    $("streak").textContent = KP.streak(kid.id);
    $("week").textContent = KP.week(kid.id);

    var by = KP.byApp(kid.id), max = 1, ids = APPS.map(function (a) { return a.id; });
    Object.keys(by).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); max = Math.max(max, by[id]); });
    var box = $("apps"); box.textContent = "";
    ids.forEach(function (id) {
      var a = appInfo(id), pts = by[id] || 0, url = a.url;
      var isApp = APPS.indexOf(a) >= 0;
      var el = h(url ? "a" : "div", { class: "app" + (isApp && !url ? " soon" : ""), style: "--c:" + a.color }, [
        h("span", { class: "ic", text: a.icon }),
        h("span", {}, [h("div", { class: "nm", text: a.name }), h("div", { class: "kn", text: isApp && !url ? "じゅんびちゅう" : (a.kana || "") })]),
        h("span", { class: "pt" }, [String(pts), h("small", { text: "ポイント" })]),
        h("span", { class: "appbar" }, [h("i", { style: "width:" + Math.round(pts / max * 100) + "%" })]),
      ]);
      if (url) el.href = url;
      box.appendChild(el);
    });

    var ul = $("recent"); ul.textContent = "";
    var ev = KP.events(kid.id).slice(0, 20);
    if (!ev.length) ul.appendChild(h("li", { class: "empty", text: "まだ ありません。アプリで べんきょうすると ポイントが たまるよ！" }));
    ev.forEach(function (e) {
      var a = appInfo(e.app), minus = e.points < 0;
      ul.appendChild(h("li", {}, [
        h("span", { text: minus ? "🎁" : a.icon }),
        h("span", { class: "r" }, [e.reason || a.name, h("small", { text: when(e.at) })]),
        h("span", { class: "p" + (minus ? " minus" : ""), text: (minus ? "" : "+") + e.points }),
      ]));
    });

    var kl = $("kidlist"); kl.textContent = "";
    kids.forEach(function (k) {
      var ren = h("button", { type: "button", text: "なまえを変える" });
      ren.onclick = function () { var n = prompt("あたらしい なまえ", k.name); if (n && n.trim()) KP.renameKid(k.id, n.trim()); };
      var del = h("button", { type: "button", text: "消す" });
      del.onclick = function () {
        // confirm が出ない環境（ホーム画面アプリなど）もあるので、2回押しで消す
        if (del.dataset.armed) KP.removeKid(k.id);
        else { del.dataset.armed = "1"; del.textContent = "もう一度押すと記録ごと消えます"; }
      };
      kl.appendChild(h("li", {}, [h("span", { text: k.icon + " " + k.name }), ren, kids.length > 1 ? del : null]));
    });
  }

  $("addkid").onsubmit = function (e) {
    e.preventDefault();
    var n = e.target.name.value.trim();
    if (!n) return;
    var k = KP.addKid(n);
    KP.setCurrent(k.id);
    e.target.reset();
  };
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
      var b = h("button", { type: "button", text: a.icon + " +10" });
      b.onclick = function () { KP.award({ app: a.id, points: 10, reason: a.name + " テスト" }); };
      $("demobtns").appendChild(b);
    });
  }

  KP.current(); // はじめてなら1人目を作っておく
  KP.onChange(render);
  render();
})();
