#!/usr/bin/env python3
"""docs/ を1枚のHTMLにまとめる（claude.ai の Artifact 公開用）。計測タグ・PWAは含めない。
  python3 tools/build_embed.py OUT.html          中国語版（docs/index.html）
  python3 tools/build_embed.py OUT.html ko       韓国語版（docs/ko/index.html）
"""
import re, sys
from pathlib import Path
D = Path(__file__).resolve().parent.parent / "docs"
PAGE = D / sys.argv[2] if len(sys.argv) > 2 else D  # ページのあるフォルダ（スクリプトの相対パスはここから読む）
html = (PAGE / "index.html").read_text(encoding="utf-8")
body = html[html.index("<body>") + 6: html.index("</body>")]
scripts = re.findall(r'<script src="([^"]+)"></script>', body)
body = re.sub(r'<script src="[^"]+"></script>\n?', "", body)
body = re.sub(r'<script type="module" src="[^"]+"></script>\n?', "", body)  # 同期（ログイン）は試用版では使わない
css = (D / "style.css").read_text(encoding="utf-8").replace("header{position:sticky;top:0;", "header{position:sticky;top:env(safe-area-inset-top,0px);")
js = "window.__EMBED__=true;\n" + "\n".join((PAGE / s).resolve().read_text(encoding="utf-8") for s in scripts)
extra_css = "\n".join(re.findall(r"<style>(.*?)</style>", html[: html.index("<body>")], flags=re.S))  # 言語ごとの上書き（韓国語の書体など）
js = js.replace("</script", "<\\/script")
fonts = re.search(r'<link rel="stylesheet" href="(https://fonts[^"]+)">', html).group(1)
title = "90日韓国語会話" if len(sys.argv) > 2 and sys.argv[2] == "ko" else "90日外国語会話"
out = f'<title>{title}</title>\n<link rel="stylesheet" href="{fonts}">\n' + f"<style>\n{css}\n{extra_css}\n</style>\n{body}\n<script>\n{js}\n</script>\n"
Path(sys.argv[1]).write_text(out, encoding="utf-8")
print(sys.argv[1], len(out.encode()) // 1024, "KB")
