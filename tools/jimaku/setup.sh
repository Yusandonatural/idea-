#!/usr/bin/env bash
# 文字起こし（Whisper）と HyperFrames を使える状態にする。何回実行してもよい。
set -euo pipefail
VER="${HYPERFRAMES_VERSION:-0.9.19}"
MODEL="${WHISPER_MODEL:-small}"   # 日本語は small 以上（small / medium / large-v3）
M="$HOME/.cache/hyperframes/whisper/models"

command -v hyperframes >/dev/null && hyperframes --version 2>/dev/null | grep -q "$VER" \
  || npm install -g "hyperframes@$VER"

# 日本語フォント（字幕の焼き込み・HyperFrames の書き出し用）
if ! fc-list 2>/dev/null | grep -q "Noto Sans CJK JP"; then
  (apt-get install -y -q fonts-noto-cjk || (apt-get update -q && apt-get install -y -q fonts-noto-cjk)) >/dev/null 2>&1 \
    || echo "注意: 日本語フォントを入れられませんでした（字幕は別のフォントで出ます）"
fi

mkdir -p "$M"
if [ ! -s "$M/ggml-$MODEL.bin" ]; then
  echo "Whisper モデル ($MODEL) をダウンロード中…"
  curl -sSLf -o "$M/ggml-$MODEL.bin.part" \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$MODEL.bin"
  mv "$M/ggml-$MODEL.bin.part" "$M/ggml-$MODEL.bin"
fi

# whisper.cpp 本体は初回の transcribe で自動ビルドされる。ここで先に済ませておく。
if [ ! -x "$HOME/.cache/hyperframes/whisper/whisper.cpp/build/bin/whisper-cli" ]; then
  tmp="$(mktemp -d)"
  ffmpeg -y -loglevel error -f lavfi -i "sine=f=440:d=2" -ar 16000 "$tmp/w.wav"
  (cd "$tmp" && hyperframes transcribe w.wav --model "$MODEL" --optional >/dev/null) || true
  rm -rf "$tmp"
fi

# Claude 用の HyperFrames スキル（~/.claude/skills）。次のセッションから読み込まれる。
[ -d "$HOME/.claude/skills/hyperframes" ] || (cd /tmp && hyperframes skills update >/dev/null) || true

echo "OK: $(hyperframes --version 2>/dev/null | tail -1) / model=$MODEL"
