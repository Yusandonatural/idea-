import { BATCH_KINDS, costBreakdown, costRate, EXTRA_LABELS, indexBom, KINDS } from './core.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const state = { user: null, items: [], bom: [], byId: new Map(), kind: 'all', countKind: 'all', entryKind: 'receive', costKind: 'sell', costOpen: new Set(), history: [], editing: null };

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
  toast.timer = setTimeout(() => (t.hidden = true), 3000);
}

async function busy(btn, fn) {
  btn.disabled = true;
  try {
    return await fn();
  } catch (e) {
    toast(e.message);
    throw e;
  } finally {
    btn.disabled = false;
  }
}

const nf = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 });
const n = (v) => (v == null ? '' : nf.format(v));
const yen = (v) => `¥${Math.round(v || 0).toLocaleString('ja-JP')}`;
const yen1 = (v) => `¥${(Math.round((v || 0) * 10) / 10).toLocaleString('ja-JP')}`; // 原価は小数1桁まで
const pct = (r) => (r == null ? '—' : `${(Math.round(r * 1000) / 10).toFixed(1)}%`);
const rateClass = (r) => (r == null ? '' : r >= 0.6 ? 'bad' : r >= 0.45 ? 'warn' : 'good');
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const fmtDate = (ms) => new Date(ms).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' });
const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
// 今日の伝票はいまの時刻、過去の日付はその日の夕方として記録する（棚卸は入出庫のあとに数えた扱い）
const atOf = (date, time = '18:00') => (date === today() ? undefined : `${date}T${time}:00+09:00`);

// ── ログイン ──
function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  loadAuthConfig().catch(() => {});
}

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

// Google でログイン（Firebase Authentication。sns-hub と同じプロジェクト）
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
  firebase = { auth: mod.getAuth(initializeApp(cfg.firebase, 'zaiko')), mod };
  return firebase;
}

const GOOGLE_ERRORS = {
  'auth/unauthorized-domain': 'このURLが Firebase の「承認済みドメイン」に入っていません。管理者に追加してもらってください（README の「Google ログイン」）',
  'auth/popup-blocked': 'ログイン用の小さな画面がブロックされました。ポップアップを許可してもう一度押してください',
  'auth/network-request-failed': '通信できませんでした。接続を確かめてもう一度お試しください',
};

$('#google-login').addEventListener('click', async (e) => {
  $('#login-error').textContent = '';
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const { auth, mod } = await firebaseAuth();
    const provider = new mod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await mod.signInWithPopup(auth, provider);
    const idToken = await cred.user.getIdToken();
    await mod.signOut(auth);
    await api('/login/google', { method: 'POST', json: { idToken } });
    await start();
  } catch (err) {
    if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
    const loadFailed = !err?.code && /import|module/i.test(err?.message || '');
    $('#login-error').textContent = loadFailed ? 'Google ログインの部品を読み込めませんでした。通信を確かめて、もう一度押してください' : GOOGLE_ERRORS[err?.code] || err.message;
    if (loadFailed) firebase = null;
  } finally {
    btn.disabled = false;
  }
});

$('#logout').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' });
  showLogin();
});

// ── タブ ──
const TABS = { stock: renderStock, entry: renderEntry, count: renderCount, cost: renderCost, value: loadValue, history: () => loadHistory(true), shopify: loadShopify, members: loadMembers };
let tab = 'stock';
function show(name) {
  tab = name;
  for (const b of $$('nav button')) b.classList.toggle('active', b.dataset.tab === name);
  for (const s of $$('main > section')) s.hidden = s.id !== `tab-${name}`;
  TABS[name]?.();
  history.replaceState(null, '', `#${name}`);
}
for (const b of $$('nav button')) b.addEventListener('click', () => show(b.dataset.tab));

async function loadItems() {
  const d = await api('/items');
  state.items = d.items;
  state.bom = d.bom;
  state.byId = new Map(d.items.map((i) => [i.id, i]));
}

const active = () => state.items.filter((i) => !i.archived);
const kindLabel = (k) => KINDS[k]?.label || k;

function kindSeg(el, current, onPick, counts) {
  el.innerHTML = [['all', 'すべて'], ...Object.entries(KINDS).map(([k, v]) => [k, v.label])]
    .map(([k, label]) => `<button data-k="${k}" class="${k === current ? 'active' : ''}">${label}${counts ? `<span class="n">${counts[k] ?? 0}</span>` : ''}</button>`).join('');
  for (const b of $$('button', el)) b.addEventListener('click', () => onPick(b.dataset.k));
}

// 品目のプルダウン（種類ごと）
function itemOptions(selected, { exclude } = {}) {
  return `<option value="">品目を選ぶ</option>` + Object.entries(KINDS).map(([k, v]) => {
    const list = active().filter((i) => i.kind === k && i.id !== exclude);
    if (!list.length) return '';
    return `<optgroup label="${v.label}">${list.map((i) => `<option value="${i.id}" ${i.id === selected ? 'selected' : ''}>${esc(i.name)}（${esc(i.unit)}）</option>`).join('')}</optgroup>`;
  }).join('');
}

