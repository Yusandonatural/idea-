import { countFor } from './textlen.js';
import { appendTags, autoTagsFor, parseTags, withAutoTags } from './hashtags.js';
import { problems as ruleProblems, skippedNote, mediaFor as ruleMediaFor } from './rules.js';
import { PILLARS, pillarOf, SEASONS, WEEKLY, withUtm } from './plan.js';
import { isBuzz, scoreItems, searchLinks, SORTS } from './buzz.js';
import { METRICS } from './insights.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const state = {
  platforms: {},
  accounts: [],
  body: '',
  media: [],              // {key,type,size,alt,url,uploading}
  targets: new Map(),     // accountId -> {on, custom, body, title}
  ai: { ai_enabled: false },
  hashtags: [],
  pillar: null,
  editingId: null,
};

async function api(path, opts = {}) {
  const init = { ...opts, headers: { ...(opts.headers || {}) } };
  if (opts.json !== undefined) {
    init.body = JSON.stringify(opts.json);
    init.headers['content-type'] = 'application/json';
  }
  const res = await fetch('/api' + path, init);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') {
    showLogin();
    throw new Error('ログインしてください');
  }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2500);
}

async function busy(btn, fn) {
  btn.disabled = true;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
  }
}

const fmt = (ms) => ms ? new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const STATUS = { draft: '下書き', scheduled: '予約', publishing: '公開中…', done: '公開済み', partial: '一部失敗', failed: '失敗' };
const isVideo = (m) => (m.type || '').startsWith('video/');
const newTarget = (on) => ({ on, custom: false, body: '', title: '' });

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('コピーしました');
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('コピーしました');
  }
}

const dot = (pid) => `<span class="dot" style="background:${state.platforms[pid]?.color || '#999'}"></span>`;

// ── ログイン ──
function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  loadAuthConfig().catch(() => {});
}

// 合言葉（オーナー用の予備）
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  try {
    await api('/login', { method: 'POST', json: { password: e.target.password.value } });
    e.target.password.value = '';
    await start();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

// Google でログイン（Firebase Authentication。90日外国語アプリと同じプロジェクト）
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/12.19.0';
let authConfig = null;
let firebase = null;

async function loadAuthConfig() {
  if (!authConfig) authConfig = await (await fetch('/api/auth-config')).json();
  $('#pw-login').hidden = !authConfig.password_login;
  $('#google-login').hidden = !authConfig.firebase;
  return authConfig;
}

async function firebaseAuth() {
  if (firebase) return firebase;
  const cfg = await loadAuthConfig();
  const [{ initializeApp }, mod] = await Promise.all([import(`${FIREBASE_SDK}/firebase-app.js`), import(`${FIREBASE_SDK}/firebase-auth.js`)]);
  firebase = { auth: mod.getAuth(initializeApp(cfg.firebase, 'sns-hub')), mod };
  return firebase;
}

const GOOGLE_ERRORS = {
  'auth/unauthorized-domain': 'このURLが Firebase の「承認済みドメイン」に入っていません。管理者に追加してもらってください（README の「Google ログイン」）',
  'auth/popup-blocked': 'ログイン用の小さな画面がブロックされました。ポップアップを許可してもう一度押してください',
  'auth/network-request-failed': '通信できませんでした。接続を確かめてもう一度お試しください',
};

$('#google-login').addEventListener('click', async (e) => {
  $('#login-error').textContent = '';
  await busy(e.currentTarget, async () => {
    try {
      const { auth, mod } = await firebaseAuth();
      const provider = new mod.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await mod.signInWithPopup(auth, provider);
      const idToken = await cred.user.getIdToken();
      // このアプリのログインに切り替えたら、Firebase 側のログインは残さない
      await mod.signOut(auth);
      await api('/login/google', { method: 'POST', json: { idToken } });
      await start();
    } catch (err) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
      const loadFailed = !err?.code && /import|module/i.test(err?.message || '');
      $('#login-error').textContent = loadFailed ? 'Google ログインの部品を読み込めませんでした。通信を確かめて、もう一度押してください' : GOOGLE_ERRORS[err?.code] || err.message;
      if (loadFailed) firebase = null;
    }
  });
});

$('#logout').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' });
  showLogin();
});

// ── タブ ──
function showTab(name) {
  for (const b of document.querySelectorAll('nav button')) b.classList.toggle('active', b.dataset.tab === name);
  for (const s of document.querySelectorAll('main > section')) s.hidden = s.id !== `tab-${name}`;
  if (name === 'queue') loadPosts('queue');
  if (name === 'history') loadPosts('history');
  if (name === 'accounts') {
    renderAccounts();
    if (isAdmin()) loadMembers();
  }
  if (name === 'calendar') renderCalendar();
  if (name === 'hashtags') renderHashtagTab();
  if (name === 'research') loadResearch();
}

const isAdmin = () => state.user?.role === 'admin';
for (const b of document.querySelectorAll('nav button')) b.addEventListener('click', () => showTab(b.dataset.tab));

// ── 投稿画面 ──
const bodyEl = $('#body');
bodyEl.addEventListener('input', () => {
  state.body = bodyEl.value;
  renderTargets();
});

function renderMedia() {
  $('#media').innerHTML = state.media.map((m, i) => `
    <div class="thumb ${m.uploading ? 'loading' : ''}">
      ${isVideo(m) ? `<video src="${esc(m.url)}" muted playsinline preload="metadata"></video><span class="badge-video">動画</span>` : `<img src="${esc(m.url)}" alt="">`}
      <button class="x" data-remove="${i}" title="外す">✕</button>
      <input data-alt="${i}" placeholder="代替テキスト" value="${esc(m.alt)}">
    </div>`).join('');
}

$('#media').addEventListener('click', (e) => {
  const i = e.target.dataset.remove;
  if (i !== undefined) {
    state.media.splice(Number(i), 1);
    renderMedia();
    renderTargets();
  }
});
$('#media').addEventListener('input', (e) => {
  const i = e.target.dataset.alt;
  if (i !== undefined) state.media[Number(i)].alt = e.target.value;
});

$('#file').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  for (const file of files) {
    const item = { url: URL.createObjectURL(file), type: file.type, alt: '', uploading: true };
    state.media.push(item);
    renderMedia();
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api('/media', { method: 'POST', body: fd });
      Object.assign(item, r, { url: item.url, uploading: false });
    } catch (err) {
      state.media.splice(state.media.indexOf(item), 1);
      toast(err.message);
    }
    renderMedia();
    renderTargets();
  }
});

// サーバーと同じルール（public/rules.js）で、送るファイル・問題点・送られないファイルを見る
const mediaFor = (platformId) => ruleMediaFor(state.platforms[platformId].limits, state.media);
const problems = (platformId, text, title) => ruleProblems(platformId, state.platforms[platformId].limits, text, state.media.filter((m) => m.type), title);
const skipped = (platformId) => skippedNote(state.platforms[platformId].limits, state.media);

// 送る直前の本文（サーバーの finalText と同じ：UTM → 自動ハッシュタグ）
function finalText(platformId, text) {
  const base = state.ai.utm ? withUtm(platformId, text, { campaign: state.pillar || 'sns' }) : text;
  return withAutoTags(platformId, base, state.hashtags, state.platforms[platformId].limits.text);
}

