// 経営評定（docs/keiei/）の計算ロジックとサンプルデータの検証。
// 使い方: node tools/check_keiei.js
const path = require("path");
const K = require(path.join(__dirname, "..", "docs", "keiei", "logic.js"));
const SAMPLE = require(path.join(__dirname, "..", "docs", "keiei", "sample.js"));

let errors = 0, passed = 0;
const ok = (cond, msg) => { if (cond) passed++; else { errors++; console.log(`✗ ${msg}`); } };
const eq = (a, b, msg) => ok(a === b, `${msg}（期待 ${JSON.stringify(b)}／実際 ${JSON.stringify(a)}）`);
const noThrow = (fn, msg) => { try { fn(); passed++; } catch (e) { errors++; console.log(`✗ ${msg}: ${e.message}`); } };

// --- 月・表示 ---
eq(K.monthAdd("2026-12", 1), "2027-01", "monthAdd 年またぎ");
eq(K.monthAdd("2026-01", -1), "2025-12", "monthAdd 前の年");
eq(K.monthAdd("2026-05", -17), "2024-12", "monthAdd 大きく戻る");
eq(K.monthLabel("2026-10").wareki, "令和8年", "和暦 令和8年");
eq(K.monthLabel("2019-05").wareki, "令和元年", "和暦 令和元年");
eq(K.monthLabel("2026-10").wafu, "神無月", "和風月名");
eq(K.parseYM("2026/3"), "2026-03", "parseYM スラッシュ");
eq(K.parseYM("2026年11月"), "2026-11", "parseYM 年月");
eq(K.parseYM("2026-13"), null, "parseYM 13月は不正");
eq(K.fmtYen(1234000), "¥1,234,000", "fmtYen");
eq(K.fmtYen(-5000), "-¥5,000", "fmtYen マイナス");
eq(K.fmtYen(NaN), "—", "fmtYen NaN");
eq(K.fmtMan(1234000), "123万", "fmtMan 123万");
eq(K.fmtMan(45000), "4.5万", "fmtMan 4.5万");
eq(K.fmtMan(250000000), "2.5億", "fmtMan 億");
eq(K.fmtPct(null), "—", "fmtPct null");

// --- 損益・予実 ---
const s = K.emptyState("2026-04");
let r = K.addCastle(s, "テスト店"); let st = r.state; const cid = r.castle.id;
st.months["2026-04"].c[cid] = { sales: 1000000, cost: 400000, target: 800000, stock: 500000, repeat: 50 };
st.months["2026-04"].sga = 300000; st.months["2026-04"].cash = 2000000;
let p = K.companyPL(st, "2026-04");
eq(p.gross, 600000, "粗利");
eq(p.op, 300000, "営業利益");
eq(p.rate, 1.25, "達成率");
eq(Math.round(p.margin * 100), 60, "粗利率");
eq(K.castleStatus(1.25, 800000).key, "win", "城の状態 攻略");
eq(K.castleStatus(0.85, 1).key, "fight", "城の状態 交戦中");
eq(K.castleStatus(0.5, 1).key, "lose", "城の状態 苦戦");
eq(K.castleStatus(null, 0).key, "none", "城の状態 目標未定");

// ゼロ除算・空データ
const empty = K.emptyState("2026-01");
noThrow(() => {
  const e = K.companyPL(empty, "2026-01");
  ok(e.rate === null && e.margin === null, "空データの率は null");
  K.advise(empty); K.forecastCash(empty, "2026-01"); K.budgetActual(empty, "2026-01"); K.series(empty, null, "2026-01", 12);
  K.toCSV(empty);
}, "空データで計算が落ちない");
eq(K.advise(empty)[0].code, "nocastle", "城がないときの進言");
const r0 = K.addCastle(empty, "A").state;
eq(K.castlePL(r0, "2026-01", r0.castles[0].id).rate, null, "目標0の達成率は null");
eq(K.advise(r0)[0].code, "nodata", "数字が空のときの進言");

// --- 資金繰り予測 ---
st.measures.push({ id: "m1", title: "x", kind: "fushin", castle: cid, general: "", cost: 500000, due: "2026-06-10", status: "todo" });
st.measures.push({ id: "m2", title: "y", kind: "fushin", castle: cid, general: "", cost: 999999, due: "2026-05-01", status: "done" });
const fc = K.forecastCash(st, "2026-04", 6);
eq(fc.rows.length, 6, "予測は6か月");
eq(fc.avgNet, 300000, "平均収支");
eq(fc.rows[0].cash, 2300000, "予測1か月目");
eq(fc.rows[1].measures, 500000, "施策費用は期限の月に入る");
eq(fc.rows[1].cash, 2100000, "予測2か月目（施策費用を引く）");
eq(fc.rows[5].cash, 3300000, "予測6か月目（完了した施策は入らない）");

