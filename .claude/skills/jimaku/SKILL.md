---
name: jimaku
description: 音声・動画の文字起こし（Whisper）と字幕づくり、HyperFrames での字幕動画・動画づくり。「文字起こしして」「字幕をつけて」「SRTがほしい」「字幕動画にして」「議事録用にテキストにして」「HyperFrames で動画にして」と頼まれたとき、または音声・動画ファイルを渡されたときに使う。
---

# 文字起こし・字幕（Whisper + HyperFrames）

道具は `tools/jimaku/` にある。音声は外部サービスに送らず、このマシンの中（whisper.cpp）で文字起こしする。

## 1. 準備（毎回最初に。入っていれば数秒で終わる）

```bash
bash tools/jimaku/setup.sh
```

- HyperFrames CLI・Whisper モデル（既定 `small`）・whisper.cpp 本体・HyperFrames のスキルを入れる。
- `huggingface.co` に届かず失敗したら、環境のネット設定で huggingface.co と `us.aws.cdn.hf.co`
  を許可してもらう（get_environment → update_environment）。

## 2. 文字起こし → 字幕ファイル

```bash
tools/jimaku/transcribe.sh <音声か動画> [言語=ja] [出力フォルダ]
```

出力（既定は `<名前>_jimaku/`）:

| ファイル | 中身 |
|---|---|
| `<名前>.srt` / `.vtt` | 字幕（YouTube・Premiere・CapCut などに読み込める） |
| `<名前>.txt` | 字幕の文だけを1行ずつ（議事録・ブログの下書き用） |
| `<名前>.json` | 単語ごとの時刻（HyperFrames の字幕アニメーション用） |

- 言語は `ja`（日本語）が既定。英語なら `en`、韓国語 `ko`、中国語 `zh`。
- 精度を上げたいとき: `WHISPER_MODEL=medium` を付ける（初回は約1.5GBをダウンロード、時間は small の約2倍）。
  ただし medium は句読点を落としやすく、句読点のある small の方が字幕は読みやすいことが多い。
  まず small で作り、固有名詞の誤りは次の「見直し」で直すのがよい。
- 区切り直しだけしたいとき（.json を直した後など）:
  `python3 tools/jimaku/cues.py <名前>.json <名前> ja [1行の文字数=18]`

### 見直し（必ずやる）

Whisper は同音異義語や固有名詞を間違える（例: 停戦会談→「低線階段」、バロメーター→「パロメーター」）。
`.txt` を読んで明らかな誤りを見つけたら、ユーザーに確認したうえで `.srt` / `.vtt` / `.txt` を直す。
専門用語（漢方・生薬名、商品名、人名など）は特に注意し、直した箇所を一覧で伝える。

## 3. 字幕を焼き込んだ動画（すぐ見られる簡易版）

```bash
tools/jimaku/burn.sh <動画> <字幕.srt> [出力.mp4]
```

## 4. HyperFrames で凝った字幕動画・動画を作る

単語ごとに色が変わるカラオケ風字幕、テロップ、縦型ショート、タイトルなど。

```bash
hyperframes init <プロジェクト名> --video <動画> --language ja --model small --non-interactive --skip-skills
```

- これで文字起こし（`transcript.json`）付きのプロジェクトができる。
- 作り方は `/hyperframes` スキル（字幕は captions の参照）と `/hyperframes-registry`（字幕ブロック）を読んでから進める。
  スキルが見つからなければ `bash tools/jimaku/setup.sh` を実行し、新しいセッションで読み込まれることを伝える。
- 日本語フォントは `"Noto Sans CJK JP", sans-serif` を指定する。
- 確認: `cd <プロジェクト> && npx hyperframes check`、書き出し: `npx hyperframes render`（MP4）。

## 5. 渡すとき

- できたファイル（.srt / .txt / .mp4）は作業フォルダか scratchpad に置き、SendUserFile で渡す。
- ユーザーのファイルをリポジトリにコミットしない（音声・動画・字幕は個人のデータ）。