function renderTargets() {
  const el = $('#targets');
  $('#no-accounts').hidden = state.accounts.length > 0;
  el.innerHTML = state.accounts.filter((a) => a.enabled).map((a) => {
    const t = state.targets.get(a.id) ?? newTarget(false);
    const p = state.platforms[a.platform];
    const own = t.custom ? t.body : state.body;
    const autos = t.on ? autoTagsFor(a.platform, own, state.hashtags, p.limits.text) : [];
    const text = finalText(a.platform, own);
    const n = countFor(a.platform, text);
    const probs = t.on ? problems(a.platform, text, t.title) : [];
    const skip = t.on ? skipped(a.platform) : '';
    const titleLabel = a.platform === 'newsletter' ? '件名' : 'タイトル';
    return `
      <div class="target ${t.on ? '' : 'off'}" data-id="${a.id}" style="--pc:${p.color}">
        <div class="target-head">
          <input type="checkbox" data-on ${t.on ? 'checked' : ''} id="t${a.id}">
          ${dot(a.platform)}
          <label for="t${a.id}" class="name" style="margin:0;color:var(--ink)">${esc(a.name)} <span class="muted small">${esc(p.label)}</span></label>
          <span class="count ${n > p.limits.text ? 'over' : ''}">${n} / ${p.limits.text}</span>
          ${t.on ? `<button class="ghost small" data-custom>${t.custom ? '共通に戻す' : '個別に編集'}</button>` : ''}
        </div>
        ${t.on && p.limits.title ? `<input class="title-input" data-title placeholder="${titleLabel}（${p.limits.title}字まで。空欄なら本文の1行目）" value="${esc(t.title)}">` : ''}
        ${t.on && t.custom ? `<textarea data-body>${esc(t.body)}</textarea>` : ''}
        ${probs.length ? `<div class="warn-text">⚠ ${probs.join('・')}</div>` : ''}
        ${autos.length ? `<div class="auto-tags">＋ 自動で付くタグ：${autos.map(esc).join(' ')}</div>` : ''}
        ${skip ? `<div class="info-text">${esc(skip)}</div>` : ''}
        ${t.on && p.note ? `<div class="muted small">${esc(p.note)}</div>` : ''}
      </div>`;
  }).join('');
}

$('#targets').addEventListener('change', (e) => {
  const id = Number(e.target.closest('.target')?.dataset.id);
  if (e.target.matches('[data-on]')) {
    const t = state.targets.get(id) ?? newTarget(false);
    t.on = e.target.checked;
    state.targets.set(id, t);
    renderTargets();
  }
});
$('#targets').addEventListener('click', (e) => {
  if (!e.target.matches('[data-custom]')) return;
  const id = Number(e.target.closest('.target').dataset.id);
  const t = state.targets.get(id);
  t.custom = !t.custom;
  if (t.custom && !t.body) t.body = state.body;
  renderTargets();
});
$('#targets').addEventListener('input', (e) => {
  if (e.target.matches('[data-title]')) {
    state.targets.get(Number(e.target.closest('.target').dataset.id)).title = e.target.value;
    return;
  }
  if (!e.target.matches('[data-body]')) return;
  const id = Number(e.target.closest('.target').dataset.id);
  state.targets.get(id).body = e.target.value;
  // 入力中のカーソルを保つため、数字と警告だけ更新する
  const box = e.target.closest('.target');
  const a = state.accounts.find((x) => x.id === id);
  const p = state.platforms[a.platform];
  const n = countFor(a.platform, finalText(a.platform, e.target.value));
  const c = $('.count', box);
  c.textContent = `${n} / ${p.limits.text}`;
  c.classList.toggle('over', n > p.limits.text);
});

const useSchedule = $('#use-schedule');
useSchedule.addEventListener('change', () => {
  $('#scheduled-at').hidden = !useSchedule.checked;
  $('#post-schedule').hidden = !useSchedule.checked;
  $('#post-now').hidden = useSchedule.checked;
  if (useSchedule.checked && !$('#scheduled-at').value) $('#scheduled-at').value = localInput(Date.now() + 3600_000);
});

function localInput(ms) {
  const d = new Date(ms);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function payload(mode) {
  return {
    mode,
    body: state.body,
    media: state.media.filter((m) => m.key).map(({ key, type, size, alt }) => ({ key, type, size, alt })),
    targets: [...state.targets.entries()]
      .filter(([id, t]) => t.on && state.accounts.some((a) => a.id === id && a.enabled))
      .map(([id, t]) => ({ account_id: id, body: t.custom ? t.body : null, title: t.title || null })),
    scheduled_at: mode === 'schedule' ? new Date($('#scheduled-at').value).toISOString() : null,
    pillar: state.pillar,
  };
}

async function submit(mode, btn) {
  $('#compose-error').textContent = '';
  if (state.media.some((m) => m.uploading)) return toast('画像のアップロード中です');
  const data = payload(mode);
  if (mode === 'now' && !confirm(`${data.targets.length}件のSNSに今すぐ投稿します。よろしいですか？`)) return;
  await busy(btn, async () => {
    try {
      const path = state.editingId ? `/posts/${state.editingId}` : '/posts';
      const post = await api(path, { method: state.editingId ? 'PATCH' : 'POST', json: data });
      resetCompose();
      if (mode === 'now') showResult(post);
      else toast(mode === 'schedule' ? `${fmt(post.scheduled_at)} に予約しました` : '下書きを保存しました');
    } catch (err) {
      $('#compose-error').textContent = err.message;
    }
  });
}
$('#post-now').addEventListener('click', (e) => submit('now', e.currentTarget));
$('#post-schedule').addEventListener('click', (e) => submit('schedule', e.currentTarget));
$('#post-draft').addEventListener('click', (e) => submit('draft', e.currentTarget));

function resetCompose() {
  state.body = '';
  state.media = [];
  state.editingId = null;
  for (const t of state.targets.values()) {
    t.custom = false;
    t.body = '';
    t.title = '';
  }
  bodyEl.value = '';
  setPillar(null);
  useSchedule.checked = false;
  useSchedule.dispatchEvent(new Event('change'));
  $('#editing-banner').hidden = true;
  renderMedia();
  renderTargets();
}
$('#cancel-edit').addEventListener('click', resetCompose);

// 予約・下書きの編集、または過去の投稿の複製
function loadIntoCompose(post, asCopy) {
  state.editingId = asCopy ? null : post.id;
  state.body = post.body;
  bodyEl.value = post.body;
  state.media = post.media.map((m) => ({ ...m, url: `/m/${m.key}` }));
  state.lastPost = post;
  setPillar(post.pillar ?? null);
  state.targets = new Map();
  for (const t of post.targets) state.targets.set(t.account_id, { on: true, custom: t.body != null, body: t.body ?? '', title: t.title ?? '' });
  const scheduled = !asCopy && post.status === 'scheduled';
  useSchedule.checked = scheduled;
  useSchedule.dispatchEvent(new Event('change'));
  if (scheduled) $('#scheduled-at').value = localInput(post.scheduled_at);
  $('#editing-banner').hidden = asCopy;
  $('#editing-label').textContent = `${STATUS[post.status]}を編集中`;
  renderMedia();
  renderTargets();
  showTab('compose');
}

function showResult(post) {
  $('#dialog-body').innerHTML = `
    <h2>${post.status === 'done' ? '✅ すべて投稿しました' : post.status === 'partial' ? '⚠ 一部が失敗しました' : '❌ 投稿できませんでした'}</h2>
    ${post.targets.map((t) => `
      <div class="result-row">
        ${dot(t.platform)}
        <div class="msg"><b>${esc(t.account_name)}</b><br>
          ${t.status === 'ok' ? (t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">投稿を開く</a>` : '送信しました')
            : t.status === 'manual' ? `文章を用意しました。<button class="small" data-copy="${t.id}">コピー</button>${t.url ? ` <a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.account_name)}を開く</a>` : ''}`
            : `<span class="error">${esc(t.error)}</span>`}
        </div>
      </div>`).join('')}
    ${post.status !== 'done' ? '<p class="muted small">失敗した分は「履歴」から再試行できます。</p>' : ''}`;
  copySource = post;
  $('#dialog').showModal();
}

