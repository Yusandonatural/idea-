# ハイパーモーション動画（90日外国語会話・15秒・縦型）

- 完成動画：[`hypermotion.mp4`](hypermotion.mp4)（1080×1920 / 30fps / 15秒 / 音付き）
- リール・TikTok・ショート向けの縦長。CapCutに読み込んで、BGMの差し替えや文字の手直しができます。

## 構成（120BPM、拍に合わせてカット）

| 秒 | 内容 |
|---|---|
| 0–2 | 「90」が叩きつけられる →「日で」→「話せる。」 |
| 2–4 | 1日 0→60分のカウンター →「×90日」 |
| 4–8 | アプリ画面を1秒ずつ：覚える／聞く／話す／使う |
| 8–10 | 4画面が扇形に並ぶ「毎日 60分」「聞く・話す・使う」 |
| 10–12.5 | 「ネイティブと 10〜15分 会話できる」 |
| 12.5–15 | エンドカード「90日 外国語会話プログラム／まずは中国語から」 |

## 作り直す

```bash
node video/hypermotion/render.js
```

Playwright（Chromium）・ffmpeg・python3 + numpy が必要です（グローバルに入れた Playwright なら `NODE_PATH=$(npm root -g)` を付ける）。

- 文字・色・タイミング：`index.html`（`SHOTS` が画面ごとの見出し、`TL` がタイムライン）
- 音（ビート・効果音）：`audio.py`
- ブラウザで `index.html` を開くと（`python3 -m http.server` でリポジトリ直下から）そのままループ再生されます
- フォント：Noto Sans JP（SIL Open Font License）
