/* 90日外国語会話プログラム — アプリ本体
 * データ: data/meanings.js（意味リスト・言語共通）, data/lang/<code>.js（訳・音・差し替え語）, data/days.js（90日表）
 *         data/patterns.js, grammar.js, homophones.js, vocab.js, scenes.js（中国語の参考教材）
 * 学習記録はこの端末の localStorage（記録）と IndexedDB（録音）にだけ保存する。
 */
(function () {
"use strict";
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const app = $("#app");
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const DAY_MS = 86400000;
const M = Object.fromEntries(MEANINGS.map(m => [m.no, m]));
const CATNAME = Object.fromEntries(CATS.map(c => [c.id, c.name]));
const P = window.PATTERNS ? Object.fromEntries(PATTERNS.map(p => [p.id, p])) : {};
const G = window.GRAMMAR ? Object.fromEntries(GRAMMAR.map(g => [g.id, g])) : {};
const STARS = { 3: "★★★", 2: "★★", 1: "★" };
const INTERVALS = [1, 3, 7, 14, 30, 60]; // 間隔反復：箱ごとの次回までの日数

// ---------- 記録 ----------
const KEY = "lang90:" + LANG.code;
const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} },
};
const blank = () => ({ day: 1, started: null, blocks: {}, finished: {}, srs: {}, me: {}, memos: [], log: {} });
let S = Object.assign(blank(), { pinyin: true, theme: null }, store.get());
const save = () => store.set(S);

function today() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function addDays(key, n) { const d = new Date(key + "T00:00:00"); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

function applyPrefs() {
  document.body.classList.toggle("hide-py", !S.pinyin);
  if (S.theme) document.documentElement.setAttribute("data-theme", S.theme); else document.documentElement.removeAttribute("data-theme");
}
$("#pyToggle").onclick = () => { S.pinyin = !S.pinyin; save(); applyPrefs(); };
$("#themeToggle").onclick = () => { const dark = matchMedia("(prefers-color-scheme:dark)").matches; const cur = S.theme || (dark ? "dark" : "light"); S.theme = cur === "dark" ? "light" : "dark"; save(); applyPrefs(); };
applyPrefs();

// ---------- 音声：読み上げ ----------
function speak(text, rate) {
  if (!("speechSynthesis" in window)) { toast("この端末は音声読み上げに対応していません"); return Promise.resolve(); }
  return new Promise(res => {
    const u = new SpeechSynthesisUtterance(String(text).replace(/○○|〔|〕|【.*?】/g, ""));
    const vs = speechSynthesis.getVoices();
    const v = vs.find(v => v.lang.replace("_", "-").toLowerCase() === LANG.tts.toLowerCase()) || vs.find(v => v.lang.toLowerCase().startsWith(LANG.code));
    if (v) u.voice = v;
    u.lang = LANG.tts; u.rate = rate || 0.85;
    u.onend = res; u.onerror = res;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  });
}
window.__speak = (t) => speak(t);
const spk = t => `<button class="spk" onclick="__speak(${esc(JSON.stringify(t))})" aria-label="読み上げ">🔊</button>`;

// ---------- 音声：発話チェック（「通じる短い文」で判定） ----------
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
function norm(s) { return String(s).replace(/[\s，。！？、,.!?…：:；;“”"'（）()○]/g, ""); }
function similarity(a, b) {
  a = norm(a); b = norm(b); if (!a || !b) return 0;
  const dp = Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) { let prev = 0; for (let j = 1; j <= b.length; j++) { const t = dp[j]; dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]); prev = t; } }
  return dp[b.length] / b.length;
}
function checkSpeech(target, out) {
  if (EMBED || !Rec) { out.className = "result bad"; out.textContent = EMBED ? "このプレビュー版ではマイクが使えません。GitHub Pages で公開した版（またはホーム画面に追加した版）で使えます。" : "この端末のブラウザは発話チェックに対応していません（Chrome / Safari で使えます）。"; return; }
  const r = new Rec(); r.lang = LANG.tts; r.interimResults = false; r.maxAlternatives = 3;
  out.className = "result"; out.textContent = "🎤 話してください…";
  r.onresult = e => {
    const alts = Array.from(e.results[0]).map(a => a.transcript);
    const best = Math.max(...alts.map(a => similarity(a, target)));
    const heard = alts[0];
    if (best >= 0.6) { out.className = "result good"; out.textContent = `通じました（${Math.round(best * 100)}%）　聞き取り：${heard}`; }
    else { out.className = "result bad"; out.textContent = `もう一度（${Math.round(best * 100)}%）　聞き取り：${heard || "—"}。短く、ゆっくりで大丈夫です。`; }
  };
  r.onerror = e => { out.className = "result bad"; out.textContent = e.error === "not-allowed" ? "マイクの使用が許可されていません。" : "聞き取れませんでした。もう一度どうぞ。"; };
  try { r.start(); } catch (e) { out.textContent = "マイクを開始できませんでした。"; }
}
window.__check = (btn) => { const box = btn.closest("[data-target]"); checkSpeech(box.dataset.target, box.querySelector(".result")); };
const micBtn = () => `<button class="small" onclick="__check(this)">🎤 話して判定</button>`;

// ---------- 録音（IndexedDB に保存） ----------
const idb = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      try {
        const r = indexedDB.open("lang90-rec", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("rec");
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  },
  async put(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction("rec", "readwrite"); t.objectStore("rec").put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async get(k) { const db = await this.open(); return new Promise((res) => { const t = db.transaction("rec").objectStore("rec").get(k); t.onsuccess = () => res(t.result); t.onerror = () => res(null); }); },
};
let mediaRec = null;
async function startRec(key, ui) {
  if (EMBED || !navigator.mediaDevices || !window.MediaRecorder) { ui.status.textContent = EMBED ? "このプレビュー版では録音できません。公開版で使うか、スマホの録音アプリで代用してください。" : "この端末では録音できません。スマホの録音アプリで代用してください。"; return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    mediaRec = new MediaRecorder(stream);
    mediaRec.ondataavailable = e => chunks.push(e.data);
    mediaRec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: mediaRec.mimeType || "audio/webm" });
      try { await idb.put(key, { blob, at: Date.now() }); } catch (e) {}
      ui.audio.src = URL.createObjectURL(blob); ui.audio.hidden = false;
      ui.status.textContent = "保存しました。聞き直して、言えなかったことを最後の5分でメモしましょう。";
      ui.btn.textContent = "● 録り直す";
    };
    mediaRec.start();
    ui.btn.textContent = "■ 停止"; ui.status.innerHTML = '<span class="dot"></span> 録音中…';
  } catch (e) { ui.status.textContent = "マイクの使用が許可されていません。"; }
}
function recorderHtml(key, label) {
  return `<div class="rec" data-rec="${esc(key)}"><button class="primary small">● ${esc(label || "録音する")}</button><span class="muted st"></span><audio controls hidden></audio></div>`;
}
function bindRecorders() {
  $$("[data-rec]").forEach(async el => {
    const key = el.dataset.rec, ui = { btn: el.querySelector("button"), status: el.querySelector(".st"), audio: el.querySelector("audio") };
    try { const v = await idb.get(key); if (v && v.blob) { ui.audio.src = URL.createObjectURL(v.blob); ui.audio.hidden = false; ui.btn.textContent = "● 録り直す"; ui.status.textContent = "保存済み（" + new Date(v.at).toLocaleDateString() + "）"; } } catch (e) {}
    ui.btn.onclick = () => { if (mediaRec && mediaRec.state === "recording") mediaRec.stop(); else startRec(key, ui); };
  });
}