// note・メルマガなど手で貼る先の文章（タイトル＋本文）
let copySource = null;
function manualText(post, t) {
  const body = t.sent ?? t.body ?? post.body;
  const title = t.title || '';
  return title ? `${title}\n\n${body}` : body;
}
$('#dialog').addEventListener('click', (e) => {
  const id = e.target.dataset?.copy;
  if (!id || !copySource) return;
  const t = copySource.targets.find((x) => String(x.id) === id);
  copyText(manualText(copySource, t));
});

// ── 予約・履歴 ──
async function loadPosts(kind) {
  const el = $(`#${kind}-list`);
  el.innerHTML = '<p class="empty">読み込み中…</p>';
  const posts = await api(`/posts?status=${kind}`);
  if (!posts.length) {
    el.innerHTML = `<p class="empty">${kind === 'queue' ? '予約・下書きはありません' : 'まだ投稿がありません'}</p>`;
    return;
  }
  el.innerHTML = posts.map((p) => {
    const errors = p.targets.filter((t) => t.status === 'error');
    const when = p.status === 'scheduled' ? `🕒 ${fmt(p.scheduled_at)}` : p.published_at ? fmt(p.published_at) : `更新 ${fmt(p.updated_at)}`;
    return `
      <article class="post" data-id="${p.id}">
        <div class="post-meta"><span class="status ${p.status}">${STATUS[p.status]}</span>${pillarBadge(p.pillar)}<span>${when}</span>${p.updated_by ? `<span class="by">${p.created_by && p.created_by !== p.updated_by ? `作成 ${esc(p.created_by)}・` : ''}${p.created_by === p.updated_by ? '作成' : '更新'} ${esc(p.updated_by)}</span>` : ''}</div>
        <div class="post-body">${esc(p.body) || '<span class="muted">（本文なし）</span>'}</div>
        ${p.media.length ? `<div class="media">${p.media.map((m) => `<div class="thumb">${isVideo(m) ? `<video src="/m/${esc(m.key)}" muted preload="metadata"></video><span class="badge-video">動画</span>` : `<img src="/m/${esc(m.key)}" alt="${esc(m.alt)}" loading="lazy">`}</div>`).join('')}</div>` : ''}
        <div class="post-targets">${p.targets.map((t) => {
          const icon = t.status === 'ok' ? '✓' : t.status === 'error' ? '✕' : '';
          const inner = `${dot(t.platform)}${esc(t.account_name)} ${icon}`;
          if (t.status === 'manual') return `<span class="chip manual">${inner}<button data-act="copy-text" data-target="${t.id}">コピー</button>${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">開く</a>` : ''}</span>`;
          return t.url ? `<a class="chip ok" href="${esc(t.url)}" target="_blank" rel="noopener">${inner}</a>` : `<span class="chip ${t.status}">${inner}</span>`;
        }).join('')}</div>
        ${errors.length ? `<div class="post-errors">${errors.map((t) => `${esc(t.account_name)}：${esc(t.error)}`).join('\n')}</div>` : ''}
        ${kind === 'history' && ['done', 'partial'].includes(p.status) ? reviewBlock(p) : ''}
        <div class="post-actions">
          ${['draft', 'scheduled'].includes(p.status) ? '<button class="small" data-act="edit">編集</button><button class="small primary" data-act="publish">今すぐ投稿</button>' : ''}
          ${['partial', 'failed'].includes(p.status) ? '<button class="small primary" data-act="publish">失敗分を再試行</button>' : ''}
          <button class="small ghost" data-act="copy">複製</button>
          ${p.status !== 'publishing' ? '<button class="small ghost danger" data-act="delete">削除</button>' : ''}
        </div>
      </article>`;
  }).join('');
  el._posts = Object.fromEntries(posts.map((p) => [p.id, p]));
}

for (const kind of ['queue', 'history']) {
  $(`#${kind}-list`).addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = Number(btn.closest('.post').dataset.id);
    const post = $(`#${kind}-list`)._posts[id];
    const act = btn.dataset.act;
    if (act === 'copy-text') return copyText(manualText(post, post.targets.find((t) => String(t.id) === btn.dataset.target)));
    if (act === 'metrics') return openMetrics(post.targets.find((t) => String(t.id) === btn.dataset.target), () => loadPosts(kind));
    if (act === 'idea') return useIdea(post.review.idea);
    if (act === 'review') {
      const label = btn.textContent;
      btn.textContent = state.ai.ai_enabled ? '反応を集めて、ふりかえっています…' : '反応を集めています…';
      await busy(btn, async () => {
        try {
          const r = await api(`/posts/${id}/review`, { method: 'POST' });
          toast(r.review_error || (state.ai.ai_enabled ? 'ふりかえりました' : '数字を更新しました（AIのふりかえりは ANTHROPIC_API_KEY を設定すると使えます）'));
        } catch (err) {
          toast(err.message);
        }
      });
      btn.textContent = label;
      loadLastReview();
      return loadPosts(kind);
    }
    if (act === 'edit') return loadIntoCompose(post, false);
    if (act === 'copy') return loadIntoCompose(post, true);
    if (act === 'delete') {
      const extra = post.targets.some((t) => t.status === 'ok') ? '\n（SNS上の投稿は消えません。この管理画面の記録だけ削除します）' : '';
      if (!confirm('この投稿を削除しますか？' + extra)) return;
      await api(`/posts/${id}`, { method: 'DELETE' });
      toast('削除しました');
      return loadPosts(kind);
    }
    if (act === 'publish') {
      if (!confirm('今すぐ投稿しますか？')) return;
      await busy(btn, async () => {
        try {
          showResult(await api(`/posts/${id}/publish`, { method: 'POST' }));
        } catch (err) {
          toast(err.message);
        }
      });
      loadPosts(kind);
    }
  });
}

// ── アカウント ──
function renderAccounts() {
  const el = $('#account-list');
  el.innerHTML = state.accounts.length ? state.accounts.map((a) => `
    <div class="account" data-id="${a.id}">
      ${dot(a.platform)}
      <div class="info">
        <b>${esc(a.name)}</b><small>${esc(state.platforms[a.platform]?.label)}${a.enabled ? '' : '・停止中'}</small>
        ${a.last_error ? `<p class="error">${esc(a.last_error)}</p>` : ''}
      </div>
      <button class="small" data-act="verify">接続テスト</button>
      <button class="small admin-only" data-act="rename">名前</button>
      <button class="small admin-only" data-act="creds">鍵を更新</button>
      <button class="small admin-only" data-act="toggle">${a.enabled ? '停止' : '再開'}</button>
      <button class="small ghost danger admin-only" data-act="delete">削除</button>
    </div>`).join('') : '';
}

$('#account-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = Number(btn.closest('.account').dataset.id);
  const a = state.accounts.find((x) => x.id === id);
  const act = btn.dataset.act;
  try {
    if (act === 'verify') {
      await busy(btn, async () => toast(`接続OK：${(await api(`/accounts/${id}/verify`, { method: 'POST' })).name}`));
    } else if (act === 'rename') {
      const name = prompt('表示名', a.name);
      if (name) await api(`/accounts/${id}`, { method: 'PATCH', json: { name } });
    } else if (act === 'creds') {
      openAccountForm(a.platform, a);
      return;
    } else if (act === 'toggle') {
      await api(`/accounts/${id}`, { method: 'PATCH', json: { enabled: !a.enabled } });
    } else if (act === 'delete') {
      if (!confirm(`${a.name} を削除しますか？（このアカウント宛ての予約・履歴も消えます）`)) return;
      await api(`/accounts/${id}`, { method: 'DELETE' });
    }
  } catch (err) {
    toast(err.message);
  }
  await loadAccounts();
  renderAccounts();
});

