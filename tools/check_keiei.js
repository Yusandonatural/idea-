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

// --- 石高（圃場面積） ---
const F = K.normalize(SAMPLE.build());
eq(K.kokuOf(F, 10), 10000, "1反（10a）＝1万石");
eq(K.kokuOf(F, 100), 100000, "1町＝10万石");
eq(K.fmtArea(120), "1町2反", "面積の表示 1町2反");
eq(K.fmtArea(45), "4反5a", "面積の表示 4反5a");
eq(K.fmtArea(0), "0a", "面積の表示 0");
eq(K.fmtKoku(120000), "12万石", "石高の表示");
eq(K.parseArea("1町2反"), 120, "面積の読み取り 町・反");
eq(K.parseArea("3反5a"), 35, "面積の読み取り 反・a");
eq(K.parseArea("45"), 45, "面積の読み取り 数字");
ok(isNaN(K.parseArea("広い")), "読めない面積は NaN");
eq(K.areaToA(2, "tan"), 20, "反→a");
eq(K.areaToA(1.5, "cho"), 150, "町→a");
eq(K.totalArea(F), F.fields.filter(f => f.status === "own").reduce((a, f) => a + f.area, 0), "実高の面積（自領だけ）");
const tk = K.totalKoku(F);
eq(tk, K.totalArea(F) * 1000, "国力（実高）＝自領の面積×換算率");
const per = K.incomePerManKoku(F, F.current);
eq(Math.round(per), Math.round(K.companyPL(F, F.current).sales / (tk / 10000)), "1万石あたりの収入");
const F2 = K.clone(F); F2.kokuPerA = 500;
eq(K.totalKoku(F2), K.totalArea(F) * 500, "換算率を変えると石高が変わる");
eq(K.incomePerManKoku(K.emptyState("2026-01"), "2026-01"), null, "総石高0なら1万石あたりは null");
const g3 = F.fields.filter(f => f.general === "g3").reduce((a, f) => a + f.area, 0) * 1000;
eq(K.generalKoku(F, "g3"), g3, "武将の知行（担当圃場の石高合計）");
ok(K.advise(F).some(a => a.code === "vacant-field"), "担当のいない圃場は進言に出る");
const noG = K.removeGeneral(F, "g3");
ok(noG.fields.every(f => f.general !== "g3"), "武将を外すと圃場の担当も空になる");
eq(K.normalize({ castles: [], months: {}, kokuPerA: -3 }).kokuPerA, 1000, "不正な換算率は既定に戻す");
const fcsv = K.fieldsToCSV(F);
const fback = K.importAnyCSV(K.removeField(F, "f1"), fcsv);
eq(fback.kind, "fields", "圃場CSVを見分ける");
eq(fback.errors.length, 0, "圃場CSVの往復でエラーなし");
eq(K.totalArea(fback.state), K.totalArea(F), "圃場CSVの往復で面積が一致");
eq(fback.state.fields.find(f => f.name === "東の茶畑").general, "g3", "圃場CSVの担当を名前で戻す");
const fbad = K.importAnyCSV(F, "圃場,面積(a),担当\n新畑,2反,誰か\n悪い畑,広い,\n,10,\n");
eq(fbad.imported, 1, "圃場CSVの不正な行は飛ばす");
eq(fbad.state.fields.find(f => f.name === "新畑").area, 20, "圃場CSVで「2反」を読む");
eq(K.importAnyCSV(F, csv).kind, "months", "数字のCSVを見分ける");

// --- サンプルデータ ---
eq(S.name, "悠三堂", "サンプルの会社名");
ok(S.castles.length >= 5 && S.castles.length <= 6, "サンプルの城は5〜6");
ok(K.monthsSorted(S).length >= 12, "サンプルは12か月以上");
ok(S.generals.length >= 4, "サンプルの武将");
ok(S.measures.length >= 5, "サンプルの施策");
ok(S.chronicle.length >= 6, "サンプルの年表");
ok(S.fields.length >= 6, "サンプルの圃場は6枚以上");
ok(new Set(S.fields.map(f => f.status)).size === 5, "サンプルの圃場に5つの状態がそろう");
const sa = K.advise(S);
ok(new Set(sa.map(x => x.code)).size >= 5, "サンプルで進言が5種類以上出る");
// 実在の戦国武将名を使っていないか（代表的な名前だけ確認）
const FAMOUS = ["信長", "秀吉", "家康", "信玄", "謙信", "政宗", "幸村", "光秀", "元就", "三成"];
const names = S.generals.map(g => g.name).join(" ");
ok(!FAMOUS.some(n => names.includes(n)), "実在の武将名を使っていない");

