import { decryptJSON, encryptJSON, getKeys } from './crypto.js';

export const now = () => Date.now();

export async function loadAccount(env, id) {
  const row = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first();
  if (!row) return null;
  const { aes } = await getKeys(env.APP_SECRET);
  return { ...row, credentials: await decryptJSON(aes, row.credentials) };
}

export async function saveCredentials(env, id, credentials) {
  const { aes } = await getKeys(env.APP_SECRET);
  await env.DB.prepare('UPDATE accounts SET credentials = ?, updated_at = ? WHERE id = ?')
    .bind(await encryptJSON(aes, credentials), now(), id).run();
}

export async function encryptCreds(env, credentials) {
  const { aes } = await getKeys(env.APP_SECRET);
  return encryptJSON(aes, credentials);
}

export async function getSetting(env, key) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row?.value ?? null;
}

// 送る直前の本文：yusando.com のリンクに UTM（設定で切れる）、セットの自動ハッシュタグ
export async function loadSendOptions(env) {
  const [sets, utm] = await Promise.all([loadHashtagSets(env), getSetting(env, 'utm')]);
  return { sets, utm: utm !== 'off' };
}

export async function loadHashtagSets(env) {
  const { results } = await env.DB.prepare('SELECT * FROM hashtag_sets ORDER BY sort, id').all();
  return results.map((r) => ({ ...r, tags: JSON.parse(r.tags), auto_platforms: JSON.parse(r.auto_platforms) }));
}

export function publicAccount(row) {
  const { credentials, ...rest } = row;
  return rest;
}

export async function getPost(env, id) {
  const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  if (!post) return null;
  const { results } = await env.DB.prepare(
    `SELECT t.*, a.platform, a.name AS account_name FROM targets t JOIN accounts a ON a.id = t.account_id WHERE t.post_id = ? ORDER BY t.id`,
  ).bind(id).all();
  return { ...post, media: JSON.parse(post.media), targets: results };
}