let formPlatform = null;
let formAccount = null;

function renderPicker() {
  $('#platform-picker').innerHTML = Object.values(state.platforms).map((p) =>
    `<button data-pid="${p.id}" class="${formPlatform === p.id && !formAccount ? 'active' : ''}">${dot(p.id)}${esc(p.label)}</button>`).join('');
}
$('#platform-picker').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pid]');
  if (b) openAccountForm(b.dataset.pid, null);
});

function openAccountForm(pid, account) {
  formPlatform = pid;
  formAccount = account;
  const p = state.platforms[pid];
  const form = $('#account-form');
  form.hidden = false;
  $('#account-error').textContent = '';
  $('#account-note').textContent = account ? `${account.name}（${p.label}）の鍵を更新します。空欄の項目は今の値のままです。` : (p.fields.length ? p.note || '' : `${p.note}（鍵の設定は不要です）`);
  $('#account-fields').innerHTML = p.fields.map((f) => `
    <label>${esc(f.label)}${f.optional ? '（任意）' : ''}
      ${f.options
        ? `<select name="${f.key}">${f.options.map(([v, label]) => `<option value="${esc(v)}" ${v === f.default ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`
        : `<input name="${f.key}" type="${f.secret ? 'password' : 'text'}" placeholder="${esc(f.placeholder || '')}" autocomplete="off" ${f.optional || account ? '' : 'required'}>`}
    </label>
    ${f.help ? `<p class="help">${esc(f.help)}</p>` : ''}`).join('');
  form.display_name.parentElement.hidden = !!account;
  form.querySelector('button').textContent = account ? '接続して更新' : '接続して追加';
  renderPicker();
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('#account-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const credentials = Object.fromEntries(state.platforms[formPlatform].fields.map((f) => [f.key, form[f.key].value]));
  await busy(form.querySelector('button'), async () => {
    try {
      if (formAccount) {
        await api(`/accounts/${formAccount.id}`, { method: 'PATCH', json: { credentials } });
        toast('鍵を更新しました');
      } else {
        const a = await api('/accounts', { method: 'POST', json: { platform: formPlatform, name: form.display_name.value, credentials } });
        state.targets.set(a.id, newTarget(true));
        toast(`${a.name} を追加しました`);
      }
      form.reset();
      form.hidden = true;
      formPlatform = formAccount = null;
      renderPicker();
      await loadAccounts();
      renderAccounts();
    } catch (err) {
      $('#account-error').textContent = err.message;
    }
  });
});

// ── 投稿の柱（プラン） ──
const pillarBadge = (key) => {
  const p = pillarOf(key);
  return p ? `<span class="pill-pillar" style="--pc:${p.color}">${esc(p.label)}</span>` : '';
};

function setPillar(key) {
  state.pillar = pillarOf(key) ? key : null;
  renderPillarBar();
  if (state.platforms && Object.keys(state.platforms).length) renderTargets();
}

function renderPillarBar() {
  $('#pillar-bar').innerHTML = `<span class="label">柱：</span>${PILLARS.map((p) =>
    `<button type="button" class="pillar-chip" data-pillar="${p.key}" aria-pressed="${state.pillar === p.key}" style="--pc:${p.color}" title="${esc(p.about)}（導線：${esc(p.link)}・目安${p.ratio}%）"><span class="dot" style="background:${p.color}"></span>${esc(p.label)}</button>`).join('')}`;
}

$('#pillar-bar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pillar]');
  if (b) setPillar(state.pillar === b.dataset.pillar ? null : b.dataset.pillar);
});

$('#utm-on').addEventListener('change', async (e) => {
  try {
    await api('/settings', { method: 'PUT', json: { utm: e.target.checked } });
    state.ai.utm = e.target.checked;
    renderTargets();
    toast(e.target.checked ? 'リンクに UTM を付けます' : 'UTM を付けないようにしました');
  } catch (err) {
    e.target.checked = !e.target.checked;
    toast(err.message);
  }
});

// ── AI で書き分け ──
const aiBtn = $('#ai-generate');
function renderAi() {
  aiBtn.disabled = !state.ai.ai_enabled;
  aiBtn.title = state.ai.ai_enabled ? '共通の本文をメモとして、選んだSNSごとに文章を作ります' : 'ANTHROPIC_API_KEY を設定すると使えます';
  $('#ai-status').textContent = state.ai.ai_enabled
    ? 'AIは使える状態です。投稿画面の「AIでSNSごとに書き分ける」を押すと、共通の本文をメモとして、選んだSNSごとの文章を作ります。'
    : 'AIはまだ使えません。Cloudflare に ANTHROPIC_API_KEY を設定してください（README の「AIで書き分け」）。';
  $('#brand').value = state.ai.brand ?? '';
  $('#utm-on').checked = !!state.ai.utm;
}

aiBtn.addEventListener('click', async () => {
  $('#compose-error').textContent = '';
  const chosen = state.accounts.filter((a) => a.enabled && state.targets.get(a.id)?.on);
  if (!chosen.length) return toast('投稿先を選んでください');
  if (!state.body.trim()) return toast('本文の欄に、伝えたいことをメモしてください');
  const anyCustom = chosen.some((a) => state.targets.get(a.id).custom);
  if (anyCustom && !await ask('個別に編集した文章は、AIの文章で置き換わります。よろしいですか？')) return;
  aiBtn.classList.add('loading');
  const label = aiBtn.textContent;
  aiBtn.textContent = '✨ 書き分けています…（30秒ほど）';
  aiBtn.disabled = true;
  try {
    const when = useSchedule.checked && $('#scheduled-at').value ? new Date($('#scheduled-at').value) : new Date();
    const langs = [...document.querySelectorAll('#lang-bar input:checked')].map((i) => i.value);
    const r = await api('/generate', { method: 'POST', json: { source: state.body, platforms: [...new Set(chosen.map((a) => a.platform))], pillar: state.pillar, month: when.getMonth() + 1, langs } });
    for (const a of chosen) {
      const g = r.posts[a.platform];
      if (!g) continue;
      const t = state.targets.get(a.id);
      t.custom = true;
      t.body = g.text;
      if (state.platforms[a.platform].limits.title) t.title = g.title;
    }
    renderTargets();
    toast('SNSごとの文章を作りました。確認してから投稿してください');
  } catch (err) {
    $('#compose-error').textContent = err.message;
  } finally {
    aiBtn.classList.remove('loading');
    aiBtn.textContent = label;
    renderAi();
  }
});

$('#brand-save').addEventListener('click', async (e) => {
  await busy(e.currentTarget, async () => {
    await api('/settings', { method: 'PUT', json: { brand: $('#brand').value } });
    state.ai = await api('/settings');
    renderAi();
    toast('保存しました');
  });
});
$('#brand-reset').addEventListener('click', async () => {
  await api('/settings', { method: 'PUT', json: { brand: '' } });
  state.ai = await api('/settings');
  renderAi();
  toast('初期の文に戻しました');
});

// 確認（ブラウザの confirm の代わりにページ内で聞く）
function ask(message) {
  return Promise.resolve(confirm(message));
}

// ── カレンダー ──
const cal = { month: (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })(), posts: {} };
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const postAt = (p) => (['done', 'partial', 'failed'].includes(p.status) ? p.published_at ?? p.scheduled_at : p.scheduled_at);
const hhmm = (ms) => new Date(ms).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

async function renderCalendar() {
  const y = cal.month.getFullYear();
  const mo = cal.month.getMonth();
  $('#cal-title').textContent = `${y}年${mo + 1}月`;
  const start = new Date(y, mo, 1 - new Date(y, mo, 1).getDay());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 42);
  const posts = await api(`/posts?from=${start.getTime()}&to=${end.getTime()}`);
  cal.posts = Object.fromEntries(posts.map((p) => [p.id, p]));
  const byDay = {};
  for (const p of posts) (byDay[dayKey(new Date(postAt(p)))] ||= []).push(p);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let html = DOW.map((d, i) => `<div class="dow ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${d}</div>`).join('');
  // 週間投稿スケジュール（プラン）を曜日の下に
  html += DOW.map((_, i) => {
    const w = WEEKLY[i];
    return `<div class="plan" title="${esc([w.instagram, w.youtube && `YouTube：${w.youtube}`, w.other, w.work && `作業：${w.work}`].filter(Boolean).join(' ／ '))}">${esc(w.instagram)}${w.youtube ? `<br>YT：${esc(w.youtube)}` : ''}</div>`;
  }).join('');
  renderSeason(mo + 1);
  renderBalance(posts.filter((p) => new Date(postAt(p)).getMonth() === mo));
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const cls = ['day', d.getMonth() !== mo && 'other', d < today && 'past', +d === +today && 'today', d.getDay() === 0 && 'sun', d.getDay() === 6 && 'sat'].filter(Boolean).join(' ');
    const evs = (byDay[dayKey(d)] || []).map((p) => {
      const plats = [...new Set(p.targets.map((t) => t.platform))];
      return `<div class="ev ${p.status}" data-id="${p.id}" ${p.status === 'scheduled' ? 'draggable="true"' : ''} title="${esc(STATUS[p.status])}：${esc(p.body.slice(0, 80))}">
        <span class="t">${pillarOf(p.pillar) ? `<span class="pdot" style="background:${pillarOf(p.pillar).color}" title="${esc(pillarOf(p.pillar).label)}"></span>` : ''}${hhmm(postAt(p))}</span><span class="dots">${plats.map(dot).join('')}</span>
        <span class="s">${esc(p.targets.find((t) => t.title)?.title || p.body.split('\n')[0] || '（本文なし）')}</span></div>`;
    }).join('');
    html += `<div class="${cls}" data-date="${d.getTime()}"><span class="num">${d.getDate()}</span>${evs}</div>`;
  }
  $('#cal').innerHTML = html;
}

// 今月のお茶ごよみ（プラン）
function renderSeason(month) {
  const s = SEASONS[month];
  $('#season').innerHTML = `<div><b>${month}月の作業</b>${esc(s.work)}</div><div><b>発信テーマ</b>${esc(s.theme)}</div><div><b>販売・集客の山</b>${esc(s.peak)}</div>`;
}

// 今月の投稿の柱の比率と、プランの目安
function renderBalance(posts) {
  const total = posts.filter((p) => p.pillar).length;
  const none = posts.length - total;
  $('#pillar-balance').innerHTML = `
    <div class="head"><span>今月の柱の比率（予約・公開 ${posts.length}件${none ? `、柱なし ${none}件` : ''}）</span><span>縦線＝プランの目安</span></div>
    ${PILLARS.map((p) => {
      const n = posts.filter((x) => x.pillar === p.key).length;
      const pct = total ? Math.round((n / total) * 100) : 0;
      return `<div class="pb-row" style="--pc:${p.color}"><span>${esc(p.label)}</span>
        <span class="pb-track"><span class="pb-fill" style="width:${pct}%"></span><span class="pb-target" style="left:${p.ratio}%"></span></span>
        <span class="pb-num">${n}件 ${pct}%／${p.ratio}%</span></div>`;
    }).join('')}`;
}

$('#cal-prev').addEventListener('click', () => { cal.month = new Date(cal.month.getFullYear(), cal.month.getMonth() - 1, 1); renderCalendar(); });
$('#cal-next').addEventListener('click', () => { cal.month = new Date(cal.month.getFullYear(), cal.month.getMonth() + 1, 1); renderCalendar(); });
$('#cal-today').addEventListener('click', () => { const d = new Date(); cal.month = new Date(d.getFullYear(), d.getMonth(), 1); renderCalendar(); });

$('#cal').addEventListener('click', (e) => {
  const ev = e.target.closest('.ev');
  if (ev) {
    const p = cal.posts[ev.dataset.id];
    return ['draft', 'scheduled'].includes(p.status) ? loadIntoCompose(p, false) : showResult(p);
  }
  const day = e.target.closest('.day');
  if (!day || day.classList.contains('past')) return;
  newPostOn(new Date(Number(day.dataset.date)));
});

// その日の予約投稿を作り始める（今日なら1時間後、ほかの日は朝9時）
function newPostOn(date) {
  resetCompose();
  useSchedule.checked = true;
  useSchedule.dispatchEvent(new Event('change'));
  const at = new Date(date);
  at.setHours(9, 0, 0, 0);
  if (at.getTime() < Date.now() + 10 * 60_000) {
    at.setTime(Date.now() + 3600_000);
    at.setMinutes(0, 0, 0);
  }
  $('#scheduled-at').value = localInput(at.getTime());
  // 週間スケジュールでその曜日に決めた柱を選んでおく
  setPillar(WEEKLY[at.getDay()]?.pillar ?? null);
  showTab('compose');
  bodyEl.focus();
}

let dragId = null;
$('#cal').addEventListener('dragstart', (e) => {
  const ev = e.target.closest('.ev.scheduled');
  if (!ev) return;
  dragId = ev.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
});
$('#cal').addEventListener('dragover', (e) => {
  const day = e.target.closest('.day');
  if (!dragId || !day) return;
  e.preventDefault();
  for (const d of document.querySelectorAll('.day.drop')) if (d !== day) d.classList.remove('drop');
  day.classList.add('drop');
});
$('#cal').addEventListener('dragleave', (e) => e.target.closest?.('.day')?.classList.remove('drop'));
$('#cal').addEventListener('drop', async (e) => {
  const day = e.target.closest('.day');
  for (const d of document.querySelectorAll('.day.drop')) d.classList.remove('drop');
  if (!dragId || !day) return;
  e.preventDefault();
  const p = cal.posts[dragId];
  dragId = null;
  const old = new Date(p.scheduled_at);
  const to = new Date(Number(day.dataset.date));
  to.setHours(old.getHours(), old.getMinutes(), 0, 0);
  if (dayKey(to) === dayKey(old)) return;
  try {
    await api(`/posts/${p.id}/schedule`, { method: 'PATCH', json: { scheduled_at: to.toISOString() } });
    toast(`${fmt(to.getTime())} に移しました`);
  } catch (err) {
    toast(err.message);
  }
  renderCalendar();
});

// ── メンバー ──
async function loadMembers() {
  const list = await api('/members');
  $('#member-list').innerHTML = (list.length ? list : []).map((m) => `
    <div class="member" data-id="${m.id}">
      <div class="info"><b>${esc(m.name)}</b> <span class="pill ${m.role}">${m.role === 'admin' ? '管理者' : '投稿担当'}</span>${m.disabled ? ' <span class="pill">停止中</span>' : ''}
        <small>${esc(m.email || '（メール未登録）')}・${m.last_login_at ? `最終ログイン ${fmt(m.last_login_at)}` : 'まだログインしていません'}</small></div>
      ${m.id === state.user.id ? '<span class="muted small">あなた</span>' : `
      <button class="small" data-act="role">${m.role === 'admin' ? '投稿担当にする' : '管理者にする'}</button>
      <button class="small" data-act="email">メールを変える</button>
      <button class="small" data-act="toggle">${m.disabled ? '再開' : '停止'}</button>
      <button class="small ghost danger" data-act="delete">削除</button>`}
    </div>`).join('') || '<p class="muted small">まだメンバーはいません。下のフォームで Google アカウントを追加してください（オーナーは合言葉でもログインできます）。</p>';
  $('#member-list')._list = list;
}

$('#member-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = Number(btn.closest('.member').dataset.id);
  const m = $('#member-list')._list.find((x) => x.id === id);
  try {
    if (btn.dataset.act === 'role') await api(`/members/${id}`, { method: 'PATCH', json: { role: m.role === 'admin' ? 'editor' : 'admin' } });
    if (btn.dataset.act === 'toggle') await api(`/members/${id}`, { method: 'PATCH', json: { disabled: !m.disabled } });
    if (btn.dataset.act === 'email') {
      const email = prompt(`${m.name} さんの Google アカウントのメール`, m.email || '');
      if (!email) return;
      await api(`/members/${id}`, { method: 'PATCH', json: { email } });
      toast('メールを変えました');
    }
    if (btn.dataset.act === 'delete') {
      if (!await ask(`${m.name} さんを削除しますか？（作った投稿は残ります）`)) return;
      await api(`/members/${id}`, { method: 'DELETE' });
    }
  } catch (err) {
    toast(err.message);
  }
  loadMembers();
});

