#!/usr/bin/env python3
"""意味リスト（docs/data/src/*.json）から、アプリ用データとスプレッドシート用CSVを生成する。

  python3 tools/build.py

生成物:
  docs/data/meanings.js   言語に依存しない意味リスト（日本語・カテゴリ・優先度・差し替え種別・Day）
  docs/data/lang/zh.js    中国語の訳・ピンイン・差し替え語・音トップ10・もう知っている語
  docs/data/days.js       90日分の日ごとのテーマ表
  docs/data/meanings.csv  意味リスト（Excel / Googleスプレッドシートで開ける。BOM付きUTF-8）
  docs/data/days.csv      90日テーマ表
  docs/data/slots.csv     差し替え単語
"""
import csv, json, math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs/data/src"
OUT = ROOT / "docs/data"

CATS = [
    ("connect", "会話をつなぐ技術"), ("self", "自分のこと"), ("feel", "好き嫌い・気持ち"),
    ("plan", "予定と過去"), ("ask", "頼む・質問する"), ("travel", "旅先の場面"), ("trouble", "困ったとき"),
]
CAT_NAME = dict(CATS)
CAT_ORDER = {c: i for i, (c, _) in enumerate(CATS)}
# 月内で学ぶ順：つなぐ技術を最初の1週間、次に自分のこと → 質問 → 旅先 → 気持ち → 予定と過去 → 困ったとき
LEARN_ORDER = ["connect", "self", "ask", "travel", "feel", "plan", "trouble"]
SLOT_NAME = {
    "place": "場所", "food": "食べ物", "drink": "飲み物", "thing": "物", "job": "仕事", "hobby": "趣味",
    "family": "家族", "country": "国", "city": "都市", "language": "言語", "time": "時刻・時間帯", "day": "日・曜日",
    "number": "数", "transport": "交通手段", "activity": "すること", "symptom": "症状", "person": "人", "word": "単語",
}
STARS = {3: "★★★", 2: "★★", 1: "★"}
MONTH = {3: 1, 2: 2, 1: 3}
N_PATTERNS = 50  # docs/data/patterns.js の文型数（Day15〜64 に1日1つ）


def load():
    items = []
    for f in sorted(SRC.glob("part*.json")):
        items += json.loads(f.read_text(encoding="utf-8"))
    nos = [i["no"] for i in items]
    dup = {n for n in nos if nos.count(n) > 1}
    if dup:
        raise SystemExit(f"重複した番号: {sorted(dup)}")
    for i in items:
        assert i["cat"] in CAT_NAME, i
        assert i["pri"] in (1, 2, 3), i
        if i.get("slot"):
            assert i["slot"] in SLOT_NAME, i
        if "○○" in i["ja"] and not i.get("slot"):
            i["slot"] = "word"
    return items


def apply_freq(items):
    """freq.json（会話で必要になる頻度の順位）があれば、順位を付けて優先度を決め直す。
    上位150=★★★（1ヶ月目）、次の200=★★（2ヶ月目）、残り=★（3ヶ月目）"""
    f = SRC / "freq.json"
    if not f.exists():
        for i in items:
            i["freq"] = None
        return False
    order = json.loads(f.read_text(encoding="utf-8"))
    rank = {no: k + 1 for k, no in enumerate(order)}
    missing = [i["no"] for i in items if i["no"] not in rank]
    if missing or len(order) != len(items):
        raise SystemExit(f"freq.json が意味リストと一致しません: 不足 {missing[:5]} / 件数 {len(order)}")
    for i in items:
        i["freq"] = rank[i["no"]]
        i["pri"] = 3 if i["freq"] <= 150 else 2 if i["freq"] <= 350 else 1
    return True


