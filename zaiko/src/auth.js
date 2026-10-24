import { getKeys, hmacSign, hmacVerify, safeEqual } from './crypto.js';
import { TokenError, verifyFirebaseToken } from './google.js';

const COOKIE = 'zaiko';
const TTL = 30 * 24 * 3600; // 30日

// オーナー（ADMIN_PASSWORD か OWNER_EMAILS でログインする人）。メンバーを1人も作らなくても使える
export const OWNER = { id: 0, name: 'オーナー', email: null, role: 'admin', session_version: 0 };

async function sessionCookie(env, user) {
  const { hmac } = await getKeys(env.APP_SECRET);
  const exp = Math.floor(Date.now() / 1000) + TTL;
  const data = `${user.id}.${user.session_version}.${exp}`;
  return `${COOKIE}=${data}.${await hmacSign(hmac, data)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL}`;
}

// 合言葉（オーナー用の予備）
export async function loginWithPassword(env, password) {
  if (!env.ADMIN_PASSWORD) return null;
  return safeEqual(password ?? '', env.ADMIN_PASSWORD) ? { user: OWNER, cookie: await sessionCookie(env, OWNER) } : null;
}

export class LoginError extends Error {}

// Cloudflare の変数 OWNER_EMAILS（任意・カンマ区切り）に入れたメールは、Google ログインでオーナーになる
export const ownerEmails = (env) => String(env.OWNER_EMAILS || '').split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);

// Google でログイン：メンバー表に登録されたメールだけ通す
export async function loginWithGoogle(env, idToken) {
  let who;
  try {
    who = await verifyFirebaseToken(idToken, { projectId: env.FIREBASE_PROJECT_ID });
  } catch (e) {
    if (e instanceof TokenError) throw new LoginError(e.message);
    throw e;
  }
  if (ownerEmails(env).includes(who.email)) return { user: { ...OWNER, email: who.email }, cookie: await sessionCookie(env, OWNER) };
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ? AND disabled = 0').bind(who.email).first();
  if (!user) throw new LoginError(`この Google アカウント（${who.email}）はメンバーに登録されていません。管理者に「設定 → メンバー」で追加してもらってください`);
  await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(Date.now(), user.id).run();
  return { user, cookie: await sessionCookie(env, user) };
}

export function logoutCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

// Cookie からログイン中の人を取り出す。停止・削除でその人のログインは切れる
export async function currentUser(req, env) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length !== 4) return null;
  const [uid, ver, exp, sig] = parts;
  if (Number(exp) < Date.now() / 1000) return null;
  const { hmac } = await getKeys(env.APP_SECRET);
  if (!(await hmacVerify(hmac, `${uid}.${ver}.${exp}`, sig))) return null;
  if (uid === '0') return OWNER;
  const user = await env.DB.prepare('SELECT id, email, name, role, session_version FROM users WHERE id = ? AND disabled = 0').bind(Number(uid)).first();
  if (!user || String(user.session_version) !== ver) return null;
  return user;
}

// 書き込み系は同じオリジンからのみ受け付ける
export function sameOrigin(req) {
  const origin = req.headers.get('origin');
  return !origin || origin === new URL(req.url).origin;
}