$('#member-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  $('#member-error').textContent = '';
  await busy(f.querySelector('button'), async () => {
    try {
      const m = await api('/members', { method: 'POST', json: { name: f.name.value, email: f.email.value, role: f.role.value } });
      f.reset();
      toast(`${m.name} さんを追加しました。${m.email} で Google ログインできます`);
      loadMembers();
    } catch (err) {
      $('#member-error').textContent = err.message;
    }
  });
});


// ── ハッシュタグ ──
function renderTagBar() {
  $('#tag-bar').innerHTML = state.hashtags.length
    ? `<span class="label">＃ タグを入れる：</span>${state.hashtags.map((s) => `<button type="button" class="tag-chip" data-set="${s.id}" title="${esc(s.tags.join(' '))}">${esc(s.name)}</button>`).join('')}`
    : '';
}

$('#tag-bar').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-set]');
  if (!btn) return;
  const set = state.hashtags.find((s) => String(s.id) === btn.dataset.set);
  state.body = appendTags(state.body, set.tags);
  bodyEl.value = state.body;
  // 個別に編集している投稿先にも同じタグを足す
  for (const t of state.targets.values()) if (t.on && t.custom) t.body = appendTags(t.body, set.tags);
  renderTargets();
  toast(`「${set.name}」のタグを入れました`);
});

