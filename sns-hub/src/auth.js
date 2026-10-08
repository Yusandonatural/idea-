import { b64, getKeys, hmacSign, hmacVerify, safeEqual, unb64 } from './crypto.js';

const COOKIE = 'sns_hub';
const TTL = 30 * 24 * 3600; // 30日
const ITERATIONS = 100000; // Workers の PBKDF2 の上限
const te = new TextEncoder();

// オーナー（ADMIN_PASSWORD でログインする人）。メンバーを1人も作らなくても使える
export const OWNER = { id: 0, name: 'オーナー', login: '', role: 'admin', session_version: 0 };

export async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(bits)}`;
}

export async function verifyPassword(password, stored) {
  const [, , salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  const again = await hashPassword(password, unb64(salt));
  return safeEqual(again.split('$')[3], hash);
}

async function sessionCookie(env, user) {
  const { hmac } = await getKeys(env.APP_SECRET);
  const exp = Math.floor(Date.now() / 1000) + TTL;
  const data = `${user.id}.${user.session_version}.${exp}`;
  return `${COOKIE}=${data}.${await hmacSign(hmac, data)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL}`;
}

// ログインIDが空ならオーナー、あればメンバーとしてログイン
export async function login(env, loginId, password) {
  const id = String(loginId ?? '').trim().toLowerCase();
  if (!id) {
    if (!env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD が設定されていません');
    return safeEqual(password ?? '', env.ADMIN_PASSWORD) ? { user: OWNER, cookie: await sessionCookie(env, OWNER) } : null;
  }
  const user = await env.DB.prepare('SELECT * FROM users WHERE login = ? AND disabled = 0').bind(id).first();
  // 該当なしでも同じくらい時間をかけて、IDの有無を推測されにくくする
  const ok = await verifyPassword(password ?? '', user?.password_hash ?? 'pbkdf2$0$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
  if (!user || !ok) return null;
  await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(Date.now(), user.id).run();
  return { user, cookie: await sessionCookie(env, user) };
}

export function logoutCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

// Cookie からログイン中の人を取り出す。パスワード変更・停止・削除でその人のログインは切れる
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
  const user = await env.DB.prepare('SELECT id, login, name, role, session_version FROM users WHERE id = ? AND disabled = 0').bind(Number(uid)).first();
  if (!user || String(user.session_version) !== ver) return null;
  return user;
}

// 書き込み系は同じオリジンからのみ受け付ける
export function sameOrigin(req) {
  const origin = req.headers.get('origin');
  return !origin || origin === new URL(req.url).origin;
}