// ---------- 小物 ----------
function toast(msg) { const t = document.createElement("div"); t.className = "notice"; t.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;z-index:50;text-align:center"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2500); }
const EMBED = !!window.__EMBED__; // claude.ai 上の公開版：ダウンロード・マイクが使えない
async function copy(text, el) { try { await navigator.clipboard.writeText(text); toast("コピーしました"); } catch (e) { if (el) { const r = document.createRange(); r.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); } toast("選択しました。長押し（Ctrl+C）でコピーしてください"); } }
window.__copy = id => { const el = document.getElementById(id); copy(el.textContent, el); };

// ---------- 意味リストの表示（自分専用・差し替え） ----------
function slotWords(slot) { return (LANG.slots && LANG.slots[slot]) || []; }
function textOf(no) {
  const m = M[no], tr = LANG.items[no] || ["", ""];
  let ja = m.ja, zh = tr[0], py = tr[1], mine = false;
  const me = S.me[no];
  if (m.self && me && (me.zh || me.ja)) {
    ja = ja.replace("○○", me.ja || "○○"); zh = zh.replace("○○", me.zh || "○○"); py = py.replace("○○", me.py || "○○"); mine = true;
  }
  const ex = m.slot ? slotWords(m.slot).slice(0, 4) : [];
  const audio = zh.includes("○○") && ex.length ? zh.replace("○○", ex[0][1]) : zh;
  return { ja, zh, py, mine, ex, audio };
}
function exChips(t) {
  if (!t.ex.length || !t.zh.includes("○○")) return "";
  return `<div class="slots">${t.ex.map(e => `<span>${esc(e[1])} <span class="py">${esc(e[2])}</span> <span class="ja">${esc(e[0])}</span></span>`).join("")}</div>`;
}
function itemRow(no) {
  const m = M[no], t = textOf(no);
  return `<div class="ex" data-target="${esc(t.audio)}"><div class="ja">${esc(m.no)} ${STARS[m.pri]} ${esc(CATNAME[m.cat])}${m.self ? ' <span class="tag ok">自分専用</span>' : ""}</div>
    <div style="font-weight:600">${esc(t.ja)}</div>
    <div class="zh">${esc(t.zh)} ${spk(t.audio)} ${micBtn()}</div><div class="py">${esc(t.py)}</div>${exChips(t)}
    ${m.note ? `<div class="muted">${esc(m.note)}</div>` : ""}<div class="result"></div></div>`;
}

// ---------- 間隔反復 ----------
function introduce(day) {
  const d = DAYS[day - 1]; if (!d) return;
  d.items.forEach(no => { if (!S.srs["m:" + no]) S.srs["m:" + no] = { box: 0, due: today(), intro: day }; });
  save();
}
function dueCards() {
  const t = today();
  return Object.entries(S.srs).filter(([, v]) => v.due <= t).sort((a, b) => (a[1].box - b[1].box) || (a[1].due < b[1].due ? -1 : 1)).map(([k]) => k);
}
function grade(id, ok) {
  const c = S.srs[id] || { box: 0 };
  if (ok) { c.box = Math.min(INTERVALS.length, c.box + 1); c.due = addDays(today(), INTERVALS[c.box - 1]); }
  else { c.box = 0; c.due = today(); c.miss = (c.miss || 0) + 1; }
  S.srs[id] = c; save();
}
function cardFace(id) {
  if (id.startsWith("m:")) { const t = textOf(id.slice(2)); return Object.assign({ kind: "m", no: id.slice(2) }, t); }
  const memo = S.memos.find(x => "x:" + x.id === id);
  if (!memo) return null;
  return { kind: "x", ja: memo.ja, zh: memo.zh || "", py: memo.py || "", audio: memo.zh || "", ex: [], memo };
}
function learnedCount() { return Object.values(S.srs).filter(c => c.box >= 2).length; }

// ---------- AI会話プロンプト ----------
function aiPrompt(day) {
  const d = DAYS[day - 1];
  const phr = d.items.map(no => { const t = textOf(no); return `・${t.ja} → ${t.zh}`; }).join("\n");
  const me = MEANINGS.filter(m => m.self && S.me[m.no] && S.me[m.no].zh).slice(0, 6).map(m => "・" + textOf(m.no).zh).join("\n");
  return `あなたは${LANG.name}の会話練習の相手です。私は日本語を母語とする初心者で、90日プログラムの Day ${day}/90 です。
今日のテーマは「${d.theme}」です。

ルール：
- ${LANG.name}で、1回に1〜2文だけ、短くゆっくり話してください。
- 私の返事は「完璧な文」ではなく「通じる短い文」で評価してください。間違いは会話の流れを止めずに、1回に1つだけ正しい言い方を示してください。
- 私が詰まったら、日本語で助け舟を出し、言えるフレーズを1つ提案してください。
- 会話は10分程度。最後に、私が言えなかったことを3つ、${LANG.name}の言い方と一緒にまとめてください。

今日使いたい表現：
${phr || "（復習中心の日です）"}
${me ? "\n私についての情報（自己紹介に使ってください）：\n" + me + "\n" : ""}
では、あなたから簡単なあいさつで始めてください。`;
}