let editingSet = null;

function autoPlatformChoices() {
  const used = new Set(state.accounts.map((a) => a.platform));
  const list = Object.values(state.platforms).filter((p) => used.has(p.id));
  return list.length ? list : Object.values(state.platforms);
}

function renderSetForm(set) {
  editingSet = set;
  const f = $('#set-form');
  f.set_name.value = set?.name ?? '';
  f.tags.value = set?.tags.join(' ') ?? '';
  const on = new Set(set?.auto_platforms ?? []);
  $('#auto-platforms').innerHTML = autoPlatformChoices().map((p) =>
    `<label><input type="checkbox" value="${p.id}" ${on.has(p.id) ? 'checked' : ''}>${dot(p.id)}${esc(p.label)}</label>`).join('');
  $('#set-form-title').textContent = set ? `「${set.name}」を編集` : 'セットを追加';
  $('#set-save').textContent = set ? '保存' : '追加';
  $('#set-cancel').hidden = !set;
  $('#set-error').textContent = '';
}

async function renderHashtagTab() {
  state.hashtags = await api('/hashtags');
  renderTagBar();
  $('#set-list').innerHTML = state.hashtags.length ? state.hashtags.map((s) => `
    <div class="set" data-id="${s.id}">
      <div class="set-head"><b>${esc(s.name)}</b>
        <button class="small" data-act="edit">編集</button><button class="small ghost danger" data-act="delete">削除</button></div>
      <div class="tags">${s.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
      <div class="autos">${s.auto_platforms.length ? `自動で付ける：${s.auto_platforms.map((p) => `<span class="pill">${dot(p)}${esc(state.platforms[p]?.label ?? p)}</span>`).join('')}` : '自動では付けない（投稿画面のボタンで入れる）'}</div>
    </div>`).join('') : '<p class="empty">まだセットがありません。下のフォームから作ってください。</p>';
  if (!editingSet) renderSetForm(null);
  const st = await api('/hashtags/stats?days=90');
  $('#tag-stats-note').textContent = `過去${st.days}日・${st.posts}件の投稿から`;
  $('#tag-stats').innerHTML = st.tags.length
    ? st.tags.map((t) => `<button type="button" class="tag-chip" data-tag="${esc(t.tag)}">${esc(t.tag)}<span class="n">${t.count}</span></button>`).join('')
    : '<p class="muted small">まだ公開した投稿にハッシュタグがありません。</p>';
}

$('#set-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const set = state.hashtags.find((s) => String(s.id) === btn.closest('.set').dataset.id);
  if (btn.dataset.act === 'edit') {
    renderSetForm(set);
    $('#set-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  if (btn.dataset.act === 'delete') {
    if (!await ask(`「${set.name}」を削除しますか？`)) return;
    await api(`/hashtags/${set.id}`, { method: 'DELETE' });
    if (editingSet?.id === set.id) editingSet = null;
    toast('削除しました');
    renderHashtagTab();
    renderTargets();
  }
});

$('#tag-stats').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tag]');
  if (!btn) return;
  const f = $('#set-form');
  f.tags.value = parseTags(`${f.tags.value} ${btn.dataset.tag}`).join(' ');
  f.tags.focus();
});

$('#set-cancel').addEventListener('click', () => renderSetForm(null));

$('#set-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const data = {
    name: f.set_name.value,
    tags: f.tags.value,
    auto_platforms: [...f.querySelectorAll('#auto-platforms input:checked')].map((i) => i.value),
  };
  await busy($('#set-save'), async () => {
    try {
      if (editingSet) await api(`/hashtags/${editingSet.id}`, { method: 'PATCH', json: data });
      else await api('/hashtags', { method: 'POST', json: data });
      toast(editingSet ? '保存しました' : 'セットを追加しました');
      editingSet = null;
      await renderHashtagTab();
      renderSetForm(null);
      renderTargets();
    } catch (err) {
      $('#set-error').textContent = err.message;
    }
  });
});

// ── 投稿ごとの反応とふりかえり ──
const metricLine = (m) => METRICS.filter(({ key }) => m?.[key] != null)
  .map(({ key, label, icon }) => `<span title="${label}">${icon} ${compact(m[key])}</span>`).join('');

