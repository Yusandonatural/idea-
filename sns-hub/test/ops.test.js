import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1, stubFetch } from './d1.js';
import { activeCampaigns, addDays, cardState, CHANNEL_RULES, entranceUrl, followerPace, mondayOf, ROADMAP, slotsOn, weekdayOf, WORKFLOW } from '../public/plan.js';
import { buildExpandPrompt, cleanKpi, expandSource, listKpi, listRoadmap, listSlots, listSources, putKpi, setTask, weekTasks } from '../src/ops.js';
import { encryptCreds, getPost } from '../src/store.js';

test('日付の計算と週の月曜', () => {
  assert.equal(weekdayOf('2026-10-12'), 1);
  assert.equal(mondayOf('2026-10-18'), '2026-10-12'); // 日曜はその週の月曜へ
  assert.equal(mondayOf('2026-10-12'), '2026-10-12');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
});

test('投稿枠：曜日の型・隔週・月1・毎日のストーリーズ', () => {
  const mon = slotsOn('2026-10-12');
  assert.deepEqual(mon.map((s) => s.label), ['リール：畑と季節', 'YouTube ショート', 'Threads', 'Pinterest', 'ストーリーズ 1〜3枚']);
  assert.equal(mon[0].pillar, 'field');
  assert.equal(mon[0].id, '2026-10-12:10');
  // LINE は隔週の火曜だけ
  const line = ['2026-10-13', '2026-10-20'].map((d) => slotsOn(d).some((s) => s.rule === 'line'));
  assert.equal(line[0] !== line[1], true);
  // インスタライブは月の第1日曜だけ
  assert.ok(slotsOn('2026-10-04').some((s) => s.label.includes('ライブ')));
  assert.ok(!slotsOn('2026-10-11').some((s) => s.label.includes('ライブ')));
  // 媒体ルールは14、すべての枠のルールが存在する
  assert.equal(CHANNEL_RULES.length, 14);
  for (let i = 0; i < 7; i++) for (const s of slotsOn(addDays('2026-10-12', i))) assert.ok(CHANNEL_RULES.some((r) => r.key === s.rule), s.rule);
});

test('目標の目安・キャンペーン・UTM・カードの状態', () => {
  assert.equal(followerPace('2026-10-01'), 4500);
  assert.equal(followerPace('2027-02-28'), 10000);
  assert.equal(followerPace('2027-06-01'), 10000);
  assert.deepEqual(activeCampaigns('2026-11-15').map((c) => c.name).slice(0, 2), ['秋冬ギフト', 'ふるさと納税']);
  assert.ok(activeCampaigns('2027-01-10').some((c) => c.name.startsWith('定期便')));
  assert.ok(!activeCampaigns('2026-12-10').some((c) => c.name.startsWith('定期便')));
  assert.equal(entranceUrl('buy', 'instagram', 'gift'), 'https://yusando.com/pages/kau?utm_source=instagram&utm_medium=social&utm_campaign=gift');
  assert.equal(entranceUrl('line', 'instagram'), null);
  assert.equal(cardState(null).label, '未着手');
  assert.equal(cardState({ status: 'draft', stage: 'idea' }).label, 'アイデア');
  assert.equal(cardState({ status: 'draft', stage: null }).label, '制作中');
  assert.equal(cardState({ status: 'scheduled' }).label, '予約済み');
  assert.equal(cardState({ status: 'partial' }).label, '公開済み');
});

test('KPIの入力の整理', () => {
  const k = cleanKpi({ followers: '4,620', ig_sales_jpy: '120,000円', saves: '', keep_pattern: ' 注ぐ音 ' });
  assert.equal(k.followers, 4620);
  assert.equal(k.ig_sales_jpy, 120000);
  assert.equal(k.saves, null);
  assert.equal(k.keep_pattern, '注ぐ音');
  assert.throws(() => cleanKpi({ followers: 'たくさん' }));
});

const env = () => ({ DB: fakeD1(), APP_SECRET: 'test-secret-test-secret' });

