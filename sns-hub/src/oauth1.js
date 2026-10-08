// X（旧Twitter）の OAuth 1.0a ユーザー認証ヘッダーを作る
import { b64 } from './crypto.js';

const te = new TextEncoder();

export function pct(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// extraParams：署名に含めるフォーム本文のパラメータ（JSON・multipart の本文は含めない）
export async function oauth1Header(method, url, creds, extraParams = {}, fixed = {}) {
  const u = new URL(url);
  const oauth = {
    oauth_consumer_key: creds.api_key,
    oauth_nonce: fixed.nonce ?? crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(fixed.timestamp ?? Math.floor(Date.now() / 1000)),
    oauth_token: creds.access_token,
    oauth_version: '1.0',
  };
  const all = [];
  for (const [k, v] of u.searchParams) all.push([k, v]);
  for (const [k, v] of Object.entries(extraParams)) all.push([k, String(v)]);
  for (const [k, v] of Object.entries(oauth)) all.push([k, v]);
  const paramStr = all
    .map(([k, v]) => [pct(k), pct(v)])
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const baseUrl = `${u.protocol}//${u.host}${u.pathname}`;
  const baseStr = [method.toUpperCase(), pct(baseUrl), pct(paramStr)].join('&');
  const signingKey = `${pct(creds.api_secret)}&${pct(creds.access_token_secret)}`;
  const key = await crypto.subtle.importKey('raw', te.encode(signingKey), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  oauth.oauth_signature = b64(await crypto.subtle.sign('HMAC', key, te.encode(baseStr)));
  return 'OAuth ' + Object.entries(oauth).map(([k, v]) => `${pct(k)}="${pct(v)}"`).join(', ');
}
