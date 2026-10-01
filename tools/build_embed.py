#!/usr/bin/env python3
"""docs/ を1枚のHTMLにまとめる（claude.ai の Artifact 公開用）。計測タグ・PWAは含めない。
  python3 tools/build_embed.py OUT.html
"""
import re, sys
from pathlib import Path
D = Path(__file__).resolve().parent.parent / "docs"
html = (D / "index.html").read_text(encoding="utf-8")
body = html[html.index("<body>") + 6: html.index("</body>")]
scripts = re.findall(r'<script src="([^"]+)"></script>', body)
body = re.sub(r'<script src="[^"]+"></script>\n?', "", body)
css = (D / "style.css").read_text(encoding="utf-8").replace("header{position:sticky;top:0;", "header{position:sticky;top:env(safe-area-inset-top,0px);")
js = "window.__EMBED__=true;\n" + "\n".join((D / s).read_text(encoding="utf-8") for s in scripts)
js = js.replace("</script", "<\\/script")
out = f"<title>90日外国語会話</title>\n<style>\n{css}\n</style>\n{body}\n<script>\n{js}\n</script>\n"
Path(sys.argv[1]).write_text(out, encoding="utf-8")
print(sys.argv[1], len(out.encode()) // 1024, "KB")