test('枠と投稿のひも付け・週の工程・KPI・ロードマップ', async () => {
  const e = env();
  await e.DB.prepare(`INSERT INTO posts (body, status, stage, slot, created_at, updated_at) VALUES ('畑の朝', 'draft', 'idea', '2026-10-12:10', 0, 0)`).run();
  const slots = await listSlots(e, '2026-10-12', 7);
  assert.equal(slots.find((s) => s.id === '2026-10-12:10').post.body, '畑の朝');
  assert.equal(slots.filter((s) => s.post).length, 1);
  assert.ok(slots.length > 20);

  await setTask(e, '2026-10-12', 1, true, '礒﨑');
  let t = await weekTasks(e, '2026-10-12');
  assert.equal(t.length, WORKFLOW.length);
  assert.equal(t.find((x) => x.step === 1).done_by, '礒﨑');
  await setTask(e, '2026-10-12', 1, false, '礒﨑');
  t = await weekTasks(e, '2026-10-12');
  assert.equal(t.find((x) => x.step === 1).done_at, null);
  await assert.rejects(setTask(e, '2026-10-12', 99, true, 'x'));

  await putKpi(e, '2026-10-05', { followers: 4550 }, 'a');
  await putKpi(e, '2026-10-12', { followers: 4600, ig_sales_jpy: 50000 }, 'a');
  await putKpi(e, '2026-10-12', { followers: 4610, ig_sales_jpy: 50000, stop_pattern: '長い文' }, 'b');
  const k = await listKpi(e);
  assert.deepEqual(k.map((r) => r.week_start), ['2026-10-05', '2026-10-12']);
  assert.equal(k[1].followers, 4610);
  assert.equal(k[1].updated_by, 'b');

  const rm = await listRoadmap(e);
  assert.equal(rm.length, Object.values(ROADMAP).flat().length);
  assert.equal(rm[0].section, '今週');
  assert.equal((await listRoadmap(e)).length, rm.length); // 二度目は入れ直さない
});

test('素材から展開：7種類の下書きを投稿カードにして、展開済みの媒体を数える', async () => {
  const e = { ...env(), ANTHROPIC_API_KEY: 'test-key' };
  const creds = await encryptCreds(e, { x: 1 });
  await e.DB.prepare(`INSERT INTO accounts (id, platform, name, credentials, created_at, updated_at) VALUES (1, 'instagram', 'ig', ?, 0, 0), (2, 'threads', 'th', ?, 0, 0), (3, 'newsletter', 'mail', ?, 0, 0)`).bind(creds, creds, creds).run();
  const out = {
    pillar: 'field',
    blog: { title: '霧の朝', text: '## 霧\n本文' },
    reels: [1, 2, 3].map((i) => ({ title: `リール${i}`, script: '0-2秒：注ぐ音', caption: `キャプション${i}` })),
    threads: ['一言1', '一言2'],
    carousel: { title: '淹れ方', slides: ['1枚目', '2枚目'], caption: '保存してね' },
    newsletter: { subject: '秋の便り', text: 'こんにちは' },
    line: { text: 'はなばんちゃ入荷' },
    captions: { en: 'Misty morning', fr: 'Matin brumeux', zh: '雾中的早晨' },
  };
  const f = stubFetch([['api.anthropic.com', {
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
    content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 1, output_tokens: 1 },
  }]]);
  let r;
  try {
    r = await expandSource(e, { kind: 'voice', title: '朝のお話し', transcript: '今朝は霧の中ではなばんちゃを刈りました', month: 10 }, '礒﨑');
  } finally {
    f.restore();
  }
  assert.equal(r.posts.length, 1 + 3 + 2 + 1 + 1 + 1 + 1);
  const reel = r.posts.find((p) => p.format === 'リール台本1');
  assert.equal(reel.body, 'キャプション1');
  assert.match(reel.memo, /【リール1】\n0-2秒：注ぐ音/);
  assert.equal(reel.pillar, 'field');
  assert.equal(reel.next_step, 'buy');
  assert.equal(reel.stage, 'idea');
  assert.deepEqual(reel.targets.map((t) => t.platform), ['instagram']);
  const mail = r.posts.find((p) => p.format === 'メルマガ文');
  assert.equal(mail.targets[0].title, '秋の便り');
  assert.equal(r.posts.find((p) => p.format === 'ブログ要約').targets.length, 0); // ブログのアカウントはない
  assert.equal(r.posts.find((p) => p.format === 'Threads一言1').next_step, 'none');

  // 公開した媒体を数える
  await e.DB.prepare(`UPDATE targets SET status = 'ok' WHERE post_id = ?`).bind(reel.id).run();
  await e.DB.prepare(`UPDATE targets SET status = 'manual' WHERE post_id = ?`).bind(mail.id).run();
  const [src] = await listSources(e);
  assert.equal(src.cards, r.posts.length);
  assert.deepEqual(src.platforms.sort(), ['instagram', 'newsletter']);
  assert.equal((await getPost(e, reel.id)).source_id, src.id);
});

test('展開の依頼文に、媒体ルール・ごよみ・素材が入る', () => {
  const { system, user } = buildExpandPrompt({ brand: '', kind: 'voice', title: '朝', transcript: '素材本文', month: 10 });
  assert.match(system, /Instagram リール：30〜60秒、冒頭2秒に音・手元・湯気/);
  assert.match(user, /素材（音声メモ）：朝/);
  assert.match(user, /はなばんちゃ/);
  assert.match(user, /素材本文/);
});
