// ログインと記録の同期（Google ログイン＋Firebase）。
// 部品（./core/）は 90日フランス語（Yusandonatural/french-90days の src/sync/core/）と共通。
// 記録は Firestore の progress-<言語コード>/{ユーザーID}（中国語は progress-zh）に保存する。
// app.js が window.LANG90 で記録の読み書きを渡してくれる。
import { createCloudSync } from './core/cloud-sync.js';
import { mergeDeep, sameDeep } from './core/merge-deep.js';
import { mountSyncCard, SYNC_CARD_JA } from './core/sync-card.js';
import { FIREBASE_CONFIG } from './firebase-config.js';

const L = window.LANG90;
const EMULATOR = new URLSearchParams(location.search).has('emulator') && location.hostname === 'localhost';

// 間隔反復のカードは「箱」が進んでいる方（同じなら次回が遅い方）を、まるごと残す
function mergeSrs(x, y) {
  const out = {};
  for (const k of new Set([...Object.keys(x || {}), ...Object.keys(y || {})])) {
    const a = (x || {})[k], b = (y || {})[k];
    if (!a || !b) { out[k] = a || b; continue; }
    const win = (a.box || 0) !== (b.box || 0) ? ((a.box || 0) > (b.box || 0) ? a : b) : ((a.due || '') >= (b.due || '') ? a : b);
    out[k] = Object.assign({}, win, { miss: Math.max(a.miss || 0, b.miss || 0) || undefined });
    if (out[k].miss === undefined) delete out[k].miss;
  }
  return out;
}
// 自分のメモは id でまとめる（同じ id は新しく保存した側）
function mergeMemos(x, y, xIsNewer) {
  const [n, o] = xIsNewer ? [x || [], y || []] : [y || [], x || []];
  const ids = new Set(n.map(m => m.id));
  return [...n, ...o.filter(m => !ids.has(m.id))];
}

export const sync = createCloudSync({
  config: FIREBASE_CONFIG,
  collection: 'progress-' + L.code,
  getLocal: L.get,
  setLocal: L.replace,                 // 置き換えて画面も描き直す
  merge: (a, b) => mergeDeep(a, b, { newer: ['pinyin', 'theme', 'started'], resolve: { srs: mergeSrs, memos: mergeMemos } }),
  same: sameDeep,
  onLocalSaved: L.onSaved,
  onRemoteChange: () => {},
  emulator: EMULATOR,
  loadFirebase: () => Promise.all([
    import('../vendor/firebase/firebase-app.js'),
    import('../vendor/firebase/firebase-auth.js'),
    import('../vendor/firebase/firebase-firestore-lite.js'),
  ]),
});

const TEXT = Object.assign({}, SYNC_CARD_JA, { offTitle: '☁️ iPhone と Web で同じ記録を使う' });
const CLASSES = { panel: 'card', btn: 'btn small primary', ghost: 'btn small', actions: 'row', heading: 'inline' };
L.mountSync = el => mountSyncCard(el, sync, TEXT, CLASSES);
const el = document.getElementById('syncCard');
if (el) L.mountSync(el);   // 「その他」を開いたまま読み込まれたとき
sync.init();
