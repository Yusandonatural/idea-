import x from './x.js';
import instagram from './instagram.js';
import threads from './threads.js';
import facebook from './facebook.js';
import line from './line.js';
import bluesky from './bluesky.js';
import mastodon from './mastodon.js';

export const platforms = Object.fromEntries([x, instagram, threads, facebook, line, bluesky, mastodon].map((p) => [p.id, p]));

// 画面に渡す情報（関数は除く）
export function describe() {
  return Object.values(platforms).map(({ id, label, color, limits, fields, note }) => ({ id, label, color, limits, fields, note }));
}
