#!/usr/bin/env python3
"""docs/ を1枚のHTMLにまとめる（claude.ai の Artifact 公開用）。計測タグ・PWAは含めない。
  python3 tools/build_embed.py OUT.html          中国語版（docs/index.html）
  python3 tools/build_embed.py OUT.html ko       韓国語版（docs/ko/index.html）
  python3 tools/build_embed.py OUT.html all [ko] 中国語・韓国語の両方入り。言語ボタンでページの中で切り替える（[ko] は最初に開く言語）
"""
import json, re, sys
from pathlib import Path
D = Path(__file__).resolve().parent.parent / "docs"
PAGES = {"zh": D, "ko": D / "ko"}  # 言語ごとのページのあるフォルダ（スクリプトの相対パスはここから読む）
TITLE = {"zh": "90日外国語会話", "ko": "90日韓国語会話"}


def page(folder):
    """ページから 本文・スクリプト（絶対パス）・書体のリンク・言語ごとの <style> を取り出す"""
    html = (folder / "index.html").read_text(encoding="utf-8")
    body = html[html.index("<body>") + 6: html.index("</body>")]
    scripts = [(folder / s).resolve() for s in re.findall(r'<script src="([^"]+)"></script>', body)]
    body = re.sub(r'<script src="[^"]+"></script>\n?', "", body)
    body = re.sub(r'<script type="module" src="[^"]+"></script>\n?', "", body)  # 同期（ログイン）は試用版では使わない
    fonts = re.search(r'<link rel="stylesheet" href="(https://fonts[^"]+)">', html).group(1)
    extra_css = "\n".join(re.findall(r"<style>(.*?)</style>", html[: html.index("<body>")], flags=re.S))  # 言語ごとの上書き（韓国語の書体など）
    return body, scripts, fonts, extra_css


def read(path):
    return path.read_text(encoding="utf-8").replace("</script", "<\\/script")


mode = sys.argv[2] if len(sys.argv) > 2 else "zh"
css = (D / "style.css").read_text(encoding="utf-8").replace("header{position:sticky;top:0;", "header{position:sticky;top:env(safe-area-inset-top,0px);")

if mode != "all":
    body, scripts, fonts, extra_css = page(PAGES[mode])
    js = "window.__EMBED__=true;\n" + "\n".join(read(s) for s in scripts)
    out = f'<title>{TITLE[mode]}</title>\n<link rel="stylesheet" href="{fonts}">\n' + f"<style>\n{css}\n{extra_css}\n</style>\n{body}\n<script>\n{js}\n</script>\n"
else:
    first = sys.argv[3] if len(sys.argv) > 3 else "zh"
    packs = {c: page(f) for c, f in PAGES.items()}
    body, _, _, _ = packs["zh"]
    fonts = packs["ko"][2]  # 韓国語ページの書体リンクは中国語の書体も含む
    # 言語ごとの :root の上書きは、その言語のときだけ効くようにする
    extra_css = "\n".join(packs[c][3].replace(":root", f"body.lang-{c}") for c in packs if packs[c][3])
    # スクリプトは text/plain で全部埋め込み、選んだ言語の分だけ順に実行する（共通のファイルは1回だけ入れる）
    blocks, order, seen = [], {c: [] for c in packs}, {}
    for c, (_, scripts, _, _) in packs.items():
        for s in scripts:
            if s not in seen:
                seen[s] = f"js{len(seen)}"
                blocks.append(f'<script type="text/plain" id="{seen[s]}">\n{read(s)}\n</script>')
            order[c].append(seen[s])
    boot = f"""window.__EMBED__=true;
window.__EMBED_LANGS__={json.dumps(list(packs))};
(function () {{
  var ORDER = {json.dumps(order)}, KEY = "lang90:embedLang", lang = null;
  // 選んだ言語は window.name（読み直しても残る）と localStorage（次に開いたときも残る）に入れる
  var m = /^lang90:(\\w+)$/.exec(window.name || ""); if (m && ORDER[m[1]]) lang = m[1];
  if (!lang) {{ try {{ var v = localStorage.getItem(KEY); if (ORDER[v]) lang = v; }} catch (e) {{}} }}
  if (!lang) lang = {json.dumps(first)};
  window.__setEmbedLang__ = function (c) {{ window.name = "lang90:" + c; try {{ localStorage.setItem(KEY, c); }} catch (e) {{}} }};
  document.title = lang === "ko" ? {json.dumps(TITLE["ko"])} : {json.dumps(TITLE["zh"])};
  ORDER[lang].forEach(function (id) {{
    var s = document.createElement("script"); s.textContent = document.getElementById(id).textContent; document.body.appendChild(s);
  }});
}})();"""
    out = (f'<title>{TITLE["zh"]}</title>\n<link rel="stylesheet" href="{fonts}">\n' + f"<style>\n{css}\n{extra_css}\n</style>\n{body}\n"
           + "\n".join(blocks) + f"\n<script>\n{boot}\n</script>\n")

Path(sys.argv[1]).write_text(out, encoding="utf-8")
print(sys.argv[1], len(out.encode()) // 1024, "KB")
