// public/ の画面ファイルを Worker に埋め込む（wrangler の build で自動実行）
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};
const dir = new URL('../public/', import.meta.url);
const files = {};
for (const name of readdirSync(dir).sort()) {
  const ext = name.slice(name.lastIndexOf('.'));
  if (!TYPES[ext]) continue;
  const body = readFileSync(new URL(name, dir), 'utf8');
  files['/' + name] = { type: TYPES[ext], etag: `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`, body };
}
writeFileSync(new URL('../src/static.gen.js', import.meta.url),
  `// 自動生成（scripts/build-static.mjs）。直接編集しない\nexport default ${JSON.stringify(files)};\n`);
console.log(`static: ${Object.keys(files).join(', ')}`);
