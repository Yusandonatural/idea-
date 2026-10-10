import test from 'node:test';
import assert from 'node:assert/strict';
import { TokenError, verifyFirebaseToken } from '../src/google.js';

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const NOW = 1_800_000_000_000;
const PROJECT = 'french90days';

const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' };
const getKeys = async () => [jwk];

async function sign(claims, header = { alg: 'RS256', kid: 'k1' }, key = pair.privateKey) {
  const t = NOW / 1000;
  const body = { aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: 'uid1', iat: t - 10, auth_time: t - 10, exp: t + 3000,
    email: 'Tea@Example.com', email_verified: true, name: 'お茶の人', firebase: { sign_in_provider: 'google.com' }, ...claims };
  const head = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(body))}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head));
  return `${head}.${b64url(sig)}`;
}
const verify = (tok) => verifyFirebaseToken(tok, { projectId: PROJECT, getKeys, now: NOW });

test('正しい Google ログインのトークンは通り、メールは小文字になる', async () => {
  assert.deepEqual(await verify(await sign({})), { email: 'tea@example.com', name: 'お茶の人', uid: 'uid1' });
});

test('不正なトークンは通さない', async () => {
  const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign']);
  const t = NOW / 1000;
  const bad = [
    ['署名が別の鍵', await sign({}, undefined, other.privateKey), /署名が正しくありません/],
    ['別のプロジェクト', await sign({ aud: 'other' }), /別のアプリ/],
    ['発行元が違う', await sign({ iss: 'https://evil.example' }), /別のアプリ/],
    ['期限切れ', await sign({ exp: t - 1 }), /期限/],
    ['メール未確認', await sign({ email_verified: false }), /確認されていない/],
    ['Google 以外', await sign({ firebase: { sign_in_provider: 'password' } }), /Google アカウントで/],
    ['知らない鍵', await sign({}, { alg: 'RS256', kid: 'nope' }), /鍵が見つかりません/],
    ['alg none', await sign({}, { alg: 'none', kid: 'k1' }), /署名方式/],
    ['形式違い', 'abc', /形式/],
  ];
  for (const [label, tok, re] of bad) await assert.rejects(verify(tok), (e) => e instanceof TokenError && re.test(e.message), label);
  // 本文を書き換えたトークン
  const [h, , s] = (await sign({})).split('.');
  const forged = `${h}.${b64url(JSON.stringify({ email: 'boss@example.com' }))}.${s}`;
  await assert.rejects(verify(forged), /署名が正しくありません/);
});
