// 毎日の運用：投稿枠・週の工程・KPI・ロードマップ・素材から展開
import { z } from 'zod';
import { askClaude, DEFAULT_BRAND } from './ai.js';
import { getPost, getSetting, now } from './store.js';
import { addDays, PILLAR_NEXT, PILLARS, pillarOf, ROADMAP, ruleOf, SEASONS, slotsOn, WORKFLOW } from '../public/plan.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (s) => typeof s === 'string' && DAY_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// 先の何日かの投稿枠と、枠にひも付いた投稿
export async function listSlots(env, from, days) {
  const slots = [];
  for (let i = 0; i < days; i++) slots.push(...slotsOn(addDays(from, i)));
  const { results } = await env.DB.prepare(
    `SELECT id, slot, status, stage, body, pillar, next_step, scheduled_at, published_at FROM posts WHERE slot >= ? AND slot < ? ORDER BY id`,
  ).bind(from, addDays(from, days)).all();
  const bySlot = new Map();
  for (const p of results) if (!bySlot.has(p.slot)) bySlot.set(p.slot, p);
  return slots.map((s) => ({ ...s, post: bySlot.get(s.id) ?? null }));
}

export async function weekTasks(env, week) {
  const { results } = await env.DB.prepare('SELECT * FROM weekly_tasks WHERE week_start = ?').bind(week).all();
  const done = new Map(results.map((r) => [r.step, r]));
  return WORKFLOW.map((w) => ({ ...w, done_by: done.get(w.step)?.done_by ?? null, done_at: done.get(w.step)?.done_at ?? null }));
}

export async function setTask(env, week, step, done, user) {
  if (!WORKFLOW.some((w) => w.step === step)) throw new Error('工程が見つかりません');
  if (done) {
    await env.DB.prepare('INSERT OR REPLACE INTO weekly_tasks (week_start, step, done_by, done_at) VALUES (?, ?, ?, ?)').bind(week, step, user, now()).run();
  } else {
    await env.DB.prepare('DELETE FROM weekly_tasks WHERE week_start = ? AND step = ?').bind(week, step).run();
  }
}

// ── KPI ──
export const KPI_FIELDS = ['followers', 'saves', 'shares', 'link_clicks', 'line_signups', 'ig_sales_jpy', 'store_sales_jpy'];

export function cleanKpi(body) {
  const out = {};
  for (const k of KPI_FIELDS) {
    const v = body?.[k];
    if (v === '' || v == null) { out[k] = null; continue; }
    const n = Math.round(Number(String(v).replace(/[,，円人]/g, '')));
    if (!Number.isFinite(n) || n < 0 || n > 1e11) throw new Error('数字を正しく入れてください');
    out[k] = n;
  }
  for (const k of ['keep_pattern', 'stop_pattern', 'note']) out[k] = String(body?.[k] ?? '').trim().slice(0, 1000) || null;
  return out;
}

export async function listKpi(env) {
  const { results } = await env.DB.prepare('SELECT * FROM kpi_weekly ORDER BY week_start DESC LIMIT 104').all();
  return results.reverse();
}

