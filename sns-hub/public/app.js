import { countFor } from './textlen.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const state = {
  platforms: {},
  accounts: [],
  body: '',
  media: [],              // {key,type,size,alt,url,uploading}
  targets: new Map(),     // accountId -> {on, custom, body, title}
  ai: { ai_enabled: false },
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
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  try {
    await api('/login', { method: 'POST', json: { login: e.target.login.value, password: e.target.password.value } });
    e.target.password.value = '';
    await start();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
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

// サーバーの mediaFor と同じ：そのSNSに送るファイルだけ
function mediaFor(platformId) {
  const l = state.platforms[platformId].limits;
  if (l.ignoreMedia) return [];
  return state.media.filter((m) => (isVideo(m) ? (l.videos ?? 0) > 0 : !l.ignoreImages));
}

function problems(platformId, text, title) {
  const l = state.platforms[platformId].limits;
  const out = [];
  const media = mediaFor(platformId);
  const images = media.filter((m) => !isVideo(m));
  const videos = media.filter(isVideo);
  if (countFor(platformId, text) > l.text) out.push('文字数オーバー');
  if (title && l.title && [...title].length > l.title) out.push(`タイトルは${l.title}字まで`);
  if (l.requiresImage && !images.length) out.push('画像が必要');
  if (l.requiresVideo && !videos.length) out.push('動画が必要');
  if (images.length > l.images) out.push(`画像は${l.images}枚まで`);
  if (videos.length > (l.videos ?? 0)) out.push(`動画は${l.videos}本まで`);
  const bad = images.find((m) => m.type && !l.imageTypes.includes(m.type)) || videos.find((m) => !(l.videoTypes ?? []).includes(m.type));
  if (bad) out.push(`${bad.type.split('/')[1]} 非対応`);
  return out;
}

// 送られないファイルがあることを知らせる
function skipped(platformId) {
  const l = state.platforms[platformId].limits;
  if (l.ignoreMedia) return state.media.length ? '画像・動画は使いません（文章だけ）' : '';
  const n = state.media.length - mediaFor(platformId).length;
  if (!n) return '';
  return l.ignoreImages ? '画像は使いません' : '動画は送られません';
}

function renderTargets() {
  const el = $('#targets');
  $('#no-accounts').hidden = state.accounts.length > 0;
  el.innerHTML = state.accounts.filter((a) => a.enabled).map((a) => {
    const t = state.targets.get(a.id) ?? newTarget(false);
    const p = state.platforms[a.platform];
    const text = t.custom ? t.body : state.body;
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
  const n = countFor(a.platform, e.target.value);
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
  const body = t.body ?? post.body;
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
        <div class="post-meta"><span class="status ${p.status}">${STATUS[p.status]}</span><span>${when}</span>${p.updated_by ? `<span class="by">${p.created_by && p.created_by !== p.updated_by ? `作成 ${esc(p.created_by)}・` : ''}${p.created_by === p.updated_by ? '作成' : '更新'} ${esc(p.updated_by)}</span>` : ''}</div>
        <div class="post-body">${esc(p.body) || '<span class="muted">（本文なし）</span>'}</div>
        ${p.media.length ? `<div class="media">${p.media.map((m) => `<div class="thumb">${isVideo(m) ? `<video src="/m/${esc(m.key)}" muted preload="metadata"></video><span class="badge-video">動画</span>` : `<img src="/m/${esc(m.key)}" alt="${esc(m.alt)}" loading="lazy">`}</div>`).join('')}</div>` : ''}
        <div class="post-targets">${p.targets.map((t) => {
          const icon = t.status === 'ok' ? '✓' : t.status === 'error' ? '✕' : '';
          const inner = `${dot(t.platform)}${esc(t.account_name)} ${icon}`;
          if (t.status === 'manual') return `<span class="chip manual">${inner}<button data-act="copy-text" data-target="${t.id}">コピー</button>${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">開く</a>` : ''}</span>`;
          return t.url ? `<a class="chip ok" href="${esc(t.url)}" target="_blank" rel="noopener">${inner}</a>` : `<span class="chip ${t.status}">${inner}</span>`;
        }).join('')}</div>
        ${errors.length ? `<div class="post-errors">${errors.map((t) => `${esc(t.account_name)}：${esc(t.error)}`).join('\n')}</div>` : ''}
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

// ── AI で書き分け ──
const aiBtn = $('#ai-generate');
function renderAi() {
  aiBtn.disabled = !state.ai.ai_enabled;
  aiBtn.title = state.ai.ai_enabled ? '共通の本文をメモとして、選んだSNSごとに文章を作ります' : 'ANTHROPIC_API_KEY を設定すると使えます';
  $('#ai-status').textContent = state.ai.ai_enabled
    ? 'AIは使える状態です。投稿画面の「AIでSNSごとに書き分ける」を押すと、共通の本文をメモとして、選んだSNSごとの文章を作ります。'
    : 'AIはまだ使えません。Cloudflare に ANTHROPIC_API_KEY を設定してください（README の「AIで書き分け」）。';
  $('#brand').value = state.ai.brand ?? '';
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
    const r = await api('/generate', { method: 'POST', json: { source: state.body, platforms: [...new Set(chosen.map((a) => a.platform))] } });
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
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const cls = ['day', d.getMonth() !== mo && 'other', d < today && 'past', +d === +today && 'today', d.getDay() === 0 && 'sun', d.getDay() === 6 && 'sat'].filter(Boolean).join(' ');
    const evs = (byDay[dayKey(d)] || []).map((p) => {
      const plats = [...new Set(p.targets.map((t) => t.platform))];
      return `<div class="ev ${p.status}" data-id="${p.id}" ${p.status === 'scheduled' ? 'draggable="true"' : ''} title="${esc(STATUS[p.status])}：${esc(p.body.slice(0, 80))}">
        <span class="t">${hhmm(postAt(p))}</span><span class="dots">${plats.map(dot).join('')}</span>
        <span class="s">${esc(p.targets.find((t) => t.title)?.title || p.body.split('\n')[0] || '（本文なし）')}</span></div>`;
    }).join('');
    html += `<div class="${cls}" data-date="${d.getTime()}"><span class="num">${d.getDate()}</span>${evs}</div>`;
  }
  $('#cal').innerHTML = html;
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
        <small>ID：${esc(m.login)}・${m.last_login_at ? `最終ログイン ${fmt(m.last_login_at)}` : 'まだログインしていません'}</small></div>
      ${m.id === state.user.id ? '<span class="muted small">あなた</span>' : `
      <button class="small" data-act="role">${m.role === 'admin' ? '投稿担当にする' : '管理者にする'}</button>
      <button class="small" data-act="password">パスワード再設定</button>
      <button class="small" data-act="toggle">${m.disabled ? '再開' : '停止'}</button>
      <button class="small ghost danger" data-act="delete">削除</button>`}
    </div>`).join('') || '<p class="muted small">まだメンバーはいません。下のフォームから追加してください（オーナーは合言葉でいつでもログインできます）。</p>';
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
    if (btn.dataset.act === 'password') {
      const pw = prompt(`${m.name} さんの新しいパスワード（8文字以上）`);
      if (!pw) return;
      await api(`/members/${id}`, { method: 'PATCH', json: { password: pw } });
      toast('パスワードを変えました。本人に伝えてください');
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
      const m = await api('/members', { method: 'POST', json: { name: f.name.value, login: f.login.value, password: f.password.value, role: f.role.value } });
      f.reset();
      toast(`${m.name} さんを追加しました（ID：${m.login}）`);
      loadMembers();
    } catch (err) {
      $('#member-error').textContent = err.message;
    }
  });
});

$('#password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/me/password', { method: 'PATCH', json: { current: f.current.value, next: f.next.value } });
    f.reset();
    toast('パスワードを変えました。新しいパスワードでログインし直してください');
    showLogin();
  } catch (err) {
    toast(err.message);
  }
});

async function loadAccounts() {
  state.accounts = await api('/accounts');
  renderTargets();
}

async function start() {
  state.user = (await api('/me')).user;
  document.body.classList.toggle('role-editor', !isAdmin());
  $('#who').textContent = `${state.user.name}（${isAdmin() ? '管理者' : '投稿担当'}）`;
  $('#my-password').hidden = state.user.id === 0;
  $('#brand').readOnly = !isAdmin();
  const platforms = await api('/platforms');
  state.platforms = Object.fromEntries(platforms.map((p) => [p.id, p]));
  $('#login').hidden = true;
  $('#app').hidden = false;
  state.ai = await api('/settings');
  renderAi();
  await loadAccounts();
  // 最初は有効なアカウントを全部選んでおく
  for (const a of state.accounts) if (!state.targets.has(a.id)) state.targets.set(a.id, newTarget(!state.platforms[a.platform].manual));
  renderTargets();
  renderPicker();
}

start().catch(showLogin);