// ── 在庫一覧 ──
function renderStock() {
  const all = active();
  const counts = { all: all.length };
  for (const i of all) counts[i.kind] = (counts[i.kind] || 0) + 1;
  kindSeg($('#kind-filter'), state.kind, (k) => { state.kind = k; renderStock(); }, counts);
  const low = all.filter((i) => i.low);
  const negative = all.filter((i) => i.qty < 0);
  const value = all.reduce((s, i) => s + Math.max(0, i.qty) * i.unit_cost, 0);
  $('#summary').innerHTML = `
    <div class="stat"><span>在庫金額（いま）</span><b>${yen(value)}</b></div>
    <div class="stat ${low.length ? 'warn' : ''}"><span>補充が必要</span><b>${low.length}<small>品目</small></b>${low.slice(0, 4).map((i) => `<em>${esc(i.name)}</em>`).join('')}</div>
    <div class="stat ${negative.length ? 'bad' : ''}"><span>マイナス在庫</span><b>${negative.length}<small>品目</small></b>${negative.length ? '<em>棚卸か入荷の記録もれ</em>' : ''}</div>`;
  const q = $('#search').value.trim().toLowerCase();
  const rows = state.items.filter((i) => ($('#show-archived').checked || !i.archived)
    && (state.kind === 'all' || i.kind === state.kind)
    && (!q || i.name.toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q)));
  if (!state.items.length) {
    $('#stock-table').innerHTML = `<tbody><tr><td class="empty">まだ品目がありません。「Shopify」タブで商品を取り込むか、「＋ 品目を追加」で袋・荒茶などを登録してください。</td></tr></tbody>`;
    return;
  }
  $('#stock-table').innerHTML = `<thead><tr><th>品目</th><th>種類</th><th class="num">在庫</th><th class="num">作れる数</th><th class="num">単価</th><th class="num">金額</th></tr></thead>
    <tbody>${rows.map((i) => {
      const parts = state.bom.filter((b) => b.parent_id === i.id).length;
      const tags = [
        i.shopify_variant_id ? '<span class="tag shop">Shopify</span>' : '',
        i.push_to_shopify ? '<span class="tag sync">反映中</span>' : '',
        i.make_on_order && parts ? '<span class="tag">都度詰め</span>' : '',
        i.archived ? '<span class="tag">使わない</span>' : '',
      ].join('');
      return `<tr data-id="${i.id}" class="${i.low ? 'low' : ''} ${i.qty < 0 ? 'neg' : ''}">
        <td><button class="link" data-open="${i.id}">${esc(i.name)}</button> ${tags}${parts ? `<div class="muted small">構成 ${parts}品目</div>` : ''}</td>
        <td><span class="kind k-${i.kind}">${kindLabel(i.kind)}</span></td>
        <td class="num">${i.make_on_order && parts && !i.qty ? '<span class="muted" title="作り置きしないので在庫は持ちません">—</span>' : `<b>${n(i.qty)}</b> <small>${esc(i.unit)}</small>`}${i.low ? `<div class="small warn-text">目安 ${n(i.reorder_point)} を下回り</div>` : ''}</td>
        <td class="num">${i.make_on_order && parts ? `${n(i.available)} <small>${esc(i.unit)}</small>` : '<span class="muted">—</span>'}</td>
        <td class="num">${i.unit_cost ? `${n(i.unit_cost)}<small>円</small>` : '<span class="muted">未設定</span>'}</td>
        <td class="num">${yen(Math.max(0, i.qty) * i.unit_cost)}</td>
      </tr>`;
    }).join('')}</tbody>`;
  for (const b of $$('[data-open]', $('#stock-table'))) b.addEventListener('click', () => openItem(Number(b.dataset.open)));
}
$('#search').addEventListener('input', renderStock);
$('#show-archived').addEventListener('change', renderStock);
$('#new-item').addEventListener('click', () => openItem(null));

