"""しっぽり明朝と Cormorant Garamond を fonts/ に取得し、fonts.css を作る。"""
import re, subprocess, hashlib, os
from concurrent.futures import ThreadPoolExecutor
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
URL = "https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=block"
os.makedirs("fonts", exist_ok=True)
css = subprocess.run(["curl", "-sS", "-A", UA, URL], capture_output=True, text=True, check=True).stdout
def get(u):
    n = "fonts/" + hashlib.md5(u.encode()).hexdigest()[:12] + ".woff2"
    if not os.path.exists(n) or os.path.getsize(n) == 0:
        subprocess.run(["curl", "-sS", "--retry", "3", "-m", "40", "-o", n, u], check=True)
    return u, n
with ThreadPoolExecutor(16) as ex:
    for u, n in ex.map(get, sorted(set(re.findall(r"https://[^)]+", css)))):
        css = css.replace(u, n)
open("fonts.css", "w").write(css)
print("ok")