// ---------- 画面：今日 ----------
const views = {};
const BLOCKS = [
  { min: 15, key: "review", name: "フレーズの復習", what: "今日の新しい「言いたいこと」と、間隔反復で期限が来たものを、日本語を見て声に出す。" },
  { min: 20, key: "listen", name: "聞く＋まねる", what: "短い会話をシャドーイング。最初の2週間は「日本人がつまずく音」も1つずつ。" },
  { min: 20, key: "speak", name: "話す", what: "今日のテーマで独り言かAIと音声会話。録音して聞き直す。" },
  { min: 5, key: "memo", name: "言えなかったことメモ", what: "今日言いたかったのに言えなかったことを書く。翌日の復習に入る。" },
];
function monthGoal(m) {
  return ["", "音と文字に慣れる。最重要フレーズとあいさつ・自己紹介が口から出る", "型（〜したい・〜した・〜してください・質問）を入れ替えて使える", "聞き返しや言い換えを含めて、やり取りを続けられる"][m];
}
views.today = function (arg) {
  if (!S.started) return welcome();
  const day = arg ? Math.max(1, Math.min(90, parseInt(arg, 10))) : S.day;
  const d = DAYS[day - 1];
  const blocks = S.blocks[day] || {};
  const isCur = day === S.day;
  const due = dueCards().length;
  const extra = [];
  if (d.known) extra.push(`<a href="#/known">もう知っている語</a>`);
  if (d.sound) extra.push(`<a href="#/sounds/${d.sound}">音 ${d.sound}/10：${esc(LANG.sounds[d.sound - 1].title)}</a>`);
  if (d.soundReview) extra.push(`<a href="#/quiz">聞き分けテスト</a>`);
  if (d.pattern != null && PATTERNS[d.pattern]) extra.push(`<a href="#/patterns/${PATTERNS[d.pattern].id}">文型 ${esc(PATTERNS[d.pattern].zh)}</a>`);
  if (d.session) extra.push(`<span class="hl">ネイティブと会話する日</span>`);
  if (d.check) extra.push(`<a class="hl" href="#/check">到達チェック（録音）</a>`);
  const done = Object.keys(S.finished).length;
  return `<section class="hero">
    <div class="eyebrow">${d.month}ヶ月目 ・ ${esc(monthGoal(d.month))}</div>
    <div class="today-head" style="margin-top:8px">
      <div class="day">${day}<small>日目 / 90</small></div>
      <div class="theme">${esc(d.theme)}</div>
      <div class="sub">新しい言いたいこと ${d.items.length}件 ・ 復習 ${due}件 ・ 使える状態 ${learnedCount()}件</div>
    </div>
    ${extra.length ? `<div class="extras">${extra.join("")}</div>` : ""}
    ${journey(day)}
    ${isCur ? "" : `<div class="row" style="margin-top:10px"><span class="notice">${day}日目を表示中です（今は ${S.day}日目）</span><button class="small" data-goto="${day}">この日に移動</button></div>`}
  </section>
  <nav class="hour" aria-label="今日の60分">${BLOCKS.map(b => `<a href="#/${b.key}/${day}" style="--min:${b.min}" class="${blocks[b.key] ? "done" : ""}">${b.min}分 ${b.min >= 15 ? esc(b.name.replace("フレーズの", "").replace("言えなかったことメモ", "メモ")) : ""}</a>`).join("")}</nav>
  <div class="card">${BLOCKS.map((b, i) => `<div class="block ${blocks[b.key] ? "done" : ""}">
      <div class="m">${b.min}<small>分</small></div>
      <div><h3>${esc(b.name)}</h3><div class="muted">${esc(b.what)}</div>
        <div class="row" style="margin-top:10px"><a class="btn" href="#/${b.key}/${day}">始める</a>
        <button class="small ${blocks[b.key] ? "" : "ok"}" data-block="${b.key}" data-day="${day}">${blocks[b.key] ? "未完了に戻す" : "完了にする"}</button></div></div></div>`).join("")}
  </div>
  <div class="daynav">
    ${day > 1 ? `<a class="btn" href="#/today/${day - 1}">← ${day - 1}日目</a>` : "<span></span>"}
    ${isCur ? `<button class="primary" id="finishDay" ${BLOCKS.every(b => blocks[b.key]) ? "" : "disabled"}>${day}日目を終えて次へ</button>` : ""}
    ${day < 90 ? `<a class="btn" href="#/today/${day + 1}">${day + 1}日目 →</a>` : "<span></span>"}
  </div>
  <p class="muted" style="margin-top:12px">時間がない日は「復習15分＋話す5分」だけでも十分です。ゼロの日を作らないことを優先します。完了 ${done} / 90日。</p>`;
};
function journey(cur) {
  const row = m => DAYS.filter(d => d.month === m).map(d => {
    const c = [S.finished[d.day] ? "done" : "", d.day === cur ? "cur" : "", d.check ? "check" : "", d.session ? "session" : ""].filter(Boolean).join(" ");
    return `<a href="#/today/${d.day}" class="${c}" title="${d.day}日目 ${esc(d.theme)}" aria-label="${d.day}日目"></a>`;
  }).join("");
  return `<div class="journey" aria-label="90日の進み具合">
    ${[1, 2, 3].map(m => `<div class="mrow"><span class="ml">${m}ヶ月目</span><div class="cells">${row(m)}</div></div>`).join("")}
    <div class="legend"><span><i class="d"></i>終えた日</span><span><i class="s"></i>会話セッション</span><span><i class="c"></i>到達チェック</span></div>
  </div>`;
}
function welcome() {
  return `<section class="welcome">
    <div class="big-han">说</div>
    <h2>1日60分 × 90日で、${esc(LANG.name)}で自分のことを話す</h2>
    <p>3ヶ月後の約束は「${esc(LANG.goalLong)}」です。ペラペラは約束しません。そのかわり、毎日かならず声に出して話す時間を入れます。</p>
    <div class="stat"><div><b>${MEANINGS.length}</b>言いたいこと</div><div><b>90</b>日</div><div><b>60</b>分 / 日</div><div><b>${(LANG.known || []).filter(x => !String(x[3] || "").startsWith("注意")).length}</b>もう読める語</div></div>
    <div class="card"><strong>最初に、自分のことを登録します（3分）</strong>
      <p class="muted">自己紹介や仕事の説明は、あなた自身の答えで練習します。あとから「わたしの答え」でいつでも変えられます。</p>
      <div class="row" style="margin-top:10px"><button class="primary" id="startBtn">1日目を始める</button><a class="btn" href="#/me">先に自分の答えを入れる</a><a class="btn" href="#/about">このプログラムについて</a></div></div>
  </section>`;
}

// ---------- 画面：1. 復習（間隔反復） ----------
let deck = null;
views.review = function (arg) {
  const day = parseInt(arg || S.day, 10);
  if (day === S.day) introduce(day);
  if (!deck || deck.day !== day) deck = { day, ids: dueCards(), i: 0, shown: false, ok: 0, ng: 0 };
  if (!deck.ids.length || deck.i >= deck.ids.length) {
    const nNew = DAYS[day - 1].items.length;
    return `<h2>フレーズの復習 <span class="tag">${day}日目</span></h2><div class="card"><p>${deck.ids.length ? `終わりました。言えた ${deck.ok} ／ もう一回 ${deck.ng}` : "今日の期限が来たカードはありません。"}</p>
      <p class="muted">今日の新規 ${nNew}件は、言えるようになるまで今日中に何度か出ます。翌日以降は 1→3→7→14→30日後 に戻ってきます。</p>
      <div class="row"><button class="ok" data-block="review" data-day="${day}" data-back="1">完了にして戻る</button><a class="btn" href="#/list/day/${day}">今日のフレーズ一覧</a><button class="small" id="again">もう一周</button></div></div>`;
  }
  const id = deck.ids[deck.i], f = cardFace(id);
  if (!f) { deck.i++; return views.review(arg); }
  const isNew = (S.srs[id] || {}).box === 0 && (S.srs[id] || {}).intro === day;
  return `<h2>フレーズの復習 <span class="tag">${deck.i + 1} / ${deck.ids.length}</span> ${isNew ? '<span class="tag ok">今日の新規</span>' : ""}</h2>
  <div class="card flash" data-target="${esc(f.audio)}">
    <div class="muted">日本語を見て、${esc(LANG.name)}で声に出してから「答え」</div>
    <div class="q" style="margin-top:12px">${f.mine ? '<span class="self">自分</span> ' : ""}${esc(f.ja)}</div>
    ${f.kind === "m" && M[f.no].slot && !f.mine ? `<div class="muted">○○ は差し替え：${esc(SLOT_NAME[M[f.no].slot])}</div>` : ""}
    <div style="margin-top:16px;min-height:90px">${deck.shown ? (f.zh ? `<div class="zh lg">${esc(f.zh)} ${spk(f.audio)}</div><div class="py">${esc(f.py)}</div>${exChips(f)}` :
      `<div class="notice">このメモにはまだ訳がありません。調べるかAIに聞いて書き込みましょう。</div><div class="row" style="margin-top:8px"><input type="text" id="memoZh" placeholder="${esc(LANG.name)}"><input type="text" id="memoPy" placeholder="ピンイン（任意）"><button class="small" id="memoSave">保存</button></div>`) : ""}</div>
    <div class="row" style="justify-content:center">${deck.shown ? `${f.zh ? micBtn() : ""}<button class="ok" data-grade="1">言えた</button><button data-grade="0">もう一回</button>` : `<button class="primary" id="reveal">答え</button>`}</div>
    <div class="result"></div>
  </div>
  <div class="muted">「言えた」の基準は「通じる短い文」。完璧でなくてかまいません。</div>`;
};

