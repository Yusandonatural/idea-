// 日本史アプリの教材データ（docs/history/data/u*.js）の形式チェック。
// 使い方: node tools/check_history.js [u01 u02 ...]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const dir = path.join(__dirname, "..", "docs", "history", "data");
const only = process.argv.slice(2);
const files = fs.readdirSync(dir).filter(f => /^u\d\d\.js$/.test(f) && (!only.length || only.includes(f.slice(0, 3)))).sort();
const MIN = { facts: { 1: 12, 2: 12, 3: 15, 4: 12 }, events: 6, pairs: 6 };
let errors = 0, warns = 0;
const err = (f, m) => { errors++; console.log(`✗ ${f}: ${m}`); };
const warn = (f, m) => { warns++; console.log(`△ ${f}: ${m}`); };

for (const f of files) {
  const units = [];
  const ctx = { HIST: { addUnit: u => units.push(u) } };
  try { vm.runInNewContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f }); }
  catch (e) { err(f, "読み込めない: " + e.message); continue; }
  if (units.length !== 1) { err(f, "HIST.addUnit が1回ではない"); continue; }
  const u = units[0];
  if (u.id !== f.slice(0, 3)) err(f, `id が ${u.id}`);
  for (const k of ["title", "period", "emoji"]) if (!u[k]) err(f, `${k} がない`);
  for (const lv of [1, 2, 3, 4]) if (!u.intro || !u.intro[lv]) err(f, `intro[${lv}] がない`);
  const qs = new Set();
  (u.facts || []).forEach((x, i) => {
    const w = `facts[${i}] ${x.q || ""}`;
    if (![1, 2, 3, 4].includes(x.lv)) err(f, `${w}: lv`);
    if (!x.q || !x.a || !x.e) err(f, `${w}: q/a/e がない`);
    if (!Array.isArray(x.d) || x.d.length < 3) err(f, `${w}: d が3つ未満`);
    else {
      if (x.d.includes(x.a)) err(f, `${w}: d に正解が入っている`);
      if (new Set(x.d).size !== x.d.length) err(f, `${w}: d が重複`);
    }
    const lim = x.lv >= 3 ? 40 : 20;
    [x.a, ...(x.d || [])].forEach(s => { if (s && s.length > lim) warn(f, `${w}: 選択肢が長い（${s.length}字）「${s}」`); });
    if (qs.has(x.q)) err(f, `${w}: 同じ問いが2回`);
    qs.add(x.q);
  });
  for (const lv of [1, 2, 3, 4]) {
    const n = (u.facts || []).filter(x => x.lv === lv).length;
    if (n < MIN.facts[lv]) err(f, `lv${lv} の facts が ${n}（${MIN.facts[lv]}以上）`);
    const ev = (u.events || []).filter(x => x.lv === lv);
    if (ev.length < MIN.events) err(f, `lv${lv} の events が ${ev.length}（${MIN.events}以上）`);
    const ys = ev.map(x => x.y);
    if (new Set(ys).size !== ys.length) err(f, `lv${lv} の events に同じ y がある`);
    ev.forEach(x => { if (typeof x.y !== "number" || !x.when || !x.t) err(f, `events ${x.t}: y/when/t`); });
    const pr = (u.pairs || []).filter(x => x.lv === lv);
    if (pr.length < MIN.pairs) err(f, `lv${lv} の pairs が ${pr.length}（${MIN.pairs}以上）`);
    const ls = pr.map(x => x.l), rs = pr.map(x => x.r);
    if (new Set(ls).size !== ls.length || new Set(rs).size !== rs.length) err(f, `lv${lv} の pairs に重複`);
  }
  const c = lv => (u.facts || []).filter(x => x.lv === lv).length;
  console.log(`  ${f} ${u.title}: facts ${c(1)}/${c(2)}/${c(3)}/${c(4)}  events ${(u.events || []).length}  pairs ${(u.pairs || []).length}`);
}
console.log(`\n${files.length} 単元  エラー ${errors}  注意 ${warns}`);
process.exit(errors ? 1 : 0);
