import { countFor } from './textlen.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const state = {
  platforms: {},
  accounts: [],
  body: '',
  media: [],              // {key,type,size,alt,url,uploading}
  targets: new Map(),     // accountId -> {on, custom, body}
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
    await api('/login', { method: 'POST', json: { password: e.target.password.value } });
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
  if (name === 'accounts') renderAccounts();
}
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
      <img src="${esc(m.url)}" alt="">
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

function problems(platformId, text) {
  const p = state.platforms[platformId];
  const out = [];
  const media = state.media;
  if (countFor(platformId, text) > p.limits.text) out.push('文字数オーバー');
  if (p.limits.requiresImage && !media.length) out.push('画像が必要');
  if (media.length > p.limits.images) out.push(`画像は${p.limits.images}枚まで`);
  const bad = media.find((m) => m.type && !p.limits.imageTypes.includes(m.type));
  if (bad) out.push(`${bad.type.replace('image/', '')} 非対応`);
  return out;
}

function renderTargets() {
  const el = $('#targets');
  $('#no-accounts').hidden = state.accounts.length > 0;
  el.innerHTML = state.accounts.filter((a) => a.enabled).map((a) => {
    const t = state.targets.get(a.id) ?? { on: false, custom: false, body: '' };
    const p = state.platforms[a.platform];
    const text = t.custom ? t.body : state.body;
    const n = countFor(a.platform, text);
    const probs = t.on ? problems(a.platform, text) : [];
    return `
      <div class="target ${t.on ? '' : 'off'}" data-id="${a.id}">
        <div class="target-head">
          <input type="checkbox" data-on ${t.on ? 'checked' : ''} id="t${a.id}">
          ${dot(a.platform)}
          <label for="t${a.id}" class="name" style="margin:0;color:var(--ink)">${esc(a.name)} <span class="muted small">${esc(p.label)}</span></label>
          <span class="count ${n > p.limits.text ? 'over' : ''}">${n} / ${p.limits.text}</span>
          ${t.on ? `<button class="ghost small" data-custom>${t.custom ? '共通に戻す' : '個別に編集'}</button>` : ''}
        </div>
        ${t.on && t.custom ? `<textarea data-body>${esc(t.body)}</textarea>` : ''}
        ${probs.length ? `<div class="warn-text">⚠ ${probs.join('・')}</div>` : ''}
        ${t.on && p.note ? `<div class="muted small">${esc(p.note)}</div>` : ''}
      </div>`;
  }).join('');
}

$('#targets').addEventListener('change', (e) => {
  const id = Number(e.target.closest('.target')?.dataset.id);
  if (e.target.matches('[data-on]')) {
    const t = state.targets.get(id) ?? { on: false, custom: false, body: '' };
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
      .map(([id, t]) => ({ account_id: id, body: t.custom ? t.body : null })),
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
  state.targets = new Map();
  for (const t of post.targets) state.targets.set(t.account_id, { on: true, custom: t.body != null, body: t.body ?? '' });
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
          ${t.status === 'ok' ? (t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">投稿を開く</a>` : '送信しました') : `<span class="error">${esc(t.error)}</span>`}
        </div>
      </div>`).join('')}
    ${post.status !== 'done' ? '<p class="muted small">失敗した分は「履歴」から再試行できます。</p>' : ''}`;
  $('#dialog').showModal();
}

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
        <div class="post-meta"><span class="status ${p.status}">${STATUS[p.status]}</span><span>${when}</span></div>
        <div class="post-body">${esc(p.body) || '<span class="muted">（本文なし）</span>'}</div>
        ${p.media.length ? `<div class="media">${p.media.map((m) => `<div class="thumb"><img src="/m/${esc(m.key)}" alt="${esc(m.alt)}" loading="lazy"></div>`).join('')}</div>` : ''}
        <div class="post-targets">${p.targets.map((t) => {
          const icon = t.status === 'ok' ? '✓' : t.status === 'error' ? '✕' : '';
          const inner = `${dot(t.platform)}${esc(t.account_name)} ${icon}`;
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
      <button class="small" data-act="rename">名前</button>
      <button class="small" data-act="creds">鍵を更新</button>
      <button class="small" data-act="toggle">${a.enabled ? '停止' : '再開'}</button>
      <button class="small ghost danger" data-act="delete">削除</button>
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
  $('#account-note').textContent = account ? `${account.name}（${p.label}）の鍵を更新します。空欄の項目は今の値のままです。` : p.note || '';
  $('#account-fields').innerHTML = p.fields.map((f) => `
    <label>${esc(f.label)}${f.optional ? '（任意）' : ''}
      <input name="${f.key}" type="${f.secret ? 'password' : 'text'}" placeholder="${esc(f.placeholder || '')}" autocomplete="off" ${f.optional || account ? '' : 'required'}>
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
        state.targets.set(a.id, { on: true, custom: false, body: '' });
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

async function loadAccounts() {
  state.accounts = await api('/accounts');
  renderTargets();
}

async function start() {
  const platforms = await api('/platforms');
  state.platforms = Object.fromEntries(platforms.map((p) => [p.id, p]));
  $('#login').hidden = true;
  $('#app').hidden = false;
  await loadAccounts();
  // 最初は有効なアカウントを全部選んでおく
  for (const a of state.accounts) if (!state.targets.has(a.id)) state.targets.set(a.id, { on: true, custom: false, body: '' });
  renderTargets();
  renderPicker();
}

api('/me').then(start).catch(showLogin);