// ---------- 画面：2. 聞く＋まねる ----------
views.listen = function (arg) {
  const day = parseInt(arg || S.day, 10), d = DAYS[day - 1];
  const sc = (window.SCENES || {})[d.scene];
  let html = `<h2>聞く＋まねる <span class="tag">${day}日目</span></h2>`;
  if (d.sound) html += `<h3>今日の音（${d.sound}/10）</h3>` + soundCard(LANG.sounds[d.sound - 1]);
  if (d.soundReview) html += `<div class="card"><strong>音の総ざらい</strong><p class="muted">Day 11〜14 は、音トップ10の聞き分けテストを5分。</p><a class="btn" href="#/quiz">聞き分けテストへ</a></div>`;
  html += `<h3>今日のフレーズを聞いてまねる</h3><div class="card"><div class="row"><button class="primary small" id="playAll">▶ 全部を順に再生（各2回＋まねる間）</button></div>
    ${d.items.map(itemRow).join("") || '<p class="muted">復習中心の日です。</p>'}</div>`;
  if (sc) html += `<h3>会話のシャドーイング：${esc(sc.title)}</h3><div class="card">
    <p class="muted">① 文字を見ずに1回聞く → ② 文字を見ながら音に重ねて言う ×3 → ③ B（あなた）の役だけ自分で言う。</p>
    <div class="row"><button class="small" id="playScene">▶ 会話を通しで再生</button><button class="small" id="playSceneA">▶ Aだけ再生（Bは自分で言う）</button></div>
    ${sc.lines.map(l => `<div class="line ${l[0] === "B" ? "me" : ""}" data-target="${esc(l[1])}"><div class="who">${l[0]}</div><div><div class="zh" style="font-size:19px">${esc(l[1])}</div><div class="py">${esc(l[2])}</div><div class="ja">${esc(l[3])}</div><div class="result"></div></div><div>${spk(l[1])}${l[0] === "B" ? micBtn() : ""}</div></div>`).join("")}</div>`;
  html += `<div class="row"><button class="ok" data-block="listen" data-day="${day}" data-back="1">完了にして戻る</button></div>`;
  return html;
};
function soundCard(s) {
  return `<div class="card"><div class="row"><span class="tag">トップ${s.rank}</span><strong>${esc(s.title)}</strong></div>
    <p><span class="muted">つまずく理由：</span>${esc(s.why)}</p><p><span class="muted">直し方：</span>${esc(s.how)}</p>
    <table>${s.pairs.map(p => `<tr data-target="${esc(p[0])}"><td class="zh" style="font-size:20px">${esc(p[0])} ${spk(p[0])}</td><td class="py">${esc(p[1])}</td><td class="ja">${esc(p[2])}</td><td>${micBtn()}<div class="result"></div></td></tr>`).join("")}</table></div>`;
}
async function playSeq(list, gapFactor) {
  for (const t of list) { const st = Date.now(); await speak(t); const dur = Date.now() - st; await new Promise(r => setTimeout(r, Math.max(800, dur * (gapFactor || 1.2)))); if (!document.body.contains(app)) return; }
}

// ---------- 画面：3. 話す ----------
views.speak = function (arg) {
  const day = parseInt(arg || S.day, 10), d = DAYS[day - 1];
  const pat = d.pattern != null ? PATTERNS[d.pattern] : null;
  const themes = {
    connect: "「聞き返す・待ってもらう・言い換えを頼む」を、相手の早口を想像しながら5回ずつ言う。",
    self: "1分間の自己紹介。名前・出身・住まい・仕事・趣味・中国語を学ぶ理由。",
    feel: "最近食べたもの・行った場所について「好き/いまいち/楽しかった」を3つ言う。",
    plan: "昨日したこと3つ、明日する予定3つを言う。",
    ask: "店員・駅員・通行人に聞く場面を想像して、質問を5つ言う。",
    travel: "注文 → 値段を聞く → 支払い → お礼、を通しで1分。",
    trouble: "道に迷った/体調が悪い/物をなくした、のどれか1つを相手に説明する。",
  };
  const prompt = aiPrompt(day);
  return `<h2>話す <span class="tag">${day}日目</span></h2>
  <div class="card"><strong>① 独り言（5分）</strong><p>${esc(themes[d.cat])}</p>
    <p class="muted">コツ：日本語の語順で考えず、<strong>「主語＋動詞」を先に言い切って、残りは後から足す</strong>。</p>
    <div class="pill-list">${d.items.map(no => `<a href="#/list/day/${day}">${esc(textOf(no).zh)}</a>`).join("")}</div></div>
  ${pat ? `<div class="card"><strong>② 型の入れ替え（5分）</strong>：<span class="zh" style="font-size:18px">${esc(pat.zh)}</span> ${spk(pat.zh)}<div class="py">${esc(pat.py)}</div><div class="ja">${esc(pat.ja)}</div>
    <div class="row" style="margin-top:6px"><a class="btn" href="#/drill/${pat.id}">入れ替えドリル</a></div></div>` : ""}
  <div class="card"><strong>${pat ? "③" : "②"} AIと音声会話（10分）</strong>
    <p class="muted">下のプロンプトをコピーして、Claude などのAIアプリの音声モードに貼り付けて会話します。${d.session ? "<br><strong>今日はネイティブとの会話セッションの日です。</strong>オンライン講師や知人と15分。AIの練習はその準備に使います。" : ""}</p>
    <pre class="prompt" id="aiPrompt">${esc(prompt)}</pre><div class="row"><button class="primary small" onclick="__copy('aiPrompt')">プロンプトをコピー</button></div></div>
  <div class="card"><strong>録音して聞き直す</strong><p class="muted">独り言かAIとの会話の一部を1分録音。言えなかったところは最後の5分でメモへ。</p>${recorderHtml("day-" + day, "1分録音する")}</div>
  <div class="row"><button class="ok" data-block="speak" data-day="${day}" data-back="1">完了にして戻る</button><a class="btn" href="#/memo/${day}">メモへ →</a></div>`;
};

// ---------- 画面：4. 言えなかったことメモ ----------
views.memo = function (arg) {
  const day = parseInt(arg || S.day, 10);
  const list = S.memos.filter(m => m.day === day);
  const all = S.memos.length;
  return `<h2>言えなかったことメモ <span class="tag">${day}日目</span></h2>
  <div class="card"><p class="muted">今日「言いたかったのに言えなかったこと」を日本語で。訳がわかれば一緒に書きます（空欄でもOK、復習のときに埋められます）。翌日の復習カードになります。</p>
    <input type="text" id="mJa" placeholder="言いたかったこと（日本語）" style="margin-bottom:6px">
    <div class="row"><input type="text" id="mZh" placeholder="${esc(LANG.name)}（任意）" style="flex:1"><input type="text" id="mPy" placeholder="ピンイン（任意）" style="flex:1"></div>
    <div class="row" style="margin-top:8px"><button class="primary" id="mAdd">追加</button></div></div>
  <div class="card"><strong>Day ${day} のメモ ${list.length}件</strong>（全体 ${all}件）
    ${list.map(m => `<div class="ex"><div>${esc(m.ja)}</div><div class="zh" style="font-size:18px">${esc(m.zh || "（訳はまだ）")}</div><div class="py">${esc(m.py || "")}</div><button class="small" data-delmemo="${m.id}">削除</button></div>`).join("") || '<p class="muted">まだありません。</p>'}
    ${list.some(m => !m.zh) ? `<p class="muted" style="margin-top:8px">訳がないメモは、AIに次のように聞くと早いです：</p><pre class="prompt" id="memoPrompt">次の日本語を、${esc(LANG.name)}の初心者が会話で使える短く自然な言い方にしてください。ピンインも付けてください。\n${list.filter(m => !m.zh).map(m => "・" + m.ja).join("\n")}</pre><button class="small" onclick="__copy('memoPrompt')">コピー</button>` : ""}
  </div>
  <div class="row"><button class="ok" data-block="memo" data-day="${day}" data-back="1">完了にして戻る</button></div>`;
};