// ================= 第2版：国取り・商い・外交・奉行所 =================
// --- 第1版・第2版の保存データからの移行 ---
const V1 = { v: 1, name: "旧", current: "2026-03", seq: 5, castles: [{ id: "c1", name: "本店", slot: 0 }],
  months: { "2026-03": { c: { c1: { sales: 100000, cost: 40000, target: 90000, stock: 0, repeat: 50 } }, sga: 30000, cash: 500000 } },
  generals: [{ id: "g1", name: "甲", tou: 50, bu: 50, chi: 50, sei: 50, castle: "c1" }], measures: [],
  chronicle: [{ ym: "2026-02", sales: 1, op: 1, rate: 1, note: "旧い記録" }] };
let m1;
noThrow(() => { m1 = K.normalize(JSON.parse(JSON.stringify(V1))); }, "第1版のデータを読める");
eq(m1.v, K.DATA_VERSION, "版数が上がる");
eq(m1.fields.length, 0, "第1版：圃場なし");
eq(m1.houses.length + m1.letters.length + m1.bugyo.length + m1.reports.length, 0, "第1版：外交・奉行は空で始まる");
eq(m1.targetKoku, 1000000, "第1版：目標石高は既定の100万石");
eq(m1.chronicle[0].kind, "close", "第1版の年表は月次締めとして残る");
eq(K.companyPL(m1, "2026-03").sales, 100000, "第1版の数字はそのまま");
const V2 = JSON.parse(JSON.stringify(V1)); V2.v = 2; V2.kokuPerA = 1000;
V2.fields = [{ id: "f1", name: "旧畑", area: 30, crop: "茶", general: "g1", memo: "", slot: 0 }, { id: "f2", name: "旧畑2", area: 12, slot: 1 }];
const m2 = K.normalize(V2);
ok(m2.fields.every(f => f.status === "own"), "第2版の圃場（状態なし）は自領として移る");
eq(K.totalKoku(m2), 42000, "第2版の圃場がそのまま実高になる");
eq(m2.fields[0].since, "2026-03", "移した圃場の『この状態になった月』は今の月");
noThrow(() => K.advise(m2, m2.current, "2026-03-31"), "移したデータで進言が出せる");

// --- 国取り：状態・石高の数え方・ゲージ ---
const sp = K.landSplit(S);
eq(sp.real, S.fields.filter(f => f.status === "own").reduce((a, f) => a + f.area, 0) * 1000, "実高＝自領");
eq(sp.expected, S.fields.filter(f => f.status === "got" || f.status === "clearing").reduce((a, f) => a + f.area, 0) * 1000, "見込み＝獲得＋開墾中");
eq(sp.aim, S.fields.filter(f => f.status === "aim" || f.status === "talk").reduce((a, f) => a + f.area, 0) * 1000, "狙い＝狙い＋調略中");
const tk2 = K.tenka(S);
eq(tk2.target, 1000000, "天下取りの目標");
eq(tk2.rateReal, sp.real / 1000000, "天下取りゲージ（実高）");
eq(tk2.rateExpected, (sp.real + sp.expected) / 1000000, "天下取りゲージ（見込み込み）");
eq(K.yieldPerTan({ area: 120, harvestKg: 15600 }), 1300, "反収（kg／反）");
eq(K.yieldPerTan({ area: 0, harvestKg: 100 }), null, "面積0の反収は null");
// 出陣 → 調略を進める → 自領
let L0 = K.normalize(SAMPLE.build());
const ra0 = K.addField(L0, { name: "テスト候補地", area: 20, status: "aim" }, L0.current);
eq(ra0.field.status, "aim", "出陣で狙い（候補地）として加わる");
eq(K.landSplit(ra0.state).aim, sp.aim + 20000, "候補地は狙いに入る");
let Lx = ra0.state, fid = ra0.field.id, evBefore = Lx.chronicle.filter(e => e.kind === "event").length;
const steps = [];
for (let i = 0; i < 4; i++) { const r = K.advanceField(Lx, fid, "2026-10", "2026-10-20"); Lx = r.state; steps.push(r.field.status + (r.logged ? "*" : "")); }
eq(steps.join(","), "talk,got*,clearing,own*", "調略を進める：狙い→調略中→獲得→開墾中→自領（獲得・自領で年表）");
eq(K.landSplit(Lx).real, sp.real + 20000, "自領になると実高が増える");
const evs = Lx.chronicle.filter(e => e.kind === "event");
eq(evs.length, evBefore + 2, "年表に2件（獲得・自領）");
ok(evs.some(e => e.text === "テスト候補地を獲得、2万石（2反）"), "年表の文面「◯◯を獲得、◯万石」");
let threw2 = false; try { K.advanceField(Lx, fid, "2026-10"); } catch (e) { threw2 = true; }
ok(threw2, "自領より先には進めない");
threw2 = false; try { K.retreatField(Lx, fid); } catch (e) { threw2 = true; }
ok(threw2, "自領からは撤退できない");
const rt = K.retreatField(S, "f7");
ok(!rt.fields.some(f => f.id === "f7"), "撤退で候補から外れる");
ok(S.fields.some(f => f.id === "f7"), "撤退しても元の状態は変えない");
// 進言：止まっている調略・長い開墾
const advS = K.advise(S, S.current, "2026-11-21");
ok(advS.some(a => a.code === "land-stall" && a.title.includes("峠の茶園跡")), "調略が◯か月止まっている土地の進言");
ok(advS.some(a => a.code === "land-clearing" && a.title.includes("南斜面の畑")), "開墾中のまま半年の進言");
ok(advS.some(a => a.code === "silent"), "音信の途絶えた相手の進言");
ok(!advS.some(a => a.code === "vacant-field" && a.title.includes("北の耕作放棄地")), "狙いの土地は担当不在の進言に出さない");
ok(advS.every(a => a.area), "進言にどの画面の話かが付く");
// 商いの言葉（戦の言葉を使わない）
const shopTexts = advS.filter(a => a.area === "shop").map(a => a.title + a.text).join(" ");
ok(!/合戦|攻略|全軍|兵糧|民忠|城主|城、/.test(shopTexts), "商いの進言に戦の言葉が入らない");
eq(K.castleStatus(1.1, 1).label, "繁盛", "繁盛");
eq(K.castleStatus(0.9, 1).label, "堅調", "堅調");
eq(K.castleStatus(0.5, 1).label, "不振", "不振");
// 開墾費用は資金繰り予測に入る
const fcS = K.forecastCash(S, S.current, 6);
const clearSum = S.fields.filter(f => f.status === "got" || f.status === "clearing").reduce((a, f) => a + f.clearCost, 0);
ok(fcS.rows[0].measures >= clearSum, "獲得・開墾中の開墾費用を翌月に見込む");

