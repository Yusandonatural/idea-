// Google ログイン：ブラウザの Firebase Authentication が出した ID トークンを、Google の公開鍵で確かめる
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const te = new TextEncoder();
const td = new TextDecoder();
let cache = { keys: null, exp: 0 };

async function googleKeys() {
  if (cache.keys && Date.now() < cache.exp) return cache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`Google の公開鍵を取得できませんでした（${res.status}）`);
  const { keys } = await res.json();
  const age = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  cache = { keys, exp: Date.now() + (age ? Number(age[1]) * 1000 : 3600_000) };
  return keys;
}

const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

export class TokenError extends Error {}

export async function verifyFirebaseToken(token, { projectId, getKeys = googleKeys, now = Date.now() }) {
  if (!projectId) throw new TokenError('FIREBASE_PROJECT_ID が設定されていません');
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) throw new TokenError('ログイン情報の形式が不正です');
  let header, claims;
  try {
    header = JSON.parse(td.decode(unb64url(parts[0])));
    claims = JSON.parse(td.decode(unb64url(parts[1])));
  } catch {
    throw new TokenError('ログイン情報を読み取れませんでした');
  }
  if (header.alg !== 'RS256') throw new TokenError('ログイン情報の署名方式が不正です');
  const jwk = (await getKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new TokenError('ログイン情報の鍵が見つかりません。もう一度ログインしてください');
  const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64url(parts[2]), te.encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new TokenError('ログイン情報の署名が正しくありません');
  const t = now / 1000;
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) throw new TokenError('別のアプリのログイン情報です');
  if (!(claims.exp > t) || claims.iat > t + 60 || claims.auth_time > t + 60) throw new TokenError('ログイン情報の期限が切れています。もう一度ログインしてください');
  if (!claims.sub || !claims.email) throw new TokenError('ログイン情報にメールアドレスがありません');
  if (claims.email_verified !== true) throw new TokenError('メールアドレスが確認されていない Google アカウントです');
  if (claims.firebase?.sign_in_provider !== 'google.com') throw new TokenError('Google アカウントでログインしてください');
  return { email: String(claims.email).toLowerCase(), name: claims.name || claims.email, uid: claims.sub };
}