// ---------- 画面：90日表 ----------
views.plan = function () {
  const rows = m => DAYS.filter(d => d.month === m).map(d => `<tr class="${d.day === S.day ? "cur" : ""} ${S.finished[d.day] ? "fin" : ""}"><td><a href="#/today/${d.day}">Day ${d.day}</a></td><td>${esc(d.theme)}</td><td>${d.items.length}</td>
    <td>${[d.known ? "知っている語" : "", d.sound ? "音" + d.sound : "", d.soundReview ? "聞き分け" : "", d.pattern != null ? "文型" + (d.pattern + 1) : "", d.session ? "会話セッション" : "", d.check ? "到達チェック" : ""].filter(Boolean).map(x => `<span class="tag grey">${x}</span>`).join("")}</td></tr>`).join("");
  return `<h2>90日のテーマ表</h2><p class="muted">優先度★★★を1ヶ月目、★★を2ヶ月目、★を3ヶ月目に配置。各月の中は「つなぐ技術 → 自分のこと → 質問 → 旅先 → 気持ち → 予定と過去 → 困ったとき」の順です。${EMBED ? "" : '<a href="data/days.csv" download>CSVで保存</a>'}</p>
  ${[1, 2, 3].map(m => `<h3>${m}ヶ月目：${esc(monthGoal(m))}</h3><div class="card" style="overflow-x:auto"><table class="daytable"><tr><th>Day</th><th>テーマ</th><th>新規</th><th>その日の追加メニュー</th></tr>${rows(m)}</table></div>`).join("")}`;
};

// ---------- 画面：意味リスト ----------
let listFilter = { cat: "", pri: 0, q: "" };
views.list = function (arg, arg2) {
  let items = MEANINGS;
  let title = "意味リスト";
  if (arg === "day") { const d = DAYS[parseInt(arg2, 10) - 1]; items = d ? d.items.map(no => M[no]) : []; title = `Day ${arg2} のフレーズ`; }
  else {
    if (listFilter.cat) items = items.filter(m => m.cat === listFilter.cat);
    if (listFilter.pri) items = items.filter(m => m.pri === listFilter.pri);
    if (listFilter.q) { const q = listFilter.q; items = items.filter(m => m.ja.includes(q) || (LANG.items[m.no] || []).join(" ").includes(q)); }
  }
  const counts = Object.fromEntries(CATS.map(c => [c.id, MEANINGS.filter(m => m.cat === c.id).length]));
  return `<h2>${title} <span class="tag">${items.length}</span></h2>
  ${arg === "day" ? "" : `<p class="muted">日本人が実際に口にしたい「言いたいこと」を、会話の役割で7つに分けています。文型（○○を含む文）と差し替え単語の2層構造です。${EMBED ? "" : '<a href="data/meanings.csv" download>意味リストCSV</a>・<a href="data/slots.csv" download>差し替え単語CSV</a>'}</p>
  <div class="chips" id="catChips"><button data-cat="" class="${listFilter.cat ? "" : "on"}">すべて</button>${CATS.map(c => `<button data-cat="${c.id}" class="${listFilter.cat === c.id ? "on" : ""}">${esc(c.name)} ${counts[c.id]}</button>`).join("")}</div>
  <div class="chips" style="margin-top:6px" id="priChips">${[0, 3, 2, 1].map(p => `<button data-pri="${p}" class="${listFilter.pri === p ? "on" : ""}">${p ? STARS[p] : "優先度すべて"}</button>`).join("")}</div>
  <input type="text" id="q" placeholder="検索（日本語・${esc(LANG.name)}）" value="${esc(listFilter.q)}" style="margin-top:8px">`}
  <div class="card">${items.slice(0, 200).map(m => itemRow(m.no)).join("")}${items.length > 200 ? `<p class="muted">先頭200件を表示中。絞り込んでください。</p>` : ""}</div>`;
};

// ---------- 画面：わたしの答え（自分専用スロット） ----------
views.me = function () {
  const items = MEANINGS.filter(m => m.self);
  const pr = `次の日本語の「○○」に入る私の答えを、${LANG.name}にしてください。ピンインも。\n` + items.map(m => `・${m.ja}（私の答え：${(S.me[m.no] || {}).ja || "＿＿"}）`).join("\n");
  return `<h2>わたしの答え <span class="tag">${items.length}</span></h2>
  <p class="muted">自己紹介・仕事・家族・趣味などは、あなた自身の答えで練習します。日本語の答えを入れ、${esc(LANG.name)}がわかれば一緒に入れてください（例：奈良 → 奈良 Nàiliáng）。保存すると復習カードと AI 会話プロンプトに反映されます。</p>
  ${items.map(m => { const t = LANG.items[m.no] || ["", ""], me = S.me[m.no] || {}; const ex = m.slot ? slotWords(m.slot).slice(0, 6) : [];
    return `<div class="card" data-me="${m.no}"><div><strong>${esc(m.ja)}</strong> <span class="muted">${esc(t[0])}</span></div>
      ${ex.length ? `<div class="chips" style="margin:6px 0">${ex.map(e => `<button class="small" data-pick='${esc(JSON.stringify(e))}'>${esc(e[0])}</button>`).join("")}</div>` : ""}
      <div class="row"><input type="text" class="meJa" placeholder="日本語の答え" value="${esc(me.ja || "")}" style="flex:1"><input type="text" class="meZh" placeholder="${esc(LANG.name)}" value="${esc(me.zh || "")}" style="flex:1"><input type="text" class="mePy" placeholder="ピンイン" value="${esc(me.py || "")}" style="flex:1"></div>
      ${me.zh ? `<div class="zh" style="font-size:18px;margin-top:6px">${esc(textOf(m.no).zh)} ${spk(textOf(m.no).zh)}</div>` : ""}</div>`; }).join("")}
  <div class="row"><button class="primary" id="meSave">保存</button></div>
  <h3>訳がわからないとき</h3><pre class="prompt" id="mePrompt">${esc(pr)}</pre><button class="small" onclick="__copy('mePrompt')">AIに聞くプロンプトをコピー</button>`;
};

// ---------- 画面：音トップ10・聞き分け ----------
views.sounds = function (arg) {
  const n = parseInt(arg, 10);
  if (n && LANG.sounds[n - 1]) return `<p><a href="#/sounds">← 音トップ10</a></p>` + soundCard(LANG.sounds[n - 1]);
  return `<h2>日本人がつまずく音 トップ10</h2>
  <p class="muted">日本語は母音が5つで、子音の後に必ず母音が付きます。この癖が${esc(LANG.name)}で特につまずく10の音を、Day 1〜10 に1つずつ潰します。${esc(LANG.strength)}。</p>
  <div class="row" style="justify-content:space-between"><a class="btn" href="#/quiz">聞き分けテスト</a>${toneLegend}</div>
  ${LANG.sounds.map(soundCard).join("")}
  ${window.HOMOPHONES ? `<h3>同音・声調違いの語（参考）</h3><p class="muted">声調だけ違う語、まったく同じ音の語、読みが複数ある漢字。</p><div class="grid">${HOMOPHONES.map(h => `<div class="card"><span class="tag ${h.type === "tone" ? "" : h.type === "same" ? "warn" : "ok"}">${{ tone: "声調違い", same: "完全同音", multi: "多音字" }[h.type]}</span><strong>${esc(h.title)}</strong><table style="margin-top:6px">${h.items.map(i => `<tr><td class="zh" style="font-size:18px">${esc(i[0])} ${spk(i[0])}</td><td class="py">${esc(i[1])}</td><td class="ja">${esc(i[2])}</td></tr>`).join("")}</table><div class="muted">${esc(h.drill)}</div></div>`).join("")}</div>` : ""}`;
};
let quiz = null;
function newQuiz() {
  const pool = LANG.sounds.flatMap(s => [s.pairs]).concat((window.HOMOPHONES || []).filter(h => h.type === "tone").map(h => h.items));
  const set = pool[Math.floor(Math.random() * pool.length)].slice(0, 4);
  const ans = set[Math.floor(Math.random() * set.length)];
  return { set, ans, picked: null };
}
views.quiz = function () {
  if (!quiz || quiz.q.picked) quiz = { q: newQuiz(), ok: (quiz || {}).ok || 0, n: (quiz || {}).n || 0 };
  const q = quiz.q;
  return `<h2>聞き分けテスト <span class="tag">${quiz.ok} / ${quiz.n}</span></h2>
  <div class="card flash"><p class="muted">音を聞いて、どれかを選んでください（何度でも再生できます）</p>
    <button class="primary" id="qPlay">▶ 再生</button> <button class="small" id="qSlow">ゆっくり</button>
    <div class="quiz-opts">${q.set.map((o, i) => `<button data-opt="${i}"><span class="zh" style="font-size:22px">${esc(o[0])}</span><br><span class="py">${esc(o[1])}</span><br><span class="ja">${esc(o[2])}</span></button>`).join("")}</div>
    <div class="result" id="qRes"></div><div class="row" style="justify-content:center;margin-top:8px"><button id="qNext" hidden>次へ</button></div></div>`;
};