// --- 外交 ---
eq(K.daysBetween("2026-09-02", "2026-11-21"), 80, "日数の計算");
const sil = K.silentHouses(S, "2026-11-21").map(x => x.house.id).sort().join(",");
eq(sil, "h1,h3", "音信の途絶えた相手（友好度4以上・地主で60日以上）");
const lt = K.fillLetter(S, "land", "h3", "青葉 誠之助", "2026-11-21");
ok(lt.body.startsWith("大野 フミ様"), "個人宛ての宛名は「名前様」");
ok(lt.body.includes("悠三堂") && lt.body.includes("青葉 誠之助"), "自社名と署名を差し込む");
ok(!/\{.+?\}/.test(lt.subject + lt.body), "差し込み漏れがない");
const lt2 = K.fillLetter(S, "thanks", "h1", "青葉", "2026-11-21");
ok(lt2.body.startsWith("茶舗 山科園\n山科様"), "会社宛ては会社名と担当者様");
eq(K.LETTER_TEMPLATES.length >= 5, true, "書状の型は5種以上");
K.LETTER_TEMPLATES.forEach(t => { const x = K.fillLetter(S, t.key, "h6", "香坂", "2026-11-21"); ok(!/\{.+?\}/.test(x.subject + x.body), "型「" + t.name + "」の差し込み"); });
const href = K.mailtoHref("hello@tomoshibi-cafe.example.com", "件名 & テスト", "一行目\n二行目");
ok(href.startsWith("mailto:hello@tomoshibi-cafe.example.com?subject="), "mailto の宛先");
const u = new URL(href);
eq(u.searchParams.get("subject"), "件名 & テスト", "mailto の件名（& を含む）");
eq(u.searchParams.get("body"), "一行目\r\n二行目", "mailto の本文（改行は CRLF）");
const rl = K.recordLetter(S, { date: "2026-11-21", house: "h1", subject: "s", body: "b" });
eq(rl.state.letters.length, S.letters.length + 1, "送ったと記録で書状が増える");
eq(rl.state.houses.find(h => h.id === "h1").last, "2026-11-21", "最後にやりとりした日が更新される");
ok(!K.silentHouses(rl.state, "2026-11-21").some(x => x.house.id === "h1"), "記録すると音信の途絶えから外れる");
ok(S.houses.every(h => !h.email || /@[a-z0-9-]+\.example\.com$|@example\.com$/.test(h.email)), "サンプルのアドレスは example.com");
const rmH = K.removeHouse(S, "h2");
ok(rmH.fields.every(f => f.landlord !== "h2"), "諸家を消すと圃場の地主も空になる");
// 諸家の CSV
const hcsv = K.housesToCSV(S);
const hb = K.importAnyCSV(K.removeHouse(S, "h6"), hcsv);
eq(hb.kind, "houses", "諸家のCSVを見分ける");
eq(hb.errors.length, 0, "諸家のCSVの往復でエラーなし");
eq(hb.state.houses.find(h => h.name === "カフェ 灯").email, "hello@tomoshibi-cafe.example.com", "諸家のCSVでメールが戻る");
eq(K.importAnyCSV(S, "諸家,友好度\nだれか,9\n").skipped, 1, "友好度が1〜5でない行は飛ばす");
// 圃場の CSV（状態つき）
const fcsv2 = K.fieldsToCSV(S);
const fb2 = K.importAnyCSV(K.removeField(S, "f8"), fcsv2);
eq(fb2.errors.length, 0, "圃場CSV（状態つき）の往復でエラーなし");
eq(fb2.state.fields.find(f => f.name === "峠の茶園跡").status, "talk", "圃場CSVで状態が戻る");
eq(fb2.state.fields.find(f => f.name === "峠の茶園跡").landlord, "h2", "圃場CSVで地主が戻る");
eq(K.importAnyCSV(S, "圃場,状態\nx,すごい\n").skipped, 1, "読めない状態は飛ばす");
eq(K.importAnyCSV(S, "月,城,売上\n2026-10,オンラインショップ,5\n").kind, "months", "第1版の「城」見出しのCSVも読める");
eq(K.importAnyCSV(S, "月,城,売上\n2026-10,オンラインショップ,5\n").errors.length, 0, "第1版のCSVでエラーなし");

