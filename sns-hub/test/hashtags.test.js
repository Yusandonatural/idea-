import test from 'node:test';
import assert from 'node:assert/strict';
import { appendTags, autoTagsFor, parseTags, tagsIn, withAutoTags } from '../public/hashtags.js';
import { buildPrompt } from '../src/ai.js';

const sets = [
  { name: 'お茶の基本', tags: ['#日本茶', '#自然栽培', '#奈良'], auto_platforms: ['instagram'] },
  { name: 'ツアー', tags: ['#茶ツアー'], auto_platforms: [] },
];

test('入力をタグの一覧にする：# の有無・区切り・重複・記号', () => {
  assert.deepEqual(parseTags('日本茶, #自然栽培　奈良、＃日本茶 #お茶！'), ['#日本茶', '#自然栽培', '#奈良', '#お茶']);
  assert.deepEqual(parseTags(''), []);
});

test('文章からタグを拾う', () => {
  assert.deepEqual(tagsIn('新茶 #日本茶 と ＃奈良。#茶ツアー_2026'), ['#日本茶', '#奈良', '#茶ツアー_2026']);
});

test('自動タグは選んだSNSだけ・本文にあるものは足さない', () => {
  assert.deepEqual(autoTagsFor('instagram', '新茶です #日本茶', sets), ['#自然栽培', '#奈良']);
  assert.deepEqual(autoTagsFor('x', '新茶です', sets), []);
  assert.equal(withAutoTags('instagram', '新茶です', sets), '新茶です\n\n#日本茶 #自然栽培 #奈良');
});

test('自動タグは文字数に収まる分だけ', () => {
  const big = [{ name: 'x', tags: ['#ab', '#cd'], auto_platforms: ['x'] }];
  const text = 'a'.repeat(272); // 272 + 改行2 + "#ab"3 = 277, さらに " #cd" で 281 > 280
  assert.deepEqual(autoTagsFor('x', text, big, 280), ['#ab']);
});

test('タグを足すとき、最後の行がタグだけなら同じ行に続ける', () => {
  assert.equal(appendTags('本文\n\n#日本茶', ['#日本茶', '#奈良']), '本文\n\n#日本茶 #奈良');
  assert.equal(appendTags('本文です', ['#奈良']), '本文です\n\n#奈良');
  assert.equal(appendTags('', ['#奈良']), '#奈良');
});

test('AIへの依頼文にタグのセットが入り、自動で付くSNSは本文に入れないよう伝える', () => {
  const { user } = buildPrompt({ brand: '', source: 'メモ', platformIds: ['instagram', 'x'], hashtagSets: sets });
  assert.match(user, /- お茶の基本：#日本茶 #自然栽培 #奈良（Instagramには投稿時に自動で付くので/);
  assert.match(user, /- ツアー：#茶ツアー\n/);
});
