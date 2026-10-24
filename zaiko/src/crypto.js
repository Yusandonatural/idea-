// APP_SECRET から用途別の鍵を作る：ログインの署名（HMAC）とShopify の鍵の暗号化（AES-GCM）
const te = new TextEncoder();
const td = new TextDecoder();
const cache = new Map();

export function b64(buf) {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
}

export function unb64(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

export function b64url(buf) {
  return b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomId(bytes = 16) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getKeys(secret) {
  if (!secret) throw new Error('APP_SECRET が設定されていません');
  if (cache.has(secret)) return cache.get(secret);
  const base = await crypto.subtle.importKey('raw', te.encode(secret), 'HKDF', false, ['deriveKey']);
  const derive = (info, algo, usages) =>
    crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: te.encode('zaiko'), info: te.encode(info) },
      base, algo, false, usages,
    );
  const keys = {
    aes: await derive('credentials', { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']),
    hmac: await derive('session', { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign', 'verify']),
  };
  cache.set(secret, keys);
  return keys;
}

export async function encryptJSON(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), iv.length);
  return b64(out);
}

export async function decryptJSON(key, str) {
  const raw = unb64(str);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12));
  return JSON.parse(td.decode(pt));
}

export async function hmacSign(key, data) {
  return b64url(await crypto.subtle.sign('HMAC', key, te.encode(data)));
}

export async function hmacVerify(key, data, sig) {
  const expected = await hmacSign(key, data);
  return safeEqual(expected, sig);
}

export function safeEqual(a, b) {
  const x = te.encode(String(a));
  const y = te.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