// ---------- 画面：もう知っている語 ----------
views.known = function () {
  const k = LANG.known || [];
  const ok = k.filter(x => !String(x[3] || "").startsWith("注意"));
  const ng = k.filter(x => String(x[3] || "").startsWith("注意"));
  return `<h2>実はもう知っている語 <span class="tag">${ok.length}</span></h2>
  <p class="muted">漢字が読める日本人は、初日からこれだけの${esc(LANG.name)}の意味がわかります。発音だけ覚えれば使えます。🔊 を押して、まねして言ってみましょう。</p>
  <div class="card" style="overflow-x:auto"><table><tr><th>日本語</th><th>${esc(LANG.name)}</th><th>ピンイン</th><th>メモ</th></tr>${ok.map(x => `<tr><td>${esc(x[0])}</td><td class="zh" style="font-size:19px">${esc(x[1])} ${spk(x[1])}</td><td class="py">${esc(x[2])}</td><td class="ja">${esc(x[3] || "")}</td></tr>`).join("")}</table></div>
  ${ng.length ? `<h3>注意：形は同じでも意味が違う語</h3><div class="card"><table>${ng.map(x => `<tr><td>${esc(x[0])}</td><td class="zh" style="font-size:19px">${esc(x[1])}</td><td class="py">${esc(x[2])}</td><td class="ja">${esc(x[3])}</td></tr>`).join("")}</table></div>` : ""}`;
};

// ---------- 画面：到達チェック ----------
views.check = function () {
  const tasks = [
    ["自己紹介（1分）", "名前・出身・住まい・仕事・趣味・学んでいる理由"],
    ["お店で注文して支払う（1分）", "注文 → 質問を1つ → 値段 → 支払い方法 → お礼"],
    ["予定を決める（1分）", "誘う → 都合を聞く → 時間と場所を決める"],
  ];
  return `<h2>到達チェック</h2><p class="muted">Day 1・30・60・90 に同じお題を録音して聞き比べます。上達が耳でわかるのが、続けるいちばんの燃料です。</p>
  ${tasks.map((t, i) => `<div class="card"><strong>${esc(t[0])}</strong><div class="muted">${esc(t[1])}</div>
    <table>${[1, 30, 60, 90].map(d => `<tr><td style="width:70px">Day ${d}</td><td>${recorderHtml(`check-${i}-${d}`, "録音")}</td></tr>`).join("")}</table></div>`).join("")}`;
};

// ---------- 参考教材：文型・文法・動詞副詞（中国語） ----------
const exHtml = e => `<div class="ex" data-target="${esc(e.zh)}"><div class="zh">${esc(e.zh)} ${spk(e.zh)}</div><div class="py">${esc(e.py)}</div><div class="ja">${esc(e.ja)}</div></div>`;
views.patterns = function (arg) {
  if (!window.PATTERNS) return "<p>この言語の文型はまだありません。</p>";
  const card = p => `<div class="card" id="${p.id}"><div class="row" style="justify-content:space-between"><span class="tag grey">${esc((G[p.grammar] || {}).title || "")}</span><span class="tag grey">Day ${PATTERNS.indexOf(p) + 15}</span></div>
    <div class="zh lg">${esc(p.zh)} ${p.py !== "—" ? spk(p.zh) : ""}</div><div class="py">${esc(p.py)}</div><div class="ja">${esc(p.ja)}</div>
    ${p.slots.length ? `<div class="slots">${p.slots.map(s => `<span>${esc(s[0])} <span class="py">${esc(s[1])}</span> <span class="ja">${esc(s[2])}</span></span>`).join("")}</div>` : ""}
    ${arg ? p.ex.map(exHtml).join("") : ""}
    <div class="row" style="margin-top:6px">${p.slots.length ? `<a class="btn" href="#/drill/${p.id}">入れ替えドリル</a>` : ""}<a class="btn" href="#/grammar/${p.grammar}">文法</a>${arg ? "" : `<a class="btn" href="#/patterns/${p.id}">例文</a>`}</div></div>`;
  if (arg && P[arg]) return `<p><a href="#/patterns">← 文型一覧</a></p>` + card(P[arg]);
  return `<h2>文型 ${PATTERNS.length}</h2><p class="muted">2ヶ月目の中心。「〜したい・〜した・〜してください・質問」などの型に語を入れ替えて、文ごと口に出します。Day 15〜64 に1日1つ。</p><div class="grid">${PATTERNS.map(card).join("")}</div>`;
};
views.grammar = function (arg) {
  if (!window.GRAMMAR) return "<p>この言語の文法地図はまだありません。</p>";
  const cats = [...new Set(GRAMMAR.map(g => g.cat))];
  return `<h2>文法の全体地図 ${GRAMMAR.length}</h2><p class="muted">文法は「説明を覚える」より「型として体に入れる」もの。最初に全体を眺めて、迷ったときに戻る地図として使います。</p>
  ${cats.map(c => `<h3>${esc(c)}</h3>${GRAMMAR.filter(g => g.cat === c).map(g => `<details id="${g.id}" ${g.id === arg ? "open" : ""}><summary>${esc(g.title)}</summary><div class="zh" style="font-size:17px;margin:6px 0">${esc(g.form)}</div><p>${esc(g.explain)}</p>${g.ex.map(exHtml).join("")}${g.pitfalls ? `<div class="notice">⚠ ${esc(g.pitfalls)}</div>` : ""}</details>`).join("")}`).join("")}`;
};
views.vocab = function () {
  if (!window.VOCAB) return "";
  const tbl = (rows, head) => `<table><tr><th>${head}</th><th>拼音</th><th>意味</th></tr>${rows.map(r => `<tr><td class="zh" style="font-size:19px">${esc(r[0])} ${spk(r[0])}</td><td class="py">${esc(r[1])}</td><td class="ja">${esc(r[2])}</td></tr>`).join("")}</table>`;
  return `<h2>よく使う動詞・副詞・言い回し</h2><p class="muted">意味リストと文型の中で何度も出てくる語の早見表です。</p>
  <h3>動詞 ${VOCAB.verbs.length}</h3><div class="card">${tbl(VOCAB.verbs, "動詞")}</div><h3>副詞 ${VOCAB.adverbs.length}</h3><div class="card">${tbl(VOCAB.adverbs, "副詞")}</div><h3>言い回し ${VOCAB.phrases.length}</h3><div class="card">${tbl(VOCAB.phrases, "言い回し")}</div>`;
};
let drill = null;
views.drill = function (arg) {
  const p = P[arg];
  if (!p || !p.slots.length) return `<p>ドリルできる文型を選んでください。</p><a class="btn" href="#/patterns">文型一覧</a>`;
  if (!drill || drill.id !== arg || drill.i >= drill.items.length) {
    const items = p.slots.map(s => {
      const parts = s[0].split(" / "), pys = s[1].split(" / "), jas = s[2].split("／"); let i = 0, j = 0, k = 0;
      return { zh: p.zh.replace(/〔[^〕]*〕/g, () => parts[Math.min(i++, parts.length - 1)]), py: p.py.replace(/\[[^\]]*\]/g, () => pys[Math.min(j++, pys.length - 1)]), ja: s[3] || p.ja.replace(/〔[^〕]*〕/g, () => jas[Math.min(k++, jas.length - 1)]) };
    }).concat(p.ex.filter(e => !e.zh.includes("\n")));
    drill = { id: arg, items, i: 0, shown: false };
  }
  const it = drill.items[drill.i];
  return `<h2>入れ替えドリル <span class="tag">${drill.i + 1} / ${drill.items.length}</span></h2><p class="muted">型：${esc(p.zh)}</p>
  <div class="card flash" data-target="${esc(it.zh)}"><div class="q">${esc(it.ja)}</div>
    <div style="min-height:80px;margin-top:12px">${drill.shown ? `<div class="zh lg">${esc(it.zh)} ${spk(it.zh)}</div><div class="py">${esc(it.py)}</div>` : ""}</div>
    <div class="row" style="justify-content:center">${drill.shown ? `${micBtn()}<button class="ok" id="dNext">次へ</button>` : `<button class="primary" id="dShow">答え</button>`}</div><div class="result"></div></div>`;
};