export async function putKpi(env, week, body, user) {
  const k = cleanKpi(body);
  const cols = [...KPI_FIELDS, 'keep_pattern', 'stop_pattern', 'note'];
  await env.DB.prepare(
    `INSERT INTO kpi_weekly (week_start, ${cols.join(', ')}, updated_by, updated_at) VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)
     ON CONFLICT(week_start) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  ).bind(week, ...cols.map((c) => k[c]), user, now()).run();
}

// ── ロードマップ（初回に ToDo の項目を入れる） ──
export async function listRoadmap(env) {
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM roadmap_tasks').first()).n;
  if (!n) {
    const stmts = [];
    let sort = 0;
    for (const [section, items] of Object.entries(ROADMAP)) {
      for (const title of items) stmts.push(env.DB.prepare('INSERT INTO roadmap_tasks (section, title, sort) VALUES (?, ?, ?)').bind(section, title, sort++));
    }
    await env.DB.batch(stmts);
  }
  const { results } = await env.DB.prepare('SELECT * FROM roadmap_tasks ORDER BY sort, id').all();
  return results;
}

// ── 素材 ──
export const SOURCE_KINDS = { voice: '音声メモ', shoot: '撮影', photo: 'スマホ写真' };

// 素材ごとに、作った投稿カードの数と、公開まで行った媒体の数（目安は5か所以上）
export async function listSources(env, limit = 30) {
  const { results } = await env.DB.prepare('SELECT id, kind, title, created_by, created_at FROM sources ORDER BY id DESC LIMIT ?').bind(limit).all();
  if (!results.length) return [];
  const ids = results.map((r) => r.id);
  const q = ids.map(() => '?').join(',');
  const [{ results: cards }, { results: used }] = await Promise.all([
    env.DB.prepare(`SELECT source_id, COUNT(*) AS n FROM posts WHERE source_id IN (${q}) GROUP BY source_id`).bind(...ids).all(),
    env.DB.prepare(
      `SELECT p.source_id, a.platform FROM posts p JOIN targets t ON t.post_id = p.id JOIN accounts a ON a.id = t.account_id
       WHERE p.source_id IN (${q}) AND t.status IN ('ok','manual') GROUP BY p.source_id, a.platform`,
    ).bind(...ids).all(),
  ]);
  return results.map((r) => ({
    ...r,
    cards: cards.find((c) => c.source_id === r.id)?.n ?? 0,
    platforms: used.filter((u) => u.source_id === r.id).map((u) => u.platform),
  }));
}

const ExpandSchema = z.object({
  pillar: z.string().describe(`いちばん合う投稿の柱：${PILLARS.map((p) => p.key).join(' / ')}`),
  blog: z.object({ title: z.string(), text: z.string() }),
  reels: z.array(z.object({ title: z.string(), script: z.string(), caption: z.string() })),
  threads: z.array(z.string()),
  carousel: z.object({ title: z.string(), slides: z.array(z.string()), caption: z.string() }),
  newsletter: z.object({ subject: z.string(), text: z.string() }),
  line: z.object({ text: z.string() }),
  captions: z.object({ en: z.string(), fr: z.string(), zh: z.string() }),
});

export function buildExpandPrompt({ brand, kind, title, transcript, month }) {
  const s = SEASONS[month];
  const rules = ['ig_reel', 'ig_carousel', 'threads', 'blog', 'line', 'newsletter'].map((k) => {
    const r = ruleOf(k);
    return `- ${r.label}：${r.how}。次の一歩は「${r.next}」`;
  });
  const system = `あなたは小さなお茶の生産者の広報担当です。1つの素材（朝の音声メモなど）から、各媒体の下書きをまとめて作ります（ワンソース・マルチユース）。

# 書き手について
${brand || DEFAULT_BRAND}

# 守ること
- 素材にない事実（日付・価格・数量・効能など）を作らない
- 媒体ごとに読み手と書き方を変える。同じ文の使い回しにしない
- どの投稿も、最後は「次の一歩」を1つだけ置く（5つの入り口：買う・学ぶ・体験する・飲む・広がる、または LINE・メルマガ登録）

# 媒体別の作り方
${rules.join('\n')}`;
  const user = `# 素材（${SOURCE_KINDS[kind] ?? '素材'}）：${title}
${s ? `（今月${month}月のお茶ごよみ：作業は${s.work}、発信テーマは${s.theme}、販売の山は${s.peak}）\n` : ''}
${transcript}

# 作るもの
- pillar：投稿の柱（${PILLARS.map((p) => `${p.key}=${p.label}`).join('、')}）
- blog：ブログ要約（title と、見出し付きで800〜1500字の text）
- reels：リール台本を3本（title、script は冒頭2秒の音・手元・湯気の指示から始まる30〜60秒の台本と字幕、caption は Instagram のキャプション600字前後・末尾にハッシュタグ5〜10個）
- threads：Threads の一言を5つ（それぞれ140字前後）
- carousel：カルーセル構成（title、slides は5〜8枚分の各スライドの文、caption は保存を促す一文を含むキャプション）
- newsletter：メルマガ（subject と、挨拶・本文・商品案内・署名の text）
- line：LINE 配信文（1通1テーマ、短文＋次の一歩）
- captions：リール・YouTube・Pinterest に付ける英語・フランス語・中国語（簡体字）の短いキャプション`;
  return { system, user };
}

const clean = (s) => String(s ?? '').trim();

// 文字起こしから7種類の下書きを作り、投稿カード（下書き）として登録する
export async function expandSource(env, { kind, title, transcript, month }, user) {
  const { system, user: prompt } = buildExpandPrompt({ brand: await getSetting(env, 'brand'), kind, title, transcript, month });
  const { out } = await askClaude(env, { system, user: prompt, Schema: ExpandSchema, maxTokens: 20000, tooLong: '素材が長すぎます。分けて展開してください' });
  const pillar = pillarOf(out.pillar) ? out.pillar : null;
  const next = pillar ? PILLAR_NEXT[pillar] : 'buy';
  const cards = [
    { format: 'ブログ要約', rule: 'blog', title: clean(out.blog.title), body: clean(out.blog.text), next: 'buy' },
    ...out.reels.slice(0, 3).map((r, i) => ({ format: `リール台本${i + 1}`, rule: 'ig_reel', body: clean(r.caption), memo: `【${clean(r.title)}】\n${clean(r.script)}`, next })),
    ...out.threads.slice(0, 7).map((t, i) => ({ format: `Threads一言${i + 1}`, rule: 'threads', body: clean(t), next: 'none' })),
    { format: 'カルーセル構成', rule: 'ig_carousel', body: clean(out.carousel.caption), memo: `【${clean(out.carousel.title)}】\n${out.carousel.slides.map((s, i) => `${i + 1}枚目：${clean(s)}`).join('\n')}`, next },
    { format: 'メルマガ文', rule: 'newsletter', title: clean(out.newsletter.subject), body: clean(out.newsletter.text), next: 'buy' },
    { format: 'LINE文', rule: 'line', body: clean(out.line.text), next: 'buy' },
    { format: '英仏中キャプション', rule: null, body: `🇬🇧 EN\n${clean(out.captions.en)}\n\n🇫🇷 FR\n${clean(out.captions.fr)}\n\n🇨🇳 中文\n${clean(out.captions.zh)}`, memo: 'リール・YouTube・Pinterest のキャプションに添える', next: 'none' },
  ].filter((c) => c.body);

  const src = await env.DB.prepare('INSERT INTO sources (kind, title, transcript, created_by, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(kind, title, transcript, user, now()).first();
  const { results: accounts } = await env.DB.prepare('SELECT id, platform FROM accounts WHERE enabled = 1 ORDER BY id').all();
  const ids = [];
  for (const c of cards) {
    const p = await env.DB.prepare(
      `INSERT INTO posts (body, media, status, stage, pillar, next_step, memo, format, source_id, created_by, updated_by, created_at, updated_at)
       VALUES (?, '[]', 'draft', 'idea', ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    ).bind(c.body, pillar, c.next, c.memo ?? null, c.format, src.id, user, user, now(), now()).first();
    // 媒体別ルールの SNS のうち、登録済みのアカウントを投稿先にしておく
    const plats = c.rule ? ruleOf(c.rule).platforms : [];
    const targets = accounts.filter((a) => plats.includes(a.platform));
    if (targets.length) {
      await env.DB.batch(targets.map((a) => env.DB.prepare('INSERT INTO targets (post_id, account_id, title) VALUES (?, ?, ?)').bind(p.id, a.id, c.title ?? null)));
    }
    ids.push(p.id);
  }
  return { source_id: src.id, posts: await Promise.all(ids.map((id) => getPost(env, id))) };
}