function reviewBlock(p) {
  const rows = p.targets.filter((t) => t.status === 'ok' || t.status === 'manual').map((t) => {
    const auto = state.platforms[t.platform]?.metrics && t.status === 'ok' && !t.metrics?.manual;
    const ratio = t.ratio != null ? `<span class="${t.ratio >= 1.5 ? 'up' : t.ratio < 0.67 ? 'down' : 'muted'}" title="いいね＋（コメント・シェア・保存）×3 を、このアカウントの直近の中央値と比べて">いつもの${t.ratio.toFixed(1)}倍</span>` : '';
    const nums = t.metrics ? metricLine(t.metrics) : `<span class="muted">${auto ? 'まだ数字がありません' : '数字は手で入れます'}</span>`;
    return `<div class="m-row">${dot(t.platform)}<span class="m-name">${esc(t.account_name)}</span><span class="m-nums">${nums}</span>${ratio}
      ${t.metrics_error ? `<span class="error" title="${esc(t.metrics_error)}">取得できませんでした</span>` : ''}
      <button class="small ghost" data-act="metrics" data-target="${t.id}">${t.metrics?.manual ? '数字を直す' : auto ? '手で入れる' : '数字を入れる'}</button></div>`;
  }).join('');
  const r = p.review;
  return `<div class="review">
    <div class="review-head"><b>反応とふりかえり</b>${r ? `<span class="muted small">${fmt(p.review_at)}</span>` : ''}
      <button class="small" data-act="review">${r ? '↻ もう一度ふりかえる' : '📊 反応を見てふりかえる'}</button></div>
    <div class="m-rows">${rows}</div>
    ${r ? `<p class="r-summary">${esc(r.summary)}</p>
      ${r.good.length ? `<div class="r-sec"><b>良かったところ</b><ul>${r.good.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>` : ''}
      <div class="r-sec r-next"><b>次回へのアドバイス</b><ol>${r.next.map((n) => `<li>${esc(n)}</li>`).join('')}</ol></div>
      ${r.idea ? `<div class="r-idea"><span>💡 次に試すなら：${esc(r.idea)}</span><button class="small ai" data-act="idea">この案で書く</button></div>` : ''}`
    : `<p class="muted small">公開から約1日たつと、毎朝自動で数字を集めてふりかえります（AIのふりかえりは ANTHROPIC_API_KEY が必要）。すぐ見たいときはボタンを押してください。</p>`}
  </div>`;
}

function useIdea(idea) {
  const memo = `${idea}\n`;
  state.body = state.body.trim() ? `${state.body.trimEnd()}\n\n${memo}` : memo;
  bodyEl.value = state.body;
  renderTargets();
  showTab('compose');
  bodyEl.focus();
  toast('次に試す案を入れました。メモを足して「AIで書き分ける」も使えます');
}

function openMetrics(t, done) {
  const dlg = $('#metrics-dialog');
  const f = $('#metrics-form');
  $('#metrics-title').innerHTML = `${dot(t.platform)}${esc(t.account_name)} の数字`;
  $('#metrics-fields').innerHTML = METRICS.map(({ key, label, icon }) =>
    `<label>${icon} ${label}<input type="number" min="0" inputmode="numeric" name="${key}" value="${t.metrics?.[key] ?? ''}"></label>`).join('');
  $('#metrics-error').textContent = '';
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (e.submitter?.value === 'cancel') return dlg.close();
    const metrics = Object.fromEntries(METRICS.map(({ key }) => [key, f[key].value]));
    try {
      await api(`/targets/${t.id}/metrics`, { method: 'PUT', json: { metrics } });
      dlg.close();
      toast('数字を保存しました');
      done();
    } catch (err) {
      $('#metrics-error').textContent = err.message;
    }
  };
  dlg.showModal();
}

// 投稿画面：前回のふりかえりで出た「次回へのアドバイス」
async function loadLastReview() {
  const [last] = await api('/reviews/latest').catch(() => []);
  const el = $('#last-review');
  el.hidden = !last;
  if (!last) return;
  el.innerHTML = `<summary>📝 前回のふりかえり（${fmt(last.published_at)}の投稿）からのアドバイス</summary>
    <ol>${last.review.next.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>
    ${last.review.idea ? `<p>💡 ${esc(last.review.idea)} <button type="button" class="small ai" data-idea>この案で書く</button></p>` : ''}
    <p class="muted small">AIで書き分けるときも、最近のアドバイスを参考にします。</p>`;
  el._idea = last.review.idea;
}
$('#last-review').addEventListener('click', (e) => {
  if (e.target.closest('[data-idea]')) useIdea($('#last-review')._idea);
});

// ── リサーチ（競合・話題の投稿） ──
const WATCH_KINDS = {
  ig_user: { label: 'Instagram アカウント', platform: 'instagram', placeholder: '@ユーザー名 か プロフィールのURL', link: (v) => `https://www.instagram.com/${v}/` },
  ig_tag: { label: 'Instagram ハッシュタグ', platform: 'instagram', placeholder: '#日本茶', link: (v) => `https://www.instagram.com/explore/tags/${encodeURIComponent(v)}/` },
  yt_channel: { label: 'YouTube チャンネル', platform: 'youtube', placeholder: '@ハンドル か チャンネルのURL', link: (v) => `https://www.youtube.com/${v.startsWith('UC') ? 'channel/' + v : v}` },
  yt_query: { label: 'YouTube キーワード', platform: 'youtube', placeholder: '例：日本茶 淹れ方（直近30日の再生数順）', link: (v) => `https://www.youtube.com/results?search_query=${encodeURIComponent(v)}&sp=CAM%253D` },
};
const research = { watches: [], items: [] };
const compact = (n) => (n == null ? '–' : new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 }).format(n));
const watchName = (w) => w.info?.name || (w.kind === 'ig_user' ? '@' + w.value : w.kind === 'ig_tag' ? '#' + w.value : w.value);
const TYPE_LABEL = { reel: 'リール', short: 'ショート', video: '動画', image: '画像', carousel_album: '複数枚' };
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