// --- 進言 ---
const codes = a => a.map(x => x.code);
st.months["2026-04"].cash = 100000;
ok(codes(K.advise(st)).includes("cash-runway"), "資金が少ないと進言が出る");
ok(K.advise(st)[0].lv === 3, "資金1か月分未満は最重要");
ok(codes(K.advise(st)).includes("vacant"), "担当不在の進言");
st.months["2026-04"].c[cid].sales = 400000;
ok(codes(K.advise(st)).includes("castle-target"), "目標割れの進言");
st.measures[0].due = "2026-03-01";
ok(codes(K.advise(st)).includes("overdue"), "期限切れの施策の進言");
const adv = K.advise(st);
ok(adv.every((x, i) => i === 0 || adv[i - 1].lv >= x.lv), "進言は重要度順");

// --- 月次締め ---
st.months["2026-04"].cash = 2000000;
const closed = K.closeMonth(st, "よい月");
eq(closed.current, "2026-05", "次の月へ進む");
eq(closed.chronicle.length, 1, "年表に1件");
eq(closed.chronicle[0].note, "よい月", "一言が残る");
eq(closed.months["2026-05"].c[cid].target, 800000, "目標を引き継ぐ");
eq(closed.months["2026-05"].c[cid].sales, 0, "売上は0から");
eq(closed.months["2026-05"].cash, 2000000, "手元資金を引き継ぐ");
eq(st.current, "2026-04", "元の状態は変えない");

// --- CSV ---
const S = K.normalize(SAMPLE.build());
const csv = K.toCSV(S);
const back = K.importCSV(K.removeCastle(K.normalize(SAMPLE.build()), "c1"), csv);
eq(back.errors.length, 0, "CSV 書き出し→取り込みでエラーなし");
ok(back.created.includes("オンラインショップ"), "CSV で消した城が作り直される");
eq(K.companyPL(back.state, S.current).sales, K.companyPL(S, S.current).sales, "CSV 往復で売上が一致");
eq(K.companyPL(back.state, S.current).cash, K.companyPL(S, S.current).cash, "CSV 往復で手元資金が一致");
const bad = K.importCSV(S, "月,城,売上\n2026-10,オンラインショップ,abc\nだめ,x,1\n\"2026/11\",\"新しい城, 支店\",\"1,200\"\n");
eq(bad.imported, 1, "不正な行は飛ばす");
eq(bad.skipped, 2, "不正な行の数");
eq(K.castleMonth(bad.state, "2026-11", bad.state.castles.find(c => c.name === "新しい城, 支店").id).sales, 1200, "引用符・桁区切りを読む");
eq(K.importCSV(S, "").errors.length, 1, "空のCSV");
eq(K.importCSV(S, "a,b\n1,2").errors.length, 1, "見出しのないCSV");
noThrow(() => K.importCSV(S, "﻿月,城,売上\r\n2026-10,\"引用符\"\"入り\",100\r\n"), "BOM・CRLF・引用符");

// --- JSON 復元 ---
let threw = false;
try { K.normalize({ foo: 1 }); } catch (e) { threw = true; }
ok(threw, "形式の違う JSON は拒む");
const round = K.normalize(JSON.parse(JSON.stringify(S)));
eq(JSON.stringify(round), JSON.stringify(S), "JSON 往復で同じ");
const messy = K.normalize({ castles: [{ id: "a", name: "A" }, { id: "a", name: "dup" }, null], months: { "2026-02": { c: { a: { sales: "x" } } }, "bad": {} }, current: "2026-02", generals: [{ id: "g", name: "G", tou: 999, castle: "zzz" }], measures: [{ id: "m", kind: "?", status: "?" }] });
eq(messy.castles.length, 1, "重複した城を除く");
eq(messy.months["2026-02"].c.a.sales, 0, "数字でない値は0");
eq(messy.generals[0].tou, 100, "能力値は100まで");
eq(messy.generals[0].castle, "", "存在しない城の担当は外す");
eq(messy.measures[0].status, "todo", "不明な状態は未着手");

// --- サンプルデータ ---
eq(S.name, "悠三堂", "サンプルの会社名");
ok(S.castles.length >= 5 && S.castles.length <= 6, "サンプルの城は5〜6");
ok(K.monthsSorted(S).length >= 12, "サンプルは12か月以上");
ok(S.generals.length >= 4, "サンプルの武将");
ok(S.measures.length >= 5, "サンプルの施策");
ok(S.chronicle.length >= 6, "サンプルの年表");
const sa = K.advise(S);
ok(new Set(sa.map(x => x.code)).size >= 5, "サンプルで進言が5種類以上出る");
// 実在の戦国武将名を使っていないか（代表的な名前だけ確認）
const FAMOUS = ["信長", "秀吉", "家康", "信玄", "謙信", "政宗", "幸村", "光秀", "元就", "三成"];
const names = S.generals.map(g => g.name).join(" ");
ok(!FAMOUS.some(n => names.includes(n)), "実在の武将名を使っていない");

console.log(`\n確認 ${passed} 件  エラー ${errors}`);
process.exit(errors ? 1 : 0);
