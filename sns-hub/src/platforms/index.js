import x from './x.js';
import instagram from './instagram.js';
import threads from './threads.js';
import facebook from './facebook.js';
import line from './line.js';
import bluesky from './bluesky.js';
import mastodon from './mastodon.js';
import youtube from './youtube.js';
import shopify from './shopify.js';
import pinterest from './pinterest.js';
import { newsletter, note, red, tiktok } from './manual.js';

export const platforms = Object.fromEntries([instagram, facebook, youtube, threads, x, line, newsletter, tiktok, pinterest, note, shopify, red, bluesky, mastodon].map((p) => [p.id, p]));

// 画面に渡す情報（関数は除く）
export function describe() {
  return Object.values(platforms).map(({ id, label, color, limits, fields, note, manual }) => ({ id, label, color, limits, fields, note, manual: !!manual }));
}