def assign_days(items):
    """優先度で月を決め、月内30日に均等に配る。★★★=Day1-30、★★=Day31-60、★=Day61-90。
    月の中は会話での頻度順（freq.json がなければカテゴリ順）"""
    for pri in (3, 2, 1):
        group = [i for i in items if i["pri"] == pri]
        group.sort(key=lambda i: (i["freq"], i["no"]) if i.get("freq") else (LEARN_ORDER.index(i["cat"]), i["no"]))
        start = (MONTH[pri] - 1) * 30 + 1
        n = len(group)
        for k, it in enumerate(group):
            it["day"] = start + math.floor(k * 30 / n)


def build_days(items, sounds, words=()):
    days = []
    for d in range(1, 91):
        todays = [i for i in items if i["day"] == d]
        cats = {}
        for i in todays:
            cats[i["cat"]] = cats.get(i["cat"], 0) + 1
        main = max(cats, key=lambda c: (cats[c], -LEARN_ORDER.index(c))) if cats else "connect"
        month = (d - 1) // 30 + 1
        rec = {
            "day": d, "month": month, "cat": main, "theme": CAT_NAME[main],
            "items": [i["no"] for i in sorted(todays, key=lambda i: i.get("freq") or 0)],
            "words": [w["id"] for w in words if w["day"] == d],
            "sound": d if d <= len(sounds) else None,          # Day1-10: 音トップ10 を1日1つ
            "soundReview": 11 <= d <= 14,                      # Day11-14: 聞き分けテストで総ざらい
            "known": d == 1,                                   # Day1: もう知っている語
            "pattern": (d - 15) if 15 <= d < 15 + N_PATTERNS else None,  # 文型（patterns.js の添字）
            "scene": min(12, (d - 1) // 7 + 1),                # シャドーイング用の会話（週替わり）
            "session": month == 3 and (d - 61) % 7 in (2, 5),  # 3ヶ月目：週2回の会話セッション
            "check": d in (30, 60, 90),                        # 月末の到達チェック（録音して比較）
        }
        days.append(rec)
    return days


WORD_DAYS = 80  # 動詞・副詞は Day1〜80 に均等に配る（残り10日は総仕上げ）


def load_words():
    """動詞・副詞を読み込み、頻度の割合で1本の順番に混ぜる（動詞3：副詞1 くらいの割合になる）"""
    words = []
    for fname, pos, prefix in (("verbs.json", "動詞", "v"), ("adverbs.json", "副詞", "a")):
        f = SRC / fname
        if not f.exists():
            continue
        rows = json.loads(f.read_text(encoding="utf-8"))
        n = len(rows)
        zs = [r["zh"] for r in rows]
        dup = {z for z in zs if zs.count(z) > 1}
        if dup:
            raise SystemExit(f"{fname} に重複: {sorted(dup)}")
        for r in rows:
            words.append(dict(r, id=f"{prefix}{r['rank']}", pos=pos, key=(r["rank"] - 0.5) / n))
    words.sort(key=lambda w: (w["key"], w["pos"]))
    for k, w in enumerate(words):
        w["order"] = k + 1
        w["day"] = 1 + math.floor(k * WORD_DAYS / len(words))
    return words


def js(name, obj):
    return f"window.{name} = " + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ";\n"


def main():
    items = load()
    ranked = apply_freq(items)
    assign_days(items)
    words = load_words()
    slots = json.loads((SRC / "slots.json").read_text(encoding="utf-8"))
    sounds = json.loads((SRC / "sounds.json").read_text(encoding="utf-8"))
    known = json.loads((SRC / "known.json").read_text(encoding="utf-8"))
    items.sort(key=lambda i: i["no"])
    days = build_days(items, sounds, words)

    meanings = [{k: i.get(k) for k in ("no", "cat", "ja", "pri", "slot", "self", "note", "day", "freq")} for i in items]
    (OUT / "meanings.js").write_text(
        "// 自動生成（tools/build.py）。編集は docs/data/src/*.json で行う\n"
        + js("CATS", [{"id": c, "name": n} for c, n in CATS])
        + js("SLOT_NAME", SLOT_NAME)
        + js("MEANINGS", meanings), encoding="utf-8")

    lang = {
        "code": "zh", "name": "中国語", "tts": "zh-CN",
        "goal": "自己紹介と身の回りの会話",
        "goalLong": "3ヶ月後、ネイティブと10〜15分、自分のことと身の回りの話ができる（CEFR A2の手前〜A2）",
        "strength": "漢字が読めるので、読み書きの時間を減らし、発音と声調に時間を寄せる",
        "items": {i["no"]: [i["zh"], i["py"]] for i in items},
        "slots": slots, "sounds": sounds, "known": known,
        "words": {w["id"]: {k: w.get(k) for k in ("zh", "py", "ja", "pos", "group", "ex", "note", "rank", "order", "day")} for w in words},
    }
    (OUT / "lang/zh.js").write_text("// 自動生成（tools/build.py）\n" + js("LANG", lang), encoding="utf-8")
    (OUT / "days.js").write_text("// 自動生成（tools/build.py）\n" + js("DAYS", days), encoding="utf-8")

    with (OUT / "meanings.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["頻度順位", "No.", "カテゴリ", "言いたいこと", "優先度", "差し替え", "自分専用", "Day", "中国語", "ピンイン", "メモ"])
        for i in sorted(items, key=lambda i: (i.get("freq") or 0, i["no"])):
            w.writerow([i.get("freq") or "", i["no"], CAT_NAME[i["cat"]], i["ja"], STARS[i["pri"]], SLOT_NAME.get(i.get("slot") or "", ""),
                        "○" if i.get("self") else "", i["day"], i["zh"], i["py"], i.get("note", "")])
    with (OUT / "words.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["学ぶ順", "品詞", "品詞内の頻度順位", "中国語", "ピンイン", "意味", "グループ", "Day", "例文", "例文ピンイン", "例文の意味", "メモ"])
        for x in words:
            w.writerow([x["order"], x["pos"], x["rank"], x["zh"], x["py"], x["ja"], x.get("group", ""), x["day"], *x["ex"][:3], x.get("note", "")])
    lang_words = lang["words"]
    with (OUT / "days.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Day", "月", "テーマ", "新しい言いたいこと", "件数", "新しい単語", "音", "文型", "会話セッション", "到達チェック"])
        by_no = {i["no"]: i for i in items}
        for d in days:
            snd = sounds[d["sound"] - 1]["title"] if d["sound"] else ("聞き分けテスト" if d["soundReview"] else "")
            w.writerow([d["day"], f"{d['month']}ヶ月目", d["theme"], " / ".join(by_no[n]["ja"] for n in d["items"]),
                        len(d["items"]), " / ".join(lang_words[x]["zh"] for x in d["words"]), snd, "" if d["pattern"] is None else f"文型{d['pattern'] + 1}",
                        "○" if d["session"] else "", "○" if d["check"] else ""])
    with (OUT / "slots.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["種類", "日本語", "中国語", "ピンイン"])
        for k, rows in slots.items():
            for r in rows:
                w.writerow([SLOT_NAME.get(k, k), *r[:3]])

    by_pri = {p: sum(1 for i in items if i["pri"] == p) for p in (3, 2, 1)}
    by_cat = {CAT_NAME[c]: sum(1 for i in items if i["cat"] == c) for c, _ in CATS}
    nslot = sum(len(v) for v in slots.values())
    print(f"意味リスト {len(items)} 項目  優先度 {by_pri}  カテゴリ {by_cat}")
    print(f"差し替え単語 {nslot}  音トップ {len(sounds)}  もう知っている語 {len(known)}")
    print(f"頻度順: {'あり' if ranked else 'なし（カテゴリ順）'}  単語 {len(words)}（動詞 {sum(w['pos']=='動詞' for w in words)} / 副詞 {sum(w['pos']=='副詞' for w in words)}）")
    print("1日あたりの新規:", [len(d['items']) for d in days[:3]], "...", [len(d['items']) for d in days[-3:]])


if __name__ == "__main__":
    main()