// ---------- 画面：このプログラムについて ----------
views.about = function () {
  const byPri = p => MEANINGS.filter(m => m.pri === p).length;
  return `<h2>このプログラムについて</h2>
  <div class="card"><h3 style="margin-top:0">3ヶ月後の約束</h3>
    <p><strong>ネイティブと10〜15分、自分のことと日常の話ができる（CEFR A2前後）。</strong>「ペラペラ」は約束しません。</p>
    <p class="muted">米国務省FSIの目安では、英語話者がフランス語で実務レベルに届くまで約600〜750時間、日本語・中国語では約2,200時間かかります。90時間で流暢さは現実的ではありません。そのかわり、よく使う上位1,000語で日常会話の約8割をカバーできるので、「知っている語」より「使える語」を1,000〜1,500語、決まり文句を300〜500身につけることを目指します。</p>
    <p class="muted">母語から遠い言語は到達点を一段下げて表示します。${esc(LANG.name)}の目標は「${esc(LANG.goal)}」です。</p></div>
  <div class="card"><h3 style="margin-top:0">90日の設計</h3>
    <table><tr><th>期間</th><th>目標</th><th>中心の練習</th></tr>
    <tr><td>1ヶ月目</td><td>${esc(monthGoal(1))}</td><td>発音（音トップ10）、シャドーイング、フレーズの暗唱。★★★ ${byPri(3)}項目</td></tr>
    <tr><td>2ヶ月目</td><td>${esc(monthGoal(2))}</td><td>型の入れ替え、独り言、短い作文を声に出す。★★ ${byPri(2)}項目</td></tr>
    <tr><td>3ヶ月目</td><td>${esc(monthGoal(3))}</td><td>週2回の会話セッション、録音して振り返り。★ ${byPri(1)}項目</td></tr></table>
    <h3>毎日の60分</h3><ol>${BLOCKS.map(b => `<li>${b.min}分：${esc(b.name)} — ${esc(b.what)}</li>`).join("")}</ol>
    <p class="muted">毎日の「話す20分」はAIとの音声会話で担保し、ネイティブとの会話は3ヶ月目に週2回。独学の失敗は、インプットだけで3ヶ月が過ぎることです。</p></div>
  <div class="card"><h3 style="margin-top:0">日本人向けに特化しているところ</h3><table>
    <tr><th></th><th>ポイント</th><th>このプログラムでの対処</th></tr>
    <tr><td>弱み</td><td>話すことへの心理的ブレーキ</td><td>1ヶ月目はAI相手や独り言で大量に口を動かし、3ヶ月目に人との会話へ。評価は「完璧な文」でなく「通じる短い文」（発話判定は6割一致で合格）。</td></tr>
    <tr><td>弱み</td><td>母音5つ・子音の後に必ず母音</td><td>「日本人がつまずく音トップ10」を Day 1〜10 で1つずつ、Day 11〜14 で聞き分けテスト。</td></tr>
    <tr><td>弱み</td><td>語順（SOV と SVO）</td><td>文法説明より「主語＋動詞を先に言い切り、残りは後から足す」型として練習。</td></tr>
    <tr><td>強み</td><td>${LANG.code === "zh" ? "漢字" : "カタカナ語"}が橋になる</td><td>「実はもう知っている語」から始め、初日から自信をつける。${esc(LANG.strength)}。</td></tr></table></div>
  <div class="card"><h3 style="margin-top:0">意味リスト</h3><p>日本人が実際に口にしたくなる「言いたいこと」${MEANINGS.length}項目を、会話の役割で7カテゴリに分けています。言語に依存しない共通の土台で、各言語に訳して横展開します。</p>
    <table>${CATS.map(c => `<tr><td>${esc(c.name)}</td><td>${MEANINGS.filter(m => m.cat === c.id).length}</td></tr>`).join("")}</table>
    <p class="muted">差し替え単語 ${Object.values(LANG.slots || {}).reduce((a, b) => a + b.length, 0)}語・自分専用スロット ${MEANINGS.filter(m => m.self).length}項目。${EMBED ? "" : '<a href="data/meanings.csv" download>CSV</a>'}</p></div>
  <div class="card"><h3 style="margin-top:0">記録について</h3><p class="muted">学習記録と録音は、この端末のブラウザの中にだけ保存されます。サーバーには送りません。</p>
    <div class="row">${EMBED ? "" : '<button class="small" id="exportBtn">記録を書き出す</button>'}<label class="btn small">記録を読み込む<input type="file" id="importFile" accept="application/json" hidden></label><button class="small" id="resetBtn">記録をリセット</button><button class="small" id="resetYes" hidden>本当に消す（録音は残ります）</button></div></div>`;
};

// ---------- ピンインを声調で色分け ----------
const TONE = {};
"āēīōūǖĀĒĪŌŪǕ".split("").forEach(c => TONE[c] = 1); "áéíóúǘÁÉÍÓÚǗ".split("").forEach(c => TONE[c] = 2);
"ǎěǐǒǔǚǍĚǏǑǓǙ".split("").forEach(c => TONE[c] = 3); "àèìòùǜÀÈÌÒÙǛ".split("").forEach(c => TONE[c] = 4);
const V = "aeiouüvāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜAEIOUÜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ";
const SYL = new RegExp(`(?:[Zz]h|[Cc]h|[Ss]h|[bpmfdtnlgkhjqxrzcsywBPMFDTNLGKHJQXRZCSYW])?[${V}]+(?:ng(?![${V}])|n(?![${V}]))?(?:r(?![${V}]))?`, "g");
function colorPy(text) {
  return esc(text).replace(new RegExp(`[A-Za-z${V}]+`, "g"), w => {
    const parts = w.match(SYL);
    if (!parts || parts.join("") !== w) return w;
    return parts.map(p => { const t = [...p].map(c => TONE[c]).find(Boolean) || 5; return `<span class="t${t}">${p}</span>`; }).join("");
  });
}
function paintTones(root) { root.querySelectorAll(".py").forEach(el => { if (!el.dataset.toned) { el.innerHTML = colorPy(el.textContent); el.dataset.toned = 1; } }); }
const toneLegend = `<div class="tone-legend"><span class="t1">1声 ā</span><span class="t2">2声 á</span><span class="t3">3声 ǎ</span><span class="t4">4声 à</span><span class="t5">軽声 a</span></div>`;

