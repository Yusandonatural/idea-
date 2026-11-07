#!/usr/bin/env python3
"""HyperFrames の transcript.json（単語ごとの時刻）から、読みやすい字幕 SRT / VTT / TXT を作る。
日本語など空白で区切らない言語は、句読点・間（ま）・文字数で区切る。
使い方: cues.py transcript.json 出力の名前(拡張子なし) [言語=ja] [1行の最大文字数]
"""
import json, sys

src, base = sys.argv[1], sys.argv[2]
lang = sys.argv[3] if len(sys.argv) > 3 else "ja"
cjk = lang in ("ja", "zh", "ko", "yue")
maxlen = int(sys.argv[4]) if len(sys.argv) > 4 else (18 if cjk else 42)  # 1行の文字数
LINES = 2
sep = "" if cjk and lang != "ko" else " "
END, SOFT = "。．！？!?.", "、，,"
GAP, MAXDUR = 0.6, 6.0

words = [w for w in json.load(open(src, encoding="utf-8")) if str(w.get("text", "")).strip()]
cues, cur = [], []

def text(ws):
    return sep.join(str(w["text"]).strip() for w in ws).strip()

def kind(c):
    o = ord(c)
    if 0x3040 <= o <= 0x309F: return "hira"
    if 0x30A0 <= o <= 0x30FF: return "kata"
    if 0x4E00 <= o <= 0x9FFF or c in "々〆": return "kanji"
    return "other"

def boundary_penalty(x, y):
    """改行してよい場所ほど小さい値（日本語は文節の切れ目を優先）"""
    if x in SOFT + END: return -10
    if not cjk or lang == "ko": return 0
    kx, ky = kind(x), kind(y)
    if kx == "hira" and ky in ("kanji", "kata"): return -4   # 「〜は|漢字」
    if kx == ky and kx in ("kanji", "kata"): return 8          # 単語の途中
    if kx in ("kanji", "kata") and ky == "hira": return 4       # 送り仮名・助詞の手前
    return 0

def two_lines(ws):
    """1行に収まらなければ、語の切れ目で真ん中あたりから2行に分ける"""
    t = text(ws)
    if len(t) <= maxlen:
        return t
    best, bi = None, 1
    for i in range(1, len(ws)):
        a, b = text(ws[:i]), text(ws[i:])
        score = abs(len(a) - len(b)) + boundary_penalty(a[-1], b[0])
        if max(len(a), len(b)) <= maxlen + 2 and (best is None or score < best):
            best, bi = score, i
    return text(ws[:bi]) + "\n" + text(ws[bi:])

def flush():
    if cur:
        cues.append((cur[0]["start"], cur[-1]["end"], two_lines(cur)))
        cur.clear()

for w in words:
    if cur:
        gap = w["start"] - cur[-1]["end"]
        t = text(cur)
        if (gap > GAP or len(t) + len(str(w["text"]).strip()) > maxlen * LINES
                or w["end"] - cur[0]["start"] > MAXDUR
                or (t[-1] in SOFT and len(t) >= maxlen * 0.6)):
            flush()
    cur.append(w)
    if str(w["text"]).strip()[-1] in END:
        flush()
flush()

def ts(s, comma=True):
    ms = int(round(s * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); sec, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{sec:02}{',' if comma else '.'}{ms:03}"

with open(base + ".srt", "w", encoding="utf-8") as f:
    for i, (a, b, t) in enumerate(cues, 1):
        f.write(f"{i}\n{ts(a)} --> {ts(b)}\n{t}\n\n")
with open(base + ".vtt", "w", encoding="utf-8") as f:
    f.write("WEBVTT\n\n")
    for a, b, t in cues:
        f.write(f"{ts(a, False)} --> {ts(b, False)}\n{t}\n\n")
with open(base + ".txt", "w", encoding="utf-8") as f:
    f.write("\n".join(t.replace("\n", "") for _, _, t in cues) + "\n")
print(f"{len(cues)} cues")
