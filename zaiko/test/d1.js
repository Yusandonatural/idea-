// テスト用：node:sqlite で D1 の使い方（prepare → bind → first/all/run、batch）をまねる
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => {
      const r = db.prepare(sql).run(...args);
      return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
    _exec: () => db.prepare(sql).run(...args),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (list) => {
      db.exec('BEGIN');
      try {
        for (const s of list) s._exec();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return [];
    },
  };
}

// fetch を差し替える：URL に含まれる文字で返事を決める
export function stubFetch(routes) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    calls.push(u);
    const hit = routes.find(([pat]) => u.includes(pat));
    if (!hit) return new Response(JSON.stringify({ error: { message: `no route ${u}` } }), { status: 404 });
    const body = typeof hit[1] === 'function' ? hit[1](u, init) : hit[1];
    return new Response(JSON.stringify(body), { status: hit[2] ?? 200, headers: { 'content-type': 'application/json' } });
  };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}