// ── 品目の編集 ──
const dialog = $('#item-dialog');
for (const b of $$('[data-close]', dialog)) b.addEventListener('click', () => dialog.close());
$('#kind-select').innerHTML = Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v.label}（${v.hint}）</option>`).join('');

function bomLine(childId = null, qty = '') {
  const div = document.createElement('div');
  div.className = 'line';
  div.innerHTML = `<select>${itemOptions(childId, { exclude: state.editing?.id })}</select>
    <span class="unit-input"><input type="number" step="any" min="0" inputmode="decimal" value="${qty}" placeholder="使う量"><span class="u"></span></span>
    <button type="button" class="ghost small" aria-label="削除">✕</button>`;
  const sync = () => {
    $('.u', div).textContent = state.byId.get(Number($('select', div).value))?.unit || '';
    updateBomCost();
  };
  $('select', div).addEventListener('change', sync);
  $('input', div).addEventListener('input', updateBomCost);
  $('button', div).addEventListener('click', () => { div.remove(); updateBomCost(); });
  $('#bom-lines').append(div);
  sync();
}

function readBom() {
  return $$('#bom-lines .line').map((l) => ({ child_id: Number($('select', l).value), qty: Number($('input', l).value) })).filter((p) => p.child_id && p.qty > 0);
}

function extraLine(label = '', amount = '') {
  const div = document.createElement('div');
  div.className = 'line extra';
  div.innerHTML = `<input list="extra-labels" placeholder="費目（袋詰費用など）" value="${esc(label)}" maxlength="20">
    <span class="unit-input"><input type="number" step="any" min="0" inputmode="decimal" value="${amount}" placeholder="金額"><span>円</span></span>
    <button type="button" class="ghost small" aria-label="削除">✕</button>`;
  for (const i of $$('input', div)) i.addEventListener('input', updateBomCost);
  $('button', div).addEventListener('click', () => { div.remove(); updateBomCost(); });
  $('#extra-lines').append(div);
}

function readExtras() {
  return $$('#extra-lines .line').map((l) => { const [a, b] = $$('input', l); return { label: a.value.trim(), amount: b.value }; })
    .filter((e) => e.label || e.amount !== '');
}

// 編集中の構成・加工費で原価を計算する（保存前でも見えるように）
function draftBreakdown() {
  const id = state.editing?.id ?? -1;
  const f = $('#item-form');
  const items = new Map(state.byId);
  items.set(id, { ...(state.editing || {}), id, kind: f.kind.value, unit: f.unit.value, unit_cost: Number(f.unit_cost.value) || 0,
    cost_extras: JSON.stringify(readExtras().map((e) => ({ label: e.label || 'その他', amount: Number(e.amount) || 0 }))) });
  const bom = [...state.bom.filter((b) => b.parent_id !== id), ...readBom().map((p) => ({ parent_id: id, ...p }))];
  try {
    return costBreakdown(id, items, indexBom(bom));
  } catch {
    return null;
  }
}

function updateBomCost() {
  const b = draftBreakdown();
  const box = $('#cost-sum');
  if (!b || !b.standard) {
    box.innerHTML = '<p class="muted small">構成か加工費を入れると、ここに原価と原価率が出ます。</p>';
    return;
  }
  const price = Number($('#item-form').price.value) || null;
  const r = costRate(b.total, price);
  const unit = $('#item-form').unit.value || '個';
  box.innerHTML = `<div class="cost-eq">
      <span><small>中身</small>${yen1(b.contents)}</span><i>＋</i><span><small>資材</small>${yen1(b.supplies)}</span><i>＋</i>
      <span><small>加工費など</small>${yen1(b.labor)}</span><i>＝</i><span class="total"><small>原価（1${esc(unit)}）</small>${yen1(b.total)}</span>
      ${price ? `<span class="rate ${rateClass(r)}"><small>原価率</small>${pct(r)}</span><span><small>粗利</small>${yen1(price - b.total)}</span>` : ''}
    </div>
    ${state.editing ? `<button type="button" class="small" id="bom-apply">この原価を在庫単価にする</button>` : ''}`;
  $('#bom-apply')?.addEventListener('click', applyItemCost);
}

async function openItem(id) {
  const it = id ? state.byId.get(id) : { kind: 'supply', unit: '個', unit_cost: 0 };
  state.editing = id ? it : null;
  const f = $('#item-form');
  $('#item-title').textContent = id ? it.name : '品目を追加';
  for (const k of ['name', 'kind', 'unit', 'unit_cost', 'price', 'reorder_point', 'sku', 'note']) f[k].value = it[k] ?? '';
  f.make_on_order.checked = !!it.make_on_order;
  f.push_to_shopify.checked = !!it.push_to_shopify;
  f.archived.checked = !!it.archived;
  $('#push-row').hidden = !it.shopify_inventory_item_id;
  $('#item-shopify').textContent = it.shopify_variant_id ? `Shopify の商品と結びついています${it.pushed_qty != null ? `（最後に送った数：${it.pushed_qty}）` : ''}` : '';
  $('#item-delete').hidden = !id || state.user.role !== 'admin';
  $('#item-error').textContent = '';
  $('.bom-unit').textContent = it.unit || '個';
  $('#bom-lines').innerHTML = '';
  for (const b of state.bom.filter((b) => b.parent_id === id)) bomLine(b.child_id, b.qty);
  $('#extra-lines').innerHTML = '';
  for (const e of extrasOfItem(it)) extraLine(e.label, e.amount);
  updateBomCost();
  $('#item-history').innerHTML = '';
  dialog.showModal();
  if (id) {
    const list = await api(`/batches?item=${id}`).catch(() => []);
    $('#item-history').innerHTML = list.length ? `<h2>入出庫（新しい順）</h2><table class="mini">${list.slice(0, 30).map((b) => {
      const m = b.moves.find((x) => x.item_id === id);
      return `<tr><td>${fmtDate(b.at)}</td><td>${b.label}</td><td>${esc(b.ref || b.note || '')}</td><td class="num ${m.qty < 0 ? 'minus' : 'plus'}">${m.qty > 0 ? '+' : ''}${n(m.qty)}</td></tr>`;
    }).join('')}</table>` : '<p class="muted small">まだ入出庫の記録はありません。</p>';
  }
}

$('#bom-add').addEventListener('click', () => bomLine());
$('#extra-add').addEventListener('click', () => extraLine());
$('#extra-labels').innerHTML = EXTRA_LABELS.map((l) => `<option>${l}</option>`).join('');
for (const k of ['price', 'unit_cost', 'unit', 'kind']) $('#item-form')[k].addEventListener('input', updateBomCost);
function extrasOfItem(it) {
  try { return JSON.parse(it.cost_extras || '[]'); } catch { return []; }
}
$('#item-form').unit.addEventListener('input', (e) => ($('.bom-unit').textContent = e.target.value || '個'));

$('#item-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const data = {
    name: f.name.value, kind: f.kind.value, unit: f.unit.value, unit_cost: f.unit_cost.value || 0, price: f.price.value, cost_extras: readExtras(), reorder_point: f.reorder_point.value,
    sku: f.sku.value, note: f.note.value, make_on_order: f.make_on_order.checked, push_to_shopify: f.push_to_shopify.checked, archived: f.archived.checked,
  };
  $('#item-error').textContent = '';
  await busy($('#item-save'), async () => {
    try {
      let id = state.editing?.id;
      if (id) await api(`/items/${id}`, { method: 'PATCH', json: data });
      else id = (await api('/items', { method: 'POST', json: data })).id;
      await api(`/items/${id}/bom`, { method: 'PUT', json: { parts: readBom() } });
      await loadItems();
      dialog.close();
      toast('保存しました');
      TABS[tab]?.();
    } catch (err) {
      $('#item-error').textContent = err.message;
    }
  }).catch(() => {});
});

// 編集中の構成・加工費を保存してから、標準原価を在庫単価にする
async function applyItemCost(e) {
  const f = $('#item-form');
  await busy(e.currentTarget, async () => {
    await api(`/items/${state.editing.id}`, { method: 'PATCH', json: { cost_extras: readExtras(), price: f.price.value } });
    await api(`/items/${state.editing.id}/bom`, { method: 'PUT', json: { parts: readBom() } });
    const r = await api(`/items/${state.editing.id}/rollup`, { method: 'POST' });
    f.unit_cost.value = r.unit_cost;
    await loadItems();
    toast(`在庫単価を ${n(r.unit_cost)}円 にしました`);
  }).catch(() => {});
}

$('#item-delete').addEventListener('click', async (e) => {
  if (!confirm(`「${state.editing.name}」を削除しますか？`)) return;
  await busy(e.currentTarget, async () => {
    await api(`/items/${state.editing.id}`, { method: 'DELETE' });
    await loadItems();
    dialog.close();
    TABS[tab]?.();
  }).catch(() => {});
});

// ── 入出庫 ──
const ENTRY = {
  receive: { hint: '仕入れた・届いたもの（荒茶・袋・缶・ティーバッグ・仕入れ商品など）。単価を入れると在庫の単価が移動平均で更新されます。', cost: true },
  produce: { hint: '製造・焙煎・ブレンド・袋詰めなど。できたものを選ぶと、構成から「使ったもの」を計算します（量は直せます）。できたものの単価は、使ったものの原価から自動で計算します。' },
  waste: { hint: '破損・期限切れ・試飲サンプルなど、在庫から外すもの。' },
  adjust: { hint: '数の訂正（＋で増やす、−で減らす）。数えた数に合わせるときは「棚卸」を使ってください。' },
};

for (const b of $$('#entry-kind button')) b.addEventListener('click', () => {
  state.entryKind = b.dataset.kind;
  for (const x of $$('#entry-kind button')) x.classList.toggle('active', x === b);
  renderEntry();
});

function entryLine(itemId = null, qty = '') {
  const kind = state.entryKind;
  const div = document.createElement('div');
  div.className = 'line';
  div.innerHTML = `<select>${itemOptions(itemId)}</select>
    <span class="unit-input"><input type="number" step="any" ${kind === 'adjust' ? '' : 'min="0"'} inputmode="decimal" value="${qty}" placeholder="${kind === 'adjust' ? '増減（−も可）' : '数量'}" class="q"><span class="u"></span></span>
    ${ENTRY[kind].cost ? '<span class="unit-input"><input type="number" step="any" min="0" inputmode="decimal" placeholder="単価（任意）" class="c"><span>円</span></span>' : ''}
    <button type="button" class="ghost small" aria-label="削除">✕</button>`;
  const sync = () => ($('.u', div).textContent = state.byId.get(Number($('select', div).value))?.unit || '');
  $('select', div).addEventListener('change', sync);
  $('button', div).addEventListener('click', () => div.remove());
  $('#entry-lines').append(div);
  sync();
}

function renderEntry() {
  const kind = state.entryKind;
  const f = $('#entry-form');
  if (!f.date.value) f.date.value = today();
  $('#entry-hint').textContent = ENTRY[kind].hint;
  $('#produce-out').hidden = kind !== 'produce';
  $('#entry-lines').innerHTML = '';
  if (kind === 'produce') {
    $('#output-select').innerHTML = itemOptions(Number($('#output-select').value) || null);
    fillProduce();
  } else {
    entryLine();
  }
}

// できたものと量から、使ったものを構成で計算する
function fillProduce() {
  const out = state.byId.get(Number($('#output-select').value));
  const qty = Number($('#entry-form').output_qty.value) || 0;
  $('#output-unit').textContent = out?.unit || '';
  $('#entry-lines').innerHTML = '';
  const parts = out ? state.bom.filter((b) => b.parent_id === out.id) : [];
  $('#produce-note').textContent = out && !parts.length ? 'この品目には構成が入っていません。使ったものを下に入れてください（品目の画面で構成を入れると、次から自動で計算します）。' : '';
  for (const p of parts) entryLine(p.child_id, qty ? Math.round(p.qty * qty * 1000) / 1000 : '');
  if (!parts.length) entryLine();
}
$('#output-select').addEventListener('change', fillProduce);
$('#entry-form').output_qty.addEventListener('input', fillProduce);
$('#add-line').addEventListener('click', () => entryLine());

$('#entry-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const kind = state.entryKind;
  const lines = $$('#entry-lines .line').map((l) => ({
    item_id: Number($('select', l).value), qty: $('.q', l).value, unit_cost: $('.c', l)?.value || null,
  })).filter((l) => l.item_id && l.qty !== '');
  const body = { kind, at: atOf(f.date.value), note: f.note.value, lines };
  if (kind === 'produce') Object.assign(body, { output_id: Number(f.output_id.value), output_qty: f.output_qty.value });
  await busy($('#entry-submit'), async () => {
    await api('/batches', { method: 'POST', json: body });
    await loadItems();
    toast(`${BATCH_KINDS[kind]}を記録しました`);
    f.note.value = '';
    f.output_qty.value = '';
    renderEntry();
  }).catch(() => {});
});

// ── 棚卸 ──
function renderCount() {
  if (!$('#count-date').value) $('#count-date').value = today();
  kindSeg($('#count-kind'), state.countKind, (k) => { state.countKind = k; renderCount(); });
  const rows = active().filter((i) => state.countKind === 'all' || i.kind === state.countKind)
    .filter((i) => !(i.make_on_order && state.bom.some((b) => b.parent_id === i.id))); // 都度詰めの製品は在庫を持たない
  $('#count-table').innerHTML = `<thead><tr><th>品目</th><th>種類</th><th class="num">帳簿</th><th class="num">数えた数</th><th class="num">差</th></tr></thead>
    <tbody>${rows.map((i) => `<tr data-id="${i.id}"><td>${esc(i.name)}</td><td><span class="kind k-${i.kind}">${kindLabel(i.kind)}</span></td>
      <td class="num">${n(i.qty)} <small>${esc(i.unit)}</small></td>
      <td class="num"><input type="number" step="any" min="0" inputmode="decimal" class="counted"></td><td class="num diff"></td></tr>`).join('')}</tbody>`;
  for (const tr of $$('#count-table tbody tr')) {
    $('input', tr).addEventListener('input', (e) => {
      const it = state.byId.get(Number(tr.dataset.id));
      const v = e.target.value;
      const d = v === '' ? null : Math.round((Number(v) - it.qty) * 1000) / 1000;
      $('.diff', tr).textContent = d == null ? '' : `${d > 0 ? '+' : ''}${n(d)}`;
      $('.diff', tr).className = `num diff ${d < 0 ? 'minus' : d > 0 ? 'plus' : ''}`;
      $('#count-status').textContent = `${$$('#count-table .counted').filter((x) => x.value !== '').length}品目 入力中`;
    });
  }
}

$('#count-submit').addEventListener('click', async (e) => {
  const lines = $$('#count-table tbody tr').map((tr) => ({ item_id: Number(tr.dataset.id), counted: $('input', tr).value })).filter((l) => l.counted !== '');
  if (!lines.length) return toast('数えた数を入れてください');
  await busy(e.currentTarget, async () => {
    const r = await api('/batches', { method: 'POST', json: { kind: 'count', at: atOf($('#count-date').value, '23:00'), note: `${lines.length}品目を棚卸`, lines } });
    await loadItems();
    $('#count-status').textContent = '';
    renderCount();
    toast(r.changed ? `棚卸を記録しました（差があったのは ${r.changed}品目）` : '帳簿どおりでした');
  }).catch(() => {});
});


// ── 原価計算 ──
const COST_KINDS = { sell: ['製品・商品', ['product', 'goods']], mid: ['半製品・仕掛品', ['semi', 'wip']], all: ['すべて', null] };
const graph = () => ({ map: state.byId, byParent: indexBom(state.bom) });

function costRows() {
  const g = graph();
  const kinds = COST_KINDS[state.costKind][1];
  const q = $('#cost-search').value.trim().toLowerCase();
  return active()
    .filter((i) => (!kinds || kinds.includes(i.kind)) && (!q || i.name.toLowerCase().includes(q)))
    .map((i) => {
      let b;
      try { b = costBreakdown(i.id, g.map, g.byParent); } catch { b = null; }
      return { i, b, rate: b?.standard ? costRate(b.total, i.price) : null };
    })
    .filter((r) => r.b?.standard || r.i.price);
}

function renderCost() {
  $('#cost-kind').innerHTML = Object.entries(COST_KINDS).map(([k, [label]]) => `<button data-k="${k}" class="${k === state.costKind ? 'active' : ''}">${label}</button>`).join('');
  for (const b of $$('#cost-kind button')) b.addEventListener('click', () => { state.costKind = b.dataset.k; renderCost(); });
  const rows = costRows();
  const withRate = rows.filter((r) => r.rate != null);
  const avg = withRate.length ? withRate.reduce((s, r) => s + r.rate, 0) / withRate.length : null;
  const missing = rows.filter((r) => !r.b?.standard).length;
  const drift = rows.filter((r) => r.b?.standard && Math.abs(r.b.total - r.i.unit_cost) >= 0.5).length;
  const high = withRate.filter((r) => r.rate >= 0.6).length;
  $('#cost-summary').innerHTML = `
    <div class="stat"><span>原価率の平均</span><b>${pct(avg)}</b><em>販売価格が入っている ${withRate.length}品目</em></div>
    <div class="stat ${high ? 'warn' : ''}"><span>原価率 60% 以上</span><b>${high}<small>品目</small></b></div>
    <div class="stat ${missing ? 'warn' : ''}"><span>原価の計算が未設定</span><b>${missing}<small>品目</small></b><em>構成も加工費も入っていない</em></div>
    <div class="stat"><span>在庫単価とずれ</span><b>${drift}<small>品目</small></b></div>`;
  if (!rows.length) {
    $('#cost-table').innerHTML = '<tbody><tr><td class="empty">まだ原価の計算がありません。品目の画面で構成（中身・袋）と加工費（袋詰費用・保管料など）を入れてください。</td></tr></tbody>';
    return;
  }
  $('#cost-table').innerHTML = `<thead><tr><th>品目</th><th class="num">中身</th><th class="num">資材</th><th class="num">加工費など</th><th class="num">原価</th><th class="num">販売価格</th><th class="num">原価率</th><th class="num">粗利</th><th class="num">在庫単価</th></tr></thead>
    <tbody>${rows.map(({ i, b, rate }) => {
      const open = state.costOpen.has(i.id);
      const std = b?.standard;
      const drift = std && Math.abs(b.total - i.unit_cost) >= 0.5;
      const head = `<tr class="cost-row ${open ? 'open' : ''}" data-id="${i.id}">
        <td><button class="link" data-open="${i.id}">${esc(i.name)}</button> <span class="kind k-${i.kind}">${kindLabel(i.kind)}</span><div class="muted small">1${esc(i.unit)}あたり</div></td>
        <td class="num">${std ? yen1(b.contents) : ''}</td><td class="num">${std ? yen1(b.supplies) : ''}</td><td class="num">${std ? yen1(b.labor) : ''}</td>
        <td class="num"><b>${std ? yen1(b.total) : '<span class="muted">未設定</span>'}</b></td>
        <td class="num">${i.price ? yen(i.price) : '<span class="muted">—</span>'}</td>
        <td class="num"><span class="rate ${rateClass(rate)}">${pct(rate)}</span></td>
        <td class="num">${std && i.price ? yen1(i.price - b.total) : ''}</td>
        <td class="num ${drift ? 'warn-text' : ''}">${yen1(i.unit_cost)}${drift ? '<div class="small">ずれ</div>' : ''}</td></tr>`;
      if (!open || !std) return head;
      const lines = b.lines.map((l) => `<li><span>${esc(l.name)}</span><span>${n(l.qty)}${esc(l.unit)} × ${yen1(l.cost)}</span><b>${yen1(l.amount)}</b></li>`).join('');
      const extras = b.extras.map((e) => `<li><span>${esc(e.label)}</span><span></span><b>${yen1(e.amount)}</b></li>`).join('');
      return head + `<tr class="cost-detail"><td colspan="9"><ul class="breakdown">${lines}${extras}<li class="sum"><span>原価</span><span></span><b>${yen1(b.total)}</b></li></ul></td></tr>`;
    }).join('')}</tbody>`;
  for (const tr of $$('#cost-table .cost-row')) tr.addEventListener('click', (e) => {
    if (e.target.closest('[data-open]')) return;
    const id = Number(tr.dataset.id);
    if (state.costOpen.has(id)) state.costOpen.delete(id); else state.costOpen.add(id);
    renderCost();
  });
  for (const b of $$('[data-open]', $('#cost-table'))) b.addEventListener('click', () => openItem(Number(b.dataset.open)));
}
$('#cost-search').addEventListener('input', renderCost);
$('#cost-apply').addEventListener('click', async (e) => {
  const ids = costRows().filter((r) => r.b?.standard && Math.abs(r.b.total - r.i.unit_cost) >= 0.005).map((r) => r.i.id);
  if (!ids.length) return toast('在庫単価はすでに原価と揃っています');
  if (!confirm(`${ids.length}品目の在庫単価を、原価計算の結果に置きかえますか？（在庫評価の金額が変わります）`)) return;
  await busy(e.currentTarget, async () => {
    const r = await api('/costs/apply', { method: 'POST', json: { ids } });
    await loadItems();
    renderCost();
    toast(`${r.updated}品目の在庫単価を更新しました`);
  }).catch(() => {});
});

// ── 在庫評価 ──
function fiscalEnd() {
  const t = today();
  const y = Number(t.slice(0, 4));
  return t.slice(5) <= '03-31' ? `${y}-03-31` : `${y + 1}-03-31`;
}

async function loadValue() {
  if (!$('#value-date').value) $('#value-date').value = today();
  const date = $('#value-date').value;
  $('#value-csv').href = `/api/valuation.csv?date=${date}`;
  const v = await api(`/valuation?date=${date}`);
  $('#value-totals').innerHTML = Object.entries(v.totals).map(([k, total]) => `<div class="stat"><span>${KINDS[k].account}</span><b>${yen(total)}</b></div>`).join('')
    + `<div class="stat total"><span>棚卸資産 合計</span><b>${yen(v.total)}</b></div>`;
  $('#value-table').innerHTML = `<thead><tr><th>勘定科目</th><th>品目</th><th class="num">数量</th><th class="num">単価</th><th class="num">金額</th></tr></thead>
    <tbody>${v.rows.map((r) => `<tr class="${r.qty < 0 ? 'neg' : ''}"><td><span class="kind k-${r.kind}">${KINDS[r.kind].account}</span></td><td>${esc(r.name)}</td>
      <td class="num">${n(r.qty)} <small>${esc(r.unit)}</small></td><td class="num">${n(r.unit_cost)}</td><td class="num">${yen(r.value)}</td></tr>`).join('')}</tbody>`;
}
$('#value-date').addEventListener('change', loadValue);
$('#value-fy').addEventListener('click', () => { $('#value-date').value = fiscalEnd(); loadValue(); });

// ── 履歴 ──
async function loadHistory(reset) {
  if (reset) state.history = [];
  const before = state.history.at(-1)?.id;
  const list = await api(`/batches${before ? `?before=${before}` : ''}`);
  state.history.push(...list);
  $('#history-more').hidden = list.length < 50;
  $('#history').innerHTML = state.history.length ? state.history.map((b) => `
    <div class="batch k-${b.kind}">
      <div class="batch-head"><span class="badge">${b.label}</span><b>${fmtDate(b.at)}</b><span class="muted">${esc(b.ref || '')}</span>
        <span class="muted small grow">${esc(b.note || '')}</span><span class="muted small">${esc(b.created_by || '')}</span>
        ${b.note?.startsWith('取消済') ? '' : `<button class="ghost small" data-reverse="${b.id}">取り消す</button>`}</div>
      <div class="moves">${b.moves.map((m) => `<span class="${m.qty < 0 ? 'minus' : 'plus'}">${esc(m.name)} ${m.qty > 0 ? '+' : ''}${n(m.qty)}${esc(m.unit)}</span>`).join('')}</div>
    </div>`).join('') : '<p class="empty">まだ記録がありません。</p>';
  for (const b of $$('[data-reverse]')) b.addEventListener('click', async () => {
    if (!confirm('この伝票を取り消しますか？（逆向きの伝票を足して、在庫を元に戻します）')) return;
    await busy(b, async () => {
      await api(`/batches/${b.dataset.reverse}/reverse`, { method: 'POST' });
      await loadItems();
      loadHistory(true);
      toast('取り消しました');
    }).catch(() => {});
  });
}
$('#history-more').addEventListener('click', () => loadHistory(false));

// ── Shopify ──
async function loadShopify() {
  const s = await api('/shopify');
  const admin = state.user.role === 'admin';
  const el = $('#shopify');
  const last = s.last_sync;
  const pushCount = state.items.filter((i) => i.push_to_shopify).length;
  const linked = state.items.filter((i) => i.shopify_variant_id).length;
  el.innerHTML = `
    <div class="card">
      <h2>接続</h2>
      ${s.connected ? `<p><span class="tag shop">接続中</span> <b>${esc(s.shop_name || s.shop)}</b> <span class="muted small">${esc(s.shop)}</span></p>` : '<p class="muted">まだつながっていません。</p>'}
      ${admin ? `<details ${s.connected ? '' : 'open'}><summary>${s.connected ? '鍵を入れ直す' : 'つなぐ'}</summary>
        <form id="shopify-form" class="grid2">
          <label class="span2">ストアのドメイン<input name="shop" placeholder="yusando.myshopify.com" value="${esc(s.shop || '')}" required></label>
          <label class="span2">Admin API アクセストークン（shpat_…）<input name="access_token" type="password" autocomplete="off"></label>
          <p class="muted small span2">または Dev Dashboard のアプリ（2026年以降の新しいアプリ）の場合：</p>
          <label>クライアントID<input name="client_id" autocomplete="off"></label>
          <label>クライアントシークレット<input name="client_secret" type="password" autocomplete="off"></label>
          <p class="muted small span2">必要な権限：read_products・read_orders・read_inventory・write_inventory・read_locations。作り方は README の「Shopify とつなぐ」。</p>
          <div class="row end span2">${s.connected ? '<button type="button" class="ghost danger" id="shopify-disconnect">接続を外す</button>' : ''}<button class="primary">接続する</button></div>
        </form></details>` : ''}
    </div>
    ${s.connected ? `
    <div class="card">
      <h2>商品の取り込み</h2>
      <p class="muted small">Shopify の商品（バリエーションごと）を「製品」として取り込みます。取り込み済みは重複しません。いま ${linked}品目 が結びついています。取り込んだら、各製品に構成（中身の茶葉・袋・ティーバッグ・ラベルなど）を入れてください。</p>
      <button class="primary" id="shopify-import">商品を取り込む</button>
    </div>
    <div class="card">
      <h2>注文の取り込み（在庫を引く）</h2>
      <p class="muted small">10分ごとに自動で、新しい注文の分だけ在庫を引きます（作り置きしない製品は、構成品＝茶葉・袋などから引く）。キャンセルされた注文は戻します。同じ注文を二度引くことはありません。</p>
      <p>最後の取り込み：${last ? `${fmtTime(last.at)}${last.error ? ` <span class="error">失敗：${esc(last.error)}</span>` : last.orders ? `（新しい注文 ${last.orders.sold}件・キャンセル ${last.orders.cancelled}件）` : ''}` : 'まだ'}</p>
      <div class="row wrap">
        <button class="primary" id="shopify-sync">いま取り込む</button>
        ${admin ? `<label class="inline">この日時より後に更新された注文を取り込む<input type="datetime-local" id="orders-since" value="${s.orders_since ? toLocalInput(s.orders_since) : ''}"></label><button class="small" id="orders-since-save">変える</button>` : ''}
      </div>
      ${s.unmapped.length ? `<div class="unmapped"><h3>品目に結びついていない商品（在庫を引けなかった分）</h3>
        <ul>${s.unmapped.map((u) => `<li>${esc(u.name)} <b>×${u.qty}</b> <span class="muted small">${esc(u.orders.join(' '))}</span></li>`).join('')}</ul>
        <p class="muted small">「商品を取り込む」を押すと品目になります。すでに引けなかった注文の分は、入出庫の「調整」で直してください。</p></div>` : ''}
    </div>
    <div class="card">
      <h2>在庫数を Shopify に反映</h2>
      <p class="muted small">品目の画面で「Shopify に反映する」にした製品（いま ${pushCount}品目）の在庫数を送ります。作り置きしない製品は「作れる数」を送るので、袋や茶葉が切れたら Shopify でも売り切れになります。注文の取り込みのあとに自動で送ります。</p>
      <div class="row wrap">
        <label class="inline">反映するロケーション<select id="location" ${admin ? '' : 'disabled'}>${s.locations.map((l) => `<option value="${esc(l.id)}" ${l.id === s.location_id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
        <button class="primary" id="shopify-push" ${pushCount ? '' : 'disabled'}>いま反映する</button>
      </div>
      ${last?.push?.errors?.length ? `<p class="error">${esc(last.push.errors.join('\n'))}</p>` : ''}
      <p class="muted small">はじめて反映する商品は、Shopify 側で「在庫を追跡する」がオンになります。</p>
    </div>` : ''}`;

  $('#shopify-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    await busy($('button.primary', f), async () => {
      await api('/shopify', { method: 'PUT', json: { shop: f.shop.value, access_token: f.access_token.value, client_id: f.client_id.value, client_secret: f.client_secret.value } });
      toast('Shopify とつながりました');
      loadShopify();
    }).catch(() => {});
  });
  $('#shopify-disconnect')?.addEventListener('click', async () => {
    if (!confirm('Shopify との接続を外しますか？（品目と記録は残ります）')) return;
    await api('/shopify', { method: 'DELETE' });
    loadShopify();
  });
  $('#shopify-import')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const r = await api('/shopify/import', { method: 'POST' });
    await loadItems();
    toast(`${r.added}品目を追加しました（Shopify のバリエーション ${r.total}件）`);
    loadShopify();
  }).catch(() => {}));
  $('#shopify-sync')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const r = await api('/shopify/sync', { method: 'POST' });
    await loadItems();
    toast(`新しい注文 ${r.orders.sold}件・キャンセル ${r.orders.cancelled}件を取り込みました`);
    loadShopify();
  }).catch(() => {}));
  $('#shopify-push')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const r = await api('/shopify/push', { method: 'POST', json: { force: true } });
    await loadItems();
    toast(r.errors.length ? `一部失敗しました：${r.errors[0]}` : `${r.pushed}品目の在庫数を送りました`);
  }).catch(() => {}));
  $('#location')?.addEventListener('change', async (e) => {
    await api('/shopify/settings', { method: 'PATCH', json: { location_id: e.target.value } }).catch((err) => toast(err.message));
    toast('ロケーションを変えました');
  });
  $('#orders-since-save')?.addEventListener('click', async () => {
    const v = $('#orders-since').value;
    if (!v) return;
    await api('/shopify/settings', { method: 'PATCH', json: { orders_since: new Date(v).toISOString() } }).catch((err) => toast(err.message));
    toast('取り込み開始日時を変えました。「いま取り込む」で反映されます');
  });
}

