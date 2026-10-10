import test from 'node:test';
import assert from 'node:assert/strict';
import { check, mediaFor } from '../src/publish.js';
import { textToHtml } from '../src/platforms/shopify.js';
import { ytTitle } from '../src/platforms/youtube.js';
import { buildPrompt, DEFAULT_BRAND } from '../src/ai.js';

const jpg = { key: 'a.jpg', type: 'image/jpeg' };
const mp4 = { key: 'a.mp4', type: 'video/mp4' };

test('動画は YouTube にだけ送り、YouTube には画像を送らない', () => {
  assert.deepEqual(mediaFor('youtube', [jpg, mp4]), [mp4]);
  assert.deepEqual(mediaFor('x', [jpg, mp4]), [jpg]);
  assert.deepEqual(mediaFor('note', [jpg, mp4]), []);
});

test('YouTube は動画が必要、ほかのSNSは動画があっても止めない', () => {
  assert.match(check('youtube', '説明', [jpg]), /動画が必要/);
  assert.equal(check('youtube', '説明', [mp4]), null);
  assert.equal(check('x', 'hello', [mp4]), null);
  assert.match(check('instagram', 'hello', [mp4]), /画像が必要/);
  assert.match(check('youtube', '説明', [mp4], 'あ'.repeat(101)), /タイトルは100字/);
});

test('note・メルマガは文章だけで投稿扱いにできる', () => {
  assert.equal(check('note', '本文', [jpg, mp4], '題名'), null);
  assert.equal(check('newsletter', '本文', []), null);
});

test('Shopify ブログの本文HTML：段落・見出し・リンク・エスケープ', () => {
  const html = textToHtml('はじめに\n2行目\n\n## 茶畑のこと\n\n詳しくは https://yusando.com を <見て>');
  assert.equal(html, '<p>はじめに<br>2行目</p>\n<h2>茶畑のこと</h2>\n<p>詳しくは <a href="https://yusando.com">https://yusando.com</a> を &lt;見て&gt;</p>');
  assert.equal(textToHtml('## 見出し\nすぐ本文'), '<h2>見出し</h2>\n<p>すぐ本文</p>');
});

test('YouTube のタイトルは1行目から作り、100字で切る', () => {
  assert.equal(ytTitle('', '\n秋番茶の摘み取り <速報>\n本文'), '秋番茶の摘み取り 速報');
  assert.equal([...ytTitle('あ'.repeat(150), '')].length, 100);
});

test('AI への依頼文に、選んだSNSの書き方と制限が入る', () => {
  const { system, user } = buildPrompt({ brand: '', source: '新茶ができた', platformIds: ['x', 'newsletter'] });
  assert.ok(system.includes(DEFAULT_BRAND));
  assert.match(user, /- x（X／本文280字以内（titleは空文字））/);
  assert.match(user, /- newsletter（メルマガ／本文20000字以内、title 60字以内）：.*件名/);
  assert.match(user, /新茶ができた/);
  assert.doesNotMatch(user, /instagram/);
});
