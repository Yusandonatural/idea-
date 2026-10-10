import test from 'node:test';
import assert from 'node:assert/strict';
import { oauth1Header } from '../src/oauth1.js';
import { countFor } from '../public/textlen.js';
import { getKeys, encryptJSON, decryptJSON, hmacSign, hmacVerify } from '../src/crypto.js';
import { facets } from '../src/platforms/bluesky.js';
import { check } from '../src/publish.js';

test('OAuth 1.0a の署名が X 公式ドキュメントの例と一致する', async () => {
  const header = await oauth1Header(
    'POST',
    'https://api.twitter.com/1.1/statuses/update.json?include_entities=true',
    {
      api_key: 'xvz1evFS4wEEPTGEFPHBog',
      api_secret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
      access_token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
      access_token_secret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
    },
    { status: 'Hello Ladies + Gentlemen, a signed OAuth request!' },
    { nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg', timestamp: 1318622958 },
  );
  assert.match(header, /oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"/);
});

test('X の文字数：日本語は2、英数は1、URLは23', () => {
  assert.equal(countFor('x', 'abc'), 3);
  assert.equal(countFor('x', 'お茶'), 4);
  assert.equal(countFor('x', '見て https://example.com/very/long/path'), 4 + 1 + 23);
  assert.equal(countFor('x', '🍵'), 2);
  assert.equal(countFor('x', 'あ'.repeat(140)), 280);
});

test('Bluesky は書記素で数える', () => {
  assert.equal(countFor('bluesky', '👨‍👩‍👧お茶'), 3);
});

test('鍵の暗号化と復号、署名の検証', async () => {
  const { aes, hmac } = await getKeys('test-secret');
  const enc = await encryptJSON(aes, { token: 'abc' });
  assert.notEqual(enc, JSON.stringify({ token: 'abc' }));
  assert.deepEqual(await decryptJSON(aes, enc), { token: 'abc' });
  const other = await getKeys('other-secret');
  await assert.rejects(decryptJSON(other.aes, enc));
  const sig = await hmacSign(hmac, '123');
  assert.equal(await hmacVerify(hmac, '123', sig), true);
  assert.equal(await hmacVerify(hmac, '124', sig), false);
});

test('Bluesky のリンクとハッシュタグの位置（バイト単位）', () => {
  const text = '新茶です #緑茶 https://yusando.com/tea.';
  const f = facets(text);
  const te = new TextEncoder();
  const slice = (i) => new TextDecoder().decode(te.encode(text).slice(i.byteStart, i.byteEnd));
  const tag = f.find((x) => x.features[0].tag);
  const link = f.find((x) => x.features[0].uri);
  assert.equal(slice(tag.index), '#緑茶');
  assert.equal(slice(link.index), 'https://yusando.com/tea');
  assert.equal(link.features[0].uri, 'https://yusando.com/tea');
});

test('SNSごとの制限チェック', () => {
  const jpg = { key: 'a.jpg', type: 'image/jpeg' };
  const png = { key: 'a.png', type: 'image/png' };
  assert.equal(check('x', 'hello', []), null);
  assert.match(check('x', 'あ'.repeat(141), []), /文字数/);
  assert.match(check('instagram', 'hello', []), /画像か動画が必要/);
  assert.match(check('instagram', 'hello', [png]), /対応していません/);
  assert.equal(check('instagram', 'hello', [jpg]), null);
  assert.match(check('x', 'hi', [jpg, jpg, jpg, jpg, jpg]), /4枚まで/);
  assert.match(check('threads', '  ', []), /本文も画像も/);
});