$('#rs-sort').innerHTML = Object.entries(SORTS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
$('#watch-form').kind.addEventListener('change', (e) => { $('#watch-form').value.placeholder = WATCH_KINDS[e.target.value].placeholder; });

async function loadResearch() {
  const r = await api('/research');
  research.watches = r.watches;
  research.items = scoreItems(r.items, r.watches);
  const notes = [r.status.instagram, r.status.youtube].filter(Boolean);
  $('#rs-status').innerHTML = notes.map((n) => `<p class="rs-status">${esc(n)}（README の「リサーチ」）</p>`).join('');
  renderWatches();
  const sel = $('#rs-watch');
  const keep = sel.value;
  sel.innerHTML = `<option value="">すべての相手</option>${r.watches.map((w) => `<option value="${w.id}">${esc(watchName(w))}</option>`).join('')}`;
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
  renderResearchItems();
}

function renderWatches() {
  const counts = {};
  for (const it of research.items) counts[it.watch_id] = (counts[it.watch_id] || 0) + 1;
  $('#watch-list').innerHTML = research.watches.length ? research.watches.map((w) => {
    const k = WATCH_KINDS[w.kind];
    const g = w.growth;
    const grow = g ? ` <span class="${g.diff >= 0 ? 'up' : 'down'}">${g.diff >= 0 ? '+' : ''}${g.diff.toLocaleString()}</span>（${g.days}日）` : '';
    const fol = w.info?.followers != null ? `${w.kind === 'yt_channel' ? '登録者' : 'フォロワー'} ${w.info.followers.toLocaleString()}${grow}・` : '';
    return `<div class="watch" data-id="${w.id}">
      ${w.info?.picture ? `<img src="${esc(w.info.picture)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : dot(k.platform)}
      <div class="info"><b>${esc(watchName(w))}</b> <span class="muted small">${esc(k.label)}</span>
        <small>${fol}投稿 ${counts[w.id] || 0}件${w.fetched_at ? `・${fmt(w.fetched_at)} 更新` : ''}</small>
        ${w.last_error ? `<p class="error">${esc(w.last_error)}</p>` : ''}</div>
      <a class="button small ghost" href="${esc(k.link(w.value))}" target="_blank" rel="noopener noreferrer">開く</a>
      <button class="small" data-act="refresh">更新</button>
      <button class="small ghost danger" data-act="delete">削除</button>
    </div>`;
  }).join('') : '<p class="muted small">まだ登録がありません。まずは同業のお茶屋さんや、#日本茶 #自然栽培 などを登録してみてください。</p>';
}

function renderResearchItems() {
  const wid = $('#rs-watch').value;
  const days = Number($('#rs-days').value);
  const buzzOnly = $('#rs-buzz').checked;
  const since = days ? Date.now() - days * 86400e3 : 0;
  const byId = Object.fromEntries(research.watches.map((w) => [w.id, w]));
  const list = research.items
    .filter((it) => (!wid || String(it.watch_id) === wid) && (!since || (it.posted_at ?? 0) >= since) && (!buzzOnly || isBuzz(it)))
    .sort(SORTS[$('#rs-sort').value].fn)
    .slice(0, 90);
  $('#rs-items').innerHTML = list.length ? list.map((it) => {
    const w = byId[it.watch_id];
    const k = WATCH_KINDS[w.kind];
    const buzz = isBuzz(it);
    const type = [TYPE_LABEL[it.media_type] ?? '', it.duration ? mmss(it.duration) : ''].filter(Boolean).join(' ');
    return `<article class="rs-item${buzz ? ' buzz' : ''}" data-watch="${it.watch_id}" data-item="${esc(it.item_id)}">
      <a class="rs-thumb" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">
        <span class="ph">${esc(TYPE_LABEL[it.media_type] ?? '投稿')}</span>
        ${it.thumb ? `<img src="${esc(it.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
        ${buzz ? `<span class="badge">話題 ×${it.ratio.toFixed(1)}</span>` : ''}
        ${type ? `<span class="kind">${esc(type)}</span>` : ''}
      </a>
      <div class="rs-body">
        <div class="rs-meta">${dot(k.platform)}<span class="who2">${esc(it.author || watchName(w))}</span><span>${it.posted_at ? new Date(it.posted_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : ''}</span></div>
        <p class="rs-cap">${esc(it.caption) || '<span class="muted">（文章なし）</span>'}</p>
        <div class="rs-nums">
          ${it.views != null ? `<span title="再生数">▶ ${compact(it.views)}</span>` : ''}
          <span title="いいね">♥ ${compact(it.likes)}</span><span title="コメント">💬 ${compact(it.comments)}</span>
          ${it.per_day != null ? `<span class="sub" title="${it.views != null ? '1日あたりの再生数' : '1日あたりの反応（いいね＋コメント×3）'}">1日 ${compact(Math.round(it.per_day))}</span>` : ''}
          ${it.ratio != null ? `<span class="${buzz ? 'hot' : 'sub'}" title="同じ相手の投稿の中央値と比べて">いつもの${it.ratio.toFixed(1)}倍</span>` : ''}
          ${it.rate != null ? `<span class="sub" title="（いいね＋コメント）÷フォロワー">反応率 ${(it.rate * 100).toFixed(1)}%</span>` : ''}
        </div>
        <div class="rs-acts"><a class="button small" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">開く</a><button class="small" data-act="idea" title="この投稿を参考メモとして投稿画面に入れます">✎ ネタにする</button></div>
      </div>
    </article>`;
  }).join('') : `<p class="empty">${research.watches.length ? '条件に合う投稿がありません。期間を広げてみてください' : '見張る相手を登録すると、ここに投稿が並びます'}</p>`;
}

for (const id of ['#rs-watch', '#rs-sort', '#rs-days', '#rs-buzz']) $(id).addEventListener('change', renderResearchItems);

$('#watch-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  $('#watch-error').textContent = '';
  await busy($('#watch-add'), async () => {
    try {
      await api('/research/watches', { method: 'POST', json: { kind: f.kind.value, value: f.value.value } });
      f.value.value = '';
      toast('登録して、最近の投稿を集めました');
      await loadResearch();
    } catch (err) {
      $('#watch-error').textContent = err.message;
    }
  });
});

$('#watch-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const w = research.watches.find((x) => String(x.id) === btn.closest('.watch').dataset.id);
  if (btn.dataset.act === 'delete') {
    if (!await ask(`「${watchName(w)}」の見張りをやめますか？`)) return;
    await api(`/research/watches/${w.id}`, { method: 'DELETE' });
    toast('削除しました');
    return loadResearch();
  }
  if (btn.dataset.act === 'refresh') {
    await busy(btn, async () => {
      try {
        await api(`/research/watches/${w.id}/refresh`, { method: 'POST' });
        toast('更新しました');
      } catch (err) {
        toast(err.message);
      }
      await loadResearch();
    });
  }
});

$('#rs-refresh').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const label = btn.textContent;
  const failed = [];
  await busy(btn, async () => {
    for (const [i, w] of research.watches.entries()) {
      btn.textContent = `更新中… ${i + 1}/${research.watches.length}`;
      try {
        await api(`/research/watches/${w.id}/refresh`, { method: 'POST' });
      } catch {
        failed.push(watchName(w));
      }
    }
  });
  btn.textContent = label;
  toast(failed.length ? `更新できなかった相手：${failed.join('、')}` : 'すべて更新しました');
  loadResearch();
});

$('#rs-items').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act="idea"]');
  if (!btn) return;
  const card = btn.closest('.rs-item');
  const it = research.items.find((x) => String(x.watch_id) === card.dataset.watch && x.item_id === card.dataset.item);
  const w = research.watches.find((x) => x.id === it.watch_id);
  const cap = [...(it.caption || '')].slice(0, 200).join('').replace(/\s+/g, ' ');
  const memo = `（参考にした投稿：${it.author || watchName(w)} ${it.url}）\n「${cap}」\nこの切り口を、悠三堂ならこう伝える：\n`;
  state.body = state.body.trim() ? `${state.body.trimEnd()}\n\n${memo}` : memo;
  bodyEl.value = state.body;
  renderTargets();
  showTab('compose');
  bodyEl.focus();
  bodyEl.setSelectionRange(bodyEl.value.length, bodyEl.value.length);
  toast('参考メモを入れました。続きを書いて「AIで書き分ける」も使えます');
});

$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const links = searchLinks(e.target.q.value);
  $('#search-links').innerHTML = links.length
    ? links.map((l) => `<a class="chip" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${state.platforms[l.id] ? dot(l.id) : ''}${esc(l.label)} ↗</a>`).join('')
    : '<p class="muted small">調べる言葉を入れてください</p>';
});

async function loadAccounts() {
  state.accounts = await api('/accounts');
  renderTargets();
}

async function start() {
  state.user = (await api('/me')).user;
  document.body.classList.toggle('role-editor', !isAdmin());
  $('#who').textContent = `${state.user.name}（${isAdmin() ? '管理者' : '投稿担当'}）`;
  $('#brand').readOnly = !isAdmin();
  const platforms = await api('/platforms');
  state.platforms = Object.fromEntries(platforms.map((p) => [p.id, p]));
  $('#login').hidden = true;
  $('#app').hidden = false;
  state.ai = await api('/settings');
  renderAi();
  state.hashtags = await api('/hashtags');
  renderTagBar();
  renderPillarBar();
  await loadAccounts();
  // 最初は有効なアカウントを全部選んでおく
  for (const a of state.accounts) if (!state.targets.has(a.id)) state.targets.set(a.id, newTarget(!state.platforms[a.platform].manual));
  renderTargets();
  renderPicker();
  loadLastReview();
}

start().catch(showLogin);
