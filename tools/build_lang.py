#!/usr/bin/env python3
"""中国語以外の言語版のデータを作る。意味リスト（日本語・優先度・Day）は中国語版と共通。

  python3 tools/build_lang.py ko

入力  docs/data/src/<言語>/   items_*.json（意味リストの訳）・slots.json・sounds.json・known.json
                              verbs.json・adverbs.json・adjectives.json・sentences_*.json
出力  docs/data/lang/<言語>.js   docs/<言語>/data/*.csv
"""
import csv, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build as B  # noqa: E402

META = {
    "ko": {
        "jaReplace": [["中国語", "韓国語"], ["中国", "韓国"], ["WeChat", "カカオトーク"]],
        "code": "ko", "name": "韓国語", "native": "한국어", "tts": "ko-KR", "joiner": " ",
        "reading": "読み（カナ）",
        "goal": "日常会話（自分のことと身の回りの話）",
        "goalLong": "3ヶ月後、ネイティブと10〜15分、自分のことと日常の話ができる（CEFR A2前後）",
        "strength": "語順と助詞が日本語とほぼ同じで、漢字語の多くは音も似ているので、文の組み立てより発音と活用に時間を寄せる",
    },
}


PAGE = {
    "ko": {
        "title": "1日60分×90日で韓国語を話す | 90日外国語会話",
        "desc": "日本人が最初に言いたい「意味リスト」500項目を、間隔反復・シャドーイング・例文ドリル・AI会話・録音で90日で使えるようにする外国語会話プログラム。韓国語版。",
        "font": "Noto+Sans+KR:wght@500;700",
        "fontVar": '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif',
        "theme": "#3b82f6",
    },
}
REF = ("patterns.js", "grammar.js", "scenes.js")  # 言語ごとの参考教材（docs/data/src/<言語>/ → docs/data/<言語>/）


