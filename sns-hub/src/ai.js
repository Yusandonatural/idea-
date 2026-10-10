// 1つのメモから、SNSごとに合わせた文章を Claude に書いてもらう
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { platforms } from './platforms/index.js';
import { pillarOf, SEASONS } from '../public/plan.js';

export const MODEL = 'claude-opus-5-5';

export const DEFAULT_BRAND = `株式会社悠三堂（ゆうさんどう）。奈良・都祁で農薬も肥料も使わない自然栽培のお茶をつくる茶農家。軸は「自然栽培 × 自然茶道」と、代表・礒﨑遼太郎の思想と暮らし。
Instagram は @yusando.natural.tea。yusando.com には5つの入り口がある：買う（オンラインストア）・学ぶ（自然茶道・日本自然茶協会）・体験する（TEA TOUR・リトリート）・飲む（茶寮・古民家カフェ）・広がる（卸・海外）。
口調：やわらかく丁寧な「です・ます」調。誇張や煽りはしない。茶畑の音・手元・湯気など、季節の手ざわりを大切にする。健康効果を断定しない（薬機法に配慮）。
導線：投稿ごとに「次の一歩」を必ず一つだけ置く（買う・学ぶ・体験する・飲む・広がるのどれか、または LINE 公式への登録）。Instagram では本文のURLは押せないので「プロフィールのリンクから」と添える。`;

export class AiError extends Error {}

export const LANGS = { en: '英語', fr: 'フランス語', zh: '中国語（簡体字）' };
const MULTI_TARGETS = ['instagram', 'youtube', 'pinterest'];

export function buildPrompt({ brand, source, platformIds, hashtagSets = [], pillar = null, month = null, langs = [] }) {
  const lines = platformIds.map((id) => {
    const p = platforms[id];
    const limit = p.limits.title ? `本文${p.limits.text}字以内、title ${p.limits.title}字以内` : `本文${p.limits.text}字以内（titleは空文字）`;
    return `- ${id}（${p.label}／${limit}）：${p.aiGuide}`;
  });
  const system = `あなたは小さなお茶の生産者の広報担当です。届いたメモをもとに、各SNSでいちばん読まれる形に書き分けます。

# 書き手について
${brand || DEFAULT_BRAND}

# 守ること
- メモにない事実（日付・価格・数量・効能など）を作らない。メモにURLがあればそのまま使う
- 各SNSの文字数制限を必ず守る
- SNSごとに読み手と書き方を変える。同じ文の使い回しにしない
- 出力は指定された各SNSにつき1件ずつ`;
  const tagLines = hashtagSets.map((s) => {
    const auto = s.auto_platforms.filter((p) => platformIds.includes(p)).map((p) => platforms[p].label);
    return `- ${s.name}：${s.tags.join(' ')}${auto.length ? `（${auto.join('・')}には投稿時に自動で付くので、そのSNSの本文には入れない）` : ''}`;
  });
  const p = pillarOf(pillar);
  const season = SEASONS[month];
  const context = [
    p && `- この投稿の柱：${p.label}（${p.about}）。導線は「${p.link}」へ`,
    season && `- 今月（${month}月）のお茶ごよみ：作業は${season.work}、発信テーマは${season.theme}、販売・集客の山は${season.peak}。メモの内容に合うときだけ自然に触れる`,
  ].filter(Boolean);
  const multi = langs.filter((l) => LANGS[l]);
  const multiTargets = platformIds.filter((id) => MULTI_TARGETS.includes(id));
  if (multi.length && multiTargets.length) {
    context.push(`- ${multiTargets.map((id) => platforms[id].label).join('・')} の text は、日本語の後に空行をはさんで ${multi.map((l) => LANGS[l]).join('・')} の短い訳を付ける（各言語の前に 🇬🇧 EN / 🇫🇷 FR / 🇨🇳 中文 の見出し）。全体で文字数制限に収まるよう日本語を短めにする`);
  }
  const user = `# 書き分ける先
${lines.join('\n')}
${context.length ? `\n# この投稿について\n${context.join('\n')}\n` : ''}${tagLines.length ? `\n# よく使うハッシュタグ（内容に合うものを優先して使う。合わないものは使わない）\n${tagLines.join('\n')}\n` : ''}
# メモ
${source}`;
  return { system, user };
}

export async function generate(env, { brand, source, platformIds, hashtagSets = [], pillar = null, month = null, langs = [] }) {
  if (!env.ANTHROPIC_API_KEY) throw new AiError('ANTHROPIC_API_KEY が設定されていません（README の「AIで書き分け」を参照）');
  const ids = [...new Set(platformIds)].filter((id) => platforms[id]);
  if (!ids.length) throw new AiError('投稿先を選んでください');
  if (!source.trim()) throw new AiError('もとになるメモを書いてください');

  const Schema = z.object({
    posts: z.array(z.object({
      platform: z.string().describe(`投稿先のID：${ids.join(' / ')} のどれか`),
      title: z.string(),
      text: z.string(),
    })),
  });
  const { system, user } = buildPrompt({ brand, source, platformIds: ids, hashtagSets, pillar, month, langs });
  // ANTHROPIC_BASE_URL は Cloudflare AI Gateway などを経由するときだけ設定する
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined });
  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: betaZodOutputFormat(Schema) },
      // 安全のための判定で断られたときは、おすすめの別モデルで自動的にやり直す
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content: user }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError('ANTHROPIC_API_KEY が正しくありません');
    if (e instanceof Anthropic.RateLimitError) throw new AiError('AIが混み合っています。少し待ってからもう一度お試しください');
    if (e instanceof Anthropic.APIError) throw new AiError(`AIの呼び出しに失敗しました（${e.status ?? '接続エラー'}）：${e.message}`);
    throw e;
  }
  if (response.stop_reason === 'refusal') throw new AiError('AIがこの内容の作成を断りました。メモの表現を変えてお試しください');
  if (response.stop_reason === 'max_tokens') throw new AiError('文章が長くなりすぎました。投稿先を減らしてお試しください');
  const out = response.parsed_output;
  if (!out) throw new AiError('AIの返答を読み取れませんでした。もう一度お試しください');

  const result = {};
  for (const p of out.posts) {
    if (ids.includes(p.platform) && !result[p.platform]) result[p.platform] = { title: p.title.trim(), text: p.text.trim() };
  }
  const missing = ids.filter((id) => !result[id]);
  if (missing.length === ids.length) throw new AiError('AIの返答に文章がありませんでした。もう一度お試しください');
  return { posts: result, missing, model: response.model };
}