// ---------- ルーティング ----------
function route() {
  const h = location.hash.replace(/^#\/?/, "") || "today";
  const [name, arg, arg2] = h.split("/");
  const fn = views[name] || views.today;
  if (name !== "listen") speechSynthesis && speechSynthesis.cancel && speechSynthesis.cancel();
  app.innerHTML = fn(arg, arg2);
  paintTones(app);
  const navName = ["review", "listen", "speak", "memo"].includes(name) ? "today" : name;
  $$("#nav a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#/" + navName));
  window.scrollTo(0, 0);
  if (window.trackPageView) trackPageView("/" + name, document.title);
  bind(name, arg, arg2);
}
function goToday() { location.hash = "#/today"; if (location.hash === "#/today") route(); }

function bind(name, arg) {
  bindRecorders();
  const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
  on("#startBtn", () => { S.started = today(); S.day = 1; save(); introduce(1); location.hash = "#/today"; route(); });
  $$("[data-goto]").forEach(b => b.onclick = () => { S.day = parseInt(b.dataset.goto, 10); save(); location.hash = "#/today"; route(); });
  $$("[data-block]").forEach(b => b.onclick = () => {
    const d = b.dataset.day, k = b.dataset.block; S.blocks[d] = S.blocks[d] || {};
    if (S.blocks[d][k] && !b.dataset.back) delete S.blocks[d][k]; else S.blocks[d][k] = 1;
    save(); if (b.dataset.back) location.hash = "#/today" + (parseInt(d, 10) === S.day ? "" : "/" + d); else route();
  });
  on("#finishDay", () => {
    S.finished[S.day] = today(); S.log[today()] = (S.log[today()] || 0) + 1;
    if (window.trackConversion) trackConversion("app_action_complete", { site: "lang90", action: "day_complete", day: S.day, lang: LANG.code });
    if (S.day < 90) { S.day++; introduce(S.day); }
    deck = null; save(); toast(S.day === 90 && S.finished[90] ? "90日完走です！" : `Day ${S.day} へ進みました`); route();
  });
  // 復習
  on("#reveal", () => { deck.shown = true; route(); });
  on("#again", () => { deck = null; route(); });
  $$("[data-grade]").forEach(b => b.onclick = () => {
    const id = deck.ids[deck.i], ok = b.dataset.grade === "1"; grade(id, ok);
    if (ok) deck.ok++; else { deck.ng++; deck.ids.push(id); }
    deck.i++; deck.shown = false; route();
  });
  on("#memoSave", () => { const id = deck.ids[deck.i], f = cardFace(id); if (f && f.memo) { f.memo.zh = $("#memoZh").value.trim(); f.memo.py = $("#memoPy").value.trim(); save(); route(); } });
  // 聞く
  on("#playAll", () => { const d = DAYS[parseInt(arg || S.day, 10) - 1]; playSeq(d.items.flatMap(no => { const t = textOf(no).audio; return [t, t]; }), 1.3); });
  const sc = name === "listen" ? (window.SCENES || {})[DAYS[parseInt(arg || S.day, 10) - 1].scene] : null;
  on("#playScene", () => sc && playSeq(sc.lines.map(l => l[1]), 0.3));
  on("#playSceneA", async () => { if (!sc) return; for (const l of sc.lines) { if (l[0] === "A") { await speak(l[1]); await new Promise(r => setTimeout(r, 400)); } else { toast("あなたの番：" + l[3]); await new Promise(r => setTimeout(r, Math.max(2500, l[1].length * 450))); } } });
  // メモ
  on("#mAdd", () => { const ja = $("#mJa").value.trim(); if (!ja) return toast("日本語を入力してください"); const id = Date.now().toString(36); const day = parseInt(arg || S.day, 10);
    S.memos.push({ id, ja, zh: $("#mZh").value.trim(), py: $("#mPy").value.trim(), day }); S.srs["x:" + id] = { box: 0, due: addDays(today(), 1), intro: day + 1 }; save(); route(); });
  $$("[data-delmemo]").forEach(b => b.onclick = () => { const id = b.dataset.delmemo; S.memos = S.memos.filter(m => m.id !== id); delete S.srs["x:" + id]; save(); route(); });
  // 意味リスト
  $$("#catChips [data-cat]").forEach(b => b.onclick = () => { listFilter.cat = b.dataset.cat; route(); });
  $$("#priChips [data-pri]").forEach(b => b.onclick = () => { listFilter.pri = parseInt(b.dataset.pri, 10); route(); });
  const q = $("#q"); if (q) q.onchange = () => { listFilter.q = q.value.trim(); route(); };
  // わたしの答え
  $$("[data-pick]").forEach(b => b.onclick = () => { const e = JSON.parse(b.dataset.pick), card = b.closest("[data-me]"); card.querySelector(".meJa").value = e[0]; card.querySelector(".meZh").value = e[1]; card.querySelector(".mePy").value = e[2]; });
  on("#meSave", () => { $$("[data-me]").forEach(c => { const no = c.dataset.me, ja = c.querySelector(".meJa").value.trim(), zh = c.querySelector(".meZh").value.trim(), py = c.querySelector(".mePy").value.trim(); if (ja || zh) S.me[no] = { ja, zh, py }; else delete S.me[no]; }); save(); toast("保存しました"); route(); });
  // 聞き分け
  if (name === "quiz") {
    const q = quiz.q; const play = r => speak(q.ans[0], r);
    on("#qPlay", () => play()); on("#qSlow", () => play(0.6)); setTimeout(() => play(), 300);
    $$("[data-opt]").forEach(b => b.onclick = () => {
      if (q.picked) return; q.picked = true; quiz.n++;
      const right = q.set[parseInt(b.dataset.opt, 10)] === q.ans; if (right) quiz.ok++;
      $$("[data-opt]").forEach(x => { if (q.set[parseInt(x.dataset.opt, 10)] === q.ans) x.classList.add("right"); });
      if (!right) b.classList.add("wrong");
      $("#qRes").className = "result " + (right ? "good" : "bad"); $("#qRes").textContent = right ? "正解！" : `正解は ${q.ans[0]}（${q.ans[1]}）`;
      $("#qNext").hidden = false;
    });
    on("#qNext", () => route());
  }
  // ドリル
  on("#dShow", () => { drill.shown = true; route(); });
  on("#dNext", () => { drill.i++; drill.shown = false; if (drill.i >= drill.items.length) { drill = null; toast("ドリル完了"); location.hash = "#/patterns"; } else route(); });
  // 記録
  on("#exportBtn", () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: "application/json" })); a.download = `lang90-${LANG.code}-${today()}.json`; a.click(); });
  const imp = $("#importFile"); if (imp) imp.onchange = async () => { try { const v = JSON.parse(await imp.files[0].text()); S = Object.assign(blank(), v); save(); toast("読み込みました"); route(); } catch (e) { toast("読み込めませんでした"); } };
  on("#resetBtn", () => { const y = $("#resetYes"); y.hidden = false; $("#resetBtn").textContent = "やめる"; $("#resetBtn").onclick = () => route(); });
  on("#resetYes", () => { S = Object.assign(blank(), { pinyin: S.pinyin, theme: S.theme }); save(); deck = null; goToday(); });
}

window.addEventListener("hashchange", route);
if ("speechSynthesis" in window) { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; }
if ("serviceWorker" in navigator && location.protocol === "https:") { navigator.serviceWorker.register("sw.js").catch(() => {}); }
route();
})();