const toLocalInput = (iso) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

// ── メンバー ──
async function loadMembers() {
  const list = await api('/members');
  $('#members').innerHTML = list.length ? list.map((m) => `
    <div class="member ${m.disabled ? 'off' : ''}"><div><b>${esc(m.name)}</b> <span class="muted small">${esc(m.email)}</span><br>
      <small class="muted">${m.role === 'admin' ? '管理者' : 'スタッフ'}・${m.last_login_at ? `最終ログイン ${fmtTime(m.last_login_at)}` : 'まだログインしていません'}</small></div>
      <div class="row"><button class="small" data-toggle="${m.id}" data-role="${m.role}" data-disabled="${m.disabled}">${m.disabled ? '再開' : '停止'}</button>
      <button class="ghost small danger" data-del="${m.id}">削除</button></div></div>`).join('') : '<p class="muted small">まだメンバーはいません（オーナーは合言葉か OWNER_EMAILS のメールで入れます）。</p>';
  for (const b of $$('[data-toggle]')) b.addEventListener('click', async () => {
    await api(`/members/${b.dataset.toggle}`, { method: 'PATCH', json: { role: b.dataset.role, disabled: b.dataset.disabled !== '1' } });
    loadMembers();
  });
  for (const b of $$('[data-del]')) b.addEventListener('click', async () => {
    if (!confirm('このメンバーを削除しますか？')) return;
    await api(`/members/${b.dataset.del}`, { method: 'DELETE' });
    loadMembers();
  });
}
$('#member-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  await busy($('button', f), async () => {
    await api('/members', { method: 'POST', json: { name: f.name.value, email: f.email.value, role: f.role.value } });
    f.reset();
    loadMembers();
  }).catch(() => {});
});

// ── 起動 ──
async function start() {
  const { user } = await api('/me');
  state.user = user;
  $('#who').textContent = user.name;
  for (const b of $$('[data-admin]')) b.hidden = user.role !== 'admin';
  await loadItems();
  $('#login').hidden = true;
  $('#app').hidden = false;
  const want = location.hash.slice(1);
  show(TABS[want] && (want !== 'members' || user.role === 'admin') ? want : 'stock');
}

start().catch(showLogin);