def write_page(code, meta):
    """中国語版の docs/index.html を元に、docs/<言語>/index.html・manifest・sw.js を作る（毎回作り直すので手で直さない）"""
    pg = PAGE[code]
    docs = B.ROOT / "docs"
    out = docs / code
    html = (docs / "index.html").read_text(encoding="utf-8")
    import re
    zh_title = re.search(r"<title>(.*?)</title>", html).group(1)
    zh_desc = re.search(r'<meta name="description" content="([^"]*)"', html).group(1)
    html = html.replace(zh_title, pg["title"]).replace(zh_desc, pg["desc"])
    html = html.replace(zh_title.split(" | ")[0], pg["title"].split(" | ")[0])
    html = html.replace('<link rel="canonical" href="https://lang90.yusando.com/">', f'<link rel="canonical" href="https://lang90.yusando.com/{code}/">')
    html = html.replace('content="https://lang90.yusando.com/"', f'content="https://lang90.yusando.com/{code}/"')
    html = html.replace('<link rel="icon" href="icon-192.png">', '<link rel="icon" href="../icon-192.png">')
    html = html.replace('<link rel="apple-touch-icon" href="icon-192.png">', '<link rel="apple-touch-icon" href="../icon-192.png">')
    html = re.sub(r"family=([^\"]*)&display=swap", lambda m: f"family={m.group(1)}&family={pg['font']}&display=swap", html, count=1)
    html = html.replace('<link rel="stylesheet" href="style.css">', '<link rel="stylesheet" href="../style.css">\n<style>:root{--font-han:' + pg["fontVar"] + '}</style>')
    html = re.sub(r'<meta name="theme-color" content="[^"]*">', f'<meta name="theme-color" content="{pg["theme"]}">', html)
    scripts = ['<script src="../data/meanings.js"></script>', f'<script src="../data/lang/{code}.js"></script>', '<script src="../data/days.js"></script>']
    scripts += [f'<script src="../data/{code}/{r}"></script>' for r in REF if (B.SRC / code / r).exists()]
    scripts += ['<script src="../data/langs.js"></script>', '<script src="../app.js"></script>', '<script type="module" src="../sync/app.js"></script>']
    html = re.sub(r'<script src="data/meanings.js"></script>.*?<script type="module" src="sync/app.js"></script>', "\n".join(scripts), html, flags=re.S)
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(html, encoding="utf-8")
    man = json.loads((docs / "manifest.webmanifest").read_text(encoding="utf-8"))
    man.update({"name": f"90日外国語会話（{meta['name']}）", "theme_color": pg["theme"],
                "icons": [{"src": "../icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "../icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}]})
    (out / "manifest.webmanifest").write_text(json.dumps(man, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sw = (docs / "sw.js").read_text(encoding="utf-8")
    srcs = [re.search(r'src="([^"]+)"', x).group(1) for x in scripts]
    files = ["./", "index.html", "manifest.webmanifest", *srcs, "../style.css", "../icon-192.png", "../icon-512.png",
             "../sync/firebase-config.js", "../sync/core/cloud-sync.js", "../sync/core/merge-deep.js", "../sync/core/sync-card.js",
             "../vendor/firebase/firebase-app.js", "../vendor/firebase/firebase-auth.js", "../vendor/firebase/firebase-firestore-lite.js"]
    files = [json.dumps(f) for f in files]
    sw = re.sub(r'const CACHE = "lang90-v(\d+)";', lambda m: f'const CACHE = "lang90-{code}-v{m.group(1)}";', sw)
    sw = re.sub(r"const FILES = \[.*?\];", "const FILES = [" + ", ".join(files) + "];", sw, flags=re.S)
    (out / "sw.js").write_text(sw, encoding="utf-8")
    ref_out = docs / "data" / code
    ref_out.mkdir(parents=True, exist_ok=True)
    for r in REF:
        if (B.SRC / code / r).exists():
            (ref_out / r).write_text((B.SRC / code / r).read_text(encoding="utf-8"), encoding="utf-8")


def main(code):
    meta = META[code]
    src = B.SRC / code
    out_csv = B.ROOT / "docs" / code / "data"
    out_csv.mkdir(parents=True, exist_ok=True)

    items = B.load()
    B.apply_freq(items)
    B.assign_days(items)
    tr = {}
    for f in sorted(src.glob("items_*.json")):
        for x in json.loads(f.read_text(encoding="utf-8")):
            tr[x["no"]] = [x["ko"], x["kana"]]
    missing = [i["no"] for i in items if i["no"] not in tr]
    if missing:
        print(f"訳がない項目 {len(missing)}: {missing[:8]}")
    # 意味リストの日本語を、その言語の国に合わせて言い換える（中国語→韓国語など）。合わない項目は ja_override.json で個別に
    jao = {}
    over = json.loads((src / "ja_override.json").read_text(encoding="utf-8")) if (src / "ja_override.json").exists() else {}
    for i in items:
        ja = i["ja"]
        for a, b in meta.get("jaReplace", []):
            ja = ja.replace(a, b)
        ja = over.get(i["no"], ja)
        if ja != i["ja"]:
            jao[i["no"]] = ja
    read = lambda n: json.loads((src / n).read_text(encoding="utf-8")) if (src / n).exists() else []
    words = B.load_words(src)
    sentences = B.load_sentences(words, src, meta["joiner"])

    lang = {k: v for k, v in meta.items() if k != "jaReplace"}
    lang.update({
        "items": tr, "ja": jao, "slots": read("slots.json") or {}, "sounds": read("sounds.json"), "known": read("known.json"),
        "words": {w["id"]: {k: w.get(k) for k in ("zh", "py", "ja", "pos", "group", "ex", "note", "rank", "order", "day", "hanja")} for w in words},
        "sentences": sentences,
    })
    (B.OUT / "lang" / f"{code}.js").write_text(f"// 自動生成（tools/build_lang.py {code}）\n" + B.js("LANG", lang), encoding="utf-8")

    with (out_csv / "meanings.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["頻度順位", "No.", "カテゴリ", "言いたいこと", "優先度", "Day", meta["name"], meta["reading"]])
        for i in sorted(items, key=lambda i: (i.get("freq") or 0, i["no"])):
            t = tr.get(i["no"], ["", ""])
            w.writerow([i.get("freq") or "", i["no"], B.CAT_NAME[i["cat"]], jao.get(i["no"], i["ja"]), B.STARS[i["pri"]], i["day"], t[0], t[1]])
    with (out_csv / "words.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["学ぶ順", "品詞", "品詞内の頻度順位", meta["name"], meta["reading"], "漢字", "意味", "グループ", "Day", "例文", "例文の読み", "例文の意味", "メモ"])
        for x in words:
            w.writerow([x["order"], x["pos"], x["rank"], x["zh"], x["py"], x.get("hanja", ""), x["ja"], x.get("group", ""), x["day"], *x["ex"][:3], x.get("note", "")])
    with (out_csv / "sentences.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ID", "対象語", "品詞", meta["name"], meta["reading"], "日本語", "レベル"])
        wz = lang["words"]
        for x in sentences:
            w.writerow([x[0], wz[x[1]]["zh"], wz[x[1]]["pos"], x[2], x[3], x[4], x[6]])

    write_page(code, meta)
    pos = {}
    for x in words:
        pos[x["pos"]] = pos.get(x["pos"], 0) + 1
    print(f"{meta['name']}：訳 {len(tr)}/{len(items)}  単語 {len(words)} {pos}  例文 {len(sentences)}  音 {len(lang['sounds'])}  知っている語 {len(lang['known'])}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "ko")