// --- 奉行所：下知状 ---
eq(S.bugyo.length, 5, "初期の奉行は5人");
eq(S.bugyo.map(b => b.name).join(","), "勘定奉行,農政奉行,商い奉行,外交奉行,目付", "初期の奉行の顔ぶれ");
ok(S.bugyo.every(b => b.instructions.length > 100), "初期の奉行に指示書が入っている");
const ord = K.buildOrder(S, S.bugyo[0], "来月の資金繰りで気をつけることは？", { today: "2026-11-21" });
ok(ord.includes("【下知状】勘定奉行 への依頼"), "下知状の見出し");
ok(ord.includes(S.bugyo[0].instructions.slice(0, 30)), "下知状に指示書が入る");
ok(ord.includes("来月の資金繰りで気をつけることは？"), "下知状に依頼文が入る");
ok(ord.includes("### 損益（2026年10月）") && ord.includes("¥3,145,000"), "選んだ資料（損益）の今の数字が入る");
ok(ord.includes("### 店ごとの予実") && ord.includes("卸（茶舗・カフェ）"), "選んだ資料（店ごとの予実）が入る");
ok(!ord.includes("### 圃場と国取りの状況"), "選んでいない資料は入らない");
ok(ord.indexOf("■ 資料") < ord.indexOf("■ 今回の依頼"), "資料のあとに依頼文");
const ordAll = K.buildOrder(S, Object.assign({}, S.bugyo[4]), "点検して", { today: "2026-11-21" });
ok(["### 損益", "### 店ごとの予実", "### 圃場と国取りの状況", "### 諸家", "### 書状の記録", "### 施策", "### 武将"].every(h => ordAll.includes(h)), "目付には全部の資料が入る");
ok(ordAll.includes("| 峠の茶園跡 | 調略中（交渉中） |"), "圃場の表に状態が入る");
ok(!ordAll.includes("undefined") && !ordAll.includes("NaN"), "下知状に undefined・NaN が出ない");
noThrow(() => K.buildOrder(K.emptyState("2026-01"), { name: "x", role: "x", data: K.DATA_KEYS.map(d => d.key), instructions: "" }, "", { today: "2026-01-31" }), "空データでも下知状を作れる");
ok(!/https?:\/\//.test(ordAll), "下知状に外部の URL を入れない");
const ar = K.addReport(S, "b4", "書いて", "件名：テスト\n本文", "2026-11-21");
eq(ar.state.reports.filter(r => r.bugyo === "b4").length, S.reports.filter(r => r.bugyo === "b4").length + 1, "報告を記録");
threw2 = false; try { K.addReport(S, "b4", "x", "   "); } catch (e) { threw2 = true; }
ok(threw2, "空の報告は記録しない");
const rb = K.removeBugyo(S, "b4");
ok(!rb.reports.some(r => r.bugyo === "b4"), "奉行を消すと報告も消える");
const round2 = K.normalize(JSON.parse(JSON.stringify(S)));
eq(JSON.stringify(round2), JSON.stringify(S), "第3版の JSON 往復で同じ");

console.log(`\n確認 ${passed} 件  エラー ${errors}`);
process.exit(errors ? 1 : 0);
