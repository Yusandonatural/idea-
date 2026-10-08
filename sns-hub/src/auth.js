import { getKeys, hmacSign, hmacVerify, safeEqual } from './crypto.js';

const COOKIE = 'sns_hub';
const TTL = 30 * 24 * 3600; // 30日

export async function login(env, password) {
  if (!env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD が設定されていません');
  if (!safeEqual(password ?? '', env.ADMIN_PASSWORD)) return null;
  const { hmac } = await getKeys(env.APP_SECRET);
  const exp = Math.floor(Date.now() / 1000) + TTL;
  const value = `${exp}.${await hmacSign(hmac, String(exp))}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL}`;
}

export function logoutCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function isAuthed(req, env) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const { hmac } = await getKeys(env.APP_SECRET);
  return hmacVerify(hmac, exp, sig);
}

// 書き込み系は同じオリジンからのみ受け付ける
export function sameOrigin(req) {
  const origin = req.headers.get('origin');
  return !origin || origin === new URL(req.url).origin;
}
