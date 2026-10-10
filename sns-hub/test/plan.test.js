import test from 'node:test';
import assert from 'node:assert/strict';
import { PILLARS, SEASONS, WEEKLY, withUtm } from '../public/plan.js';
import { buildPrompt } from '../src/ai.js';
import { check } from '../src/publish.js';

test('柱の比率は合計100%、ごよみは12か月、週間は7日', () => {
  assert.equal(PILLARS.reduce((a, p) => a + p.ratio, 0), 100);
  assert.equal(Object.keys(SEASONS).length, 12);
  assert.equal(Object.keys(WEEKLY).length, 7);
});

test('UTM は yusando.com のリンクだけに付け、付いていれば触らない', () => {
  assert.equal(withUtm('instagram', '新茶です https://yusando.com/products/aki。', { campaign: 'field' }),
    '新茶です https://yusando.com/products/aki?utm_source=instagram&utm_medium=social&utm_campaign=field。');
  assert.equal(withUtm('newsletter', 'https://www.yusando.com/?a=1'), 'https://www.yusando.com/?a=1&utm_source=newsletter&utm_medium=email&utm_campaign=sns');
  assert.equal(withUtm('x', 'https://example.com/x'), 'https://example.com/x');
  assert.equal(withUtm('x', 'https://yusando.com/?utm_source=foo'), 'https://yusando.com/?utm_source=foo');
  assert.equal(withUtm('x', 'https://notyusando.com/'), 'https://notyusando.com/');
});

test('AI への依頼文に、柱・今月のごよみ・多言語の指示が入る', () => {
  const { system, user } = buildPrompt({ brand: '', source: 'メモ', platformIds: ['instagram', 'x'], pillar: 'field', month: 10, langs: ['en', 'zh', 'xx'] });
  assert.match(system, /@yusando\.natural\.tea/);
  assert.match(user, /この投稿の柱：畑と季節/);
  assert.match(user, /10月）のお茶ごよみ：作業ははなばんちゃ/);
  assert.match(user, /Instagram の text は、日本語の後に空行をはさんで 英語・中国語（簡体字） の短い訳/);
  const plain = buildPrompt({ brand: '', source: 'メモ', platformIds: ['x'], langs: ['en'] }).user;
  assert.doesNotMatch(plain, /短い訳/);
});

test('Pinterest は画像1枚が必要', () => {
  const jpg = { key: 'a.jpg', type: 'image/jpeg' };
  assert.match(check('pinterest', '説明', []), /画像が必要/);
  assert.equal(check('pinterest', '説明', [jpg]), null);
  assert.match(check('pinterest', '説明', [jpg, jpg]), /1枚まで/);
});
