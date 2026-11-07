"""ハイパーモーション動画用の効果音とビートを作る（numpy だけで合成）。

120BPM（1拍0.5秒）。キック・クラップ・ハイハット・ベース、
カットの直前に「シュッ」というウーッシュ、ヒットの瞬間にインパクト音を入れる。
時刻は index.html の hits / カット位置と合わせてある。

使い方: python3 audio.py out.wav
"""
import sys
import wave

import numpy as np

SR = 44100
DUR = 15.0
N = int(SR * DUR)
rng = np.random.default_rng(90)
mix = np.zeros(N)

BEAT = 0.5
CUTS = [2.0, 4.0, 5.0, 6.0, 7.0, 8.0, 10.0, 12.5]
HITS = [0.0, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 10.0, 11.0, 12.5]


def add(sig, at, gain=1.0):
    i = int(at * SR)
    if i >= N:
        return
    j = min(N, i + len(sig))
    mix[i:j] += sig[: j - i] * gain


def t_axis(sec):
    return np.arange(int(sec * SR)) / SR


def kick(length=0.45, f0=160, f1=42):
    t = t_axis(length)
    freq = f1 + (f0 - f1) * np.exp(-t * 28)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    body = np.sin(phase) * np.exp(-t * 7)
    click = rng.standard_normal(len(t)) * np.exp(-t * 300) * 0.3
    return np.tanh((body + click) * 2.2)


def bandnoise(length, lo, hi, env):
    """周波数帯を時間で変えられるノイズ。lo/hi は長さ len(t) の配列か数値。"""
    n = int(length * SR)
    noise = rng.standard_normal(n)
    hop, win = 256, 1024
    out = np.zeros(n + win)
    w = np.hanning(win)
    lo = np.broadcast_to(lo, (n,))
    hi = np.broadcast_to(hi, (n,))
    freqs = np.fft.rfftfreq(win, 1 / SR)
    for s in range(0, n, hop):
        seg = np.zeros(win)
        e = min(n, s + win)
        seg[: e - s] = noise[s:e]
        c = min(n - 1, s + win // 2)
        mask = ((freqs >= lo[c]) & (freqs <= hi[c])).astype(float)
        out[s : s + win] += np.fft.irfft(np.fft.rfft(seg * w) * mask, win) * w
    out = out[:n]
    out /= np.max(np.abs(out)) + 1e-9
    return out * env


def clap():
    t = t_axis(0.25)
    env = np.exp(-t * 22) * (1 + 0.6 * np.exp(-((t - 0.012) ** 2) / 1e-5))
    return bandnoise(0.25, 900, 5000, env)


def hat(length=0.06):
    t = t_axis(length)
    return bandnoise(length, 7000, 16000, np.exp(-t * 70))


def whoosh(length=0.32):
    t = t_axis(length)
    k = t / length
    lo = 200 + 2500 * k**2
    hi = 800 + 9000 * k**2
    env = np.sin(np.pi * np.clip(k, 0, 1) ** 1.5) ** 2
    return bandnoise(length, lo, hi, env)


def riser(length):
    t = t_axis(length)
    k = t / length
    noise = bandnoise(length, 300 + 3000 * k, 2000 + 12000 * k, k**2)
    tone = np.sin(2 * np.pi * np.cumsum(200 + 900 * k**2) / SR) * k**2 * 0.25
    return noise * 0.7 + tone


def impact(length=1.6):
    t = t_axis(length)
    boom = kick(length, 120, 30) * np.exp(-t * 2.2)
    air = bandnoise(length, 100, 3000, np.exp(-t * 5))
    return np.tanh(boom * 1.4 + air * 0.5)


def bass_note(freq, length):
    t = t_axis(length)
    env = np.minimum(1, t * 60) * np.exp(-t * 2.5)
    sig = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2 * t)
    return np.tanh(sig * 1.6) * env


# --- ドラム（終わりの2.5秒は余韻だけ） ---
beats = np.arange(0, 12.5, BEAT)
for b in beats:
    add(kick(), b, 0.9)
for b in beats:
    n = round(b / BEAT)
    if n % 2 == 1:
        add(clap(), b, 0.45)
    add(hat(), b + BEAT / 2, 0.18)
    if b >= 4.0:  # 後半は16分のハットで加速
        add(hat(0.03), b + BEAT / 4, 0.08)
        add(hat(0.03), b + 3 * BEAT / 4, 0.08)

# --- ベース（A→F→C→G を1小節ずつ） ---
roots = [55.0, 43.65, 65.41, 49.0]
for i, b in enumerate(np.arange(0, 12.5, BEAT / 2)):
    bar = int(b // 2.0) % 4
    if (i % 4) in (0, 3):
        add(bass_note(roots[bar], BEAT / 2), b, 0.35)

# --- 効果音 ---
for c in CUTS:
    w = whoosh()
    add(w, c - len(w) / SR + 0.03, 0.55)
for h in HITS:
    if h in (0.0, 12.5):
        continue
    add(kick(0.3, 220, 60), h, 0.35)
add(riser(1.0), 9.0, 0.5)
add(riser(0.5), 12.0, 0.5)
add(impact(), 0.0, 0.8)
add(impact(2.5), 12.5, 1.0)

# --- 仕上げ：フェードアウト・ソフトリミッタ ---
fade = np.ones(N)
fs = int(14.2 * SR)
fade[fs:] = np.linspace(1, 0, N - fs)
mix *= fade
mix = np.tanh(mix * 0.9)
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.89

stereo = np.stack([mix, mix], axis=1)
pcm = (stereo * 32767).astype("<i2")
with wave.open(sys.argv[1] if len(sys.argv) > 1 else "beat.wav", "wb") as f:
    f.setnchannels(2)
    f.setsampwidth(2)
    f.setframerate(SR)
    f.writeframes(pcm.tobytes())
print("ok")
