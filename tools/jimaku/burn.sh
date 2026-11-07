#!/usr/bin/env bash
# 使い方: tools/jimaku/burn.sh <動画> <字幕.srt> [出力.mp4]
# 字幕を動画に焼き込む（すぐ見られる簡易版。凝った字幕は HyperFrames で作る）
set -euo pipefail
IN="$1"; SRT="$2"; OUT="${3:-${IN%.*}_jimaku.mp4}"
FONT="${JIMAKU_FONT:-Noto Sans CJK JP}"
fc-list | grep -q "$FONT" || FONT="WenQuanYi Zen Hei"
S="$(realpath "$SRT" | sed "s/'/'\\\\''/g; s/:/\\\\:/g")"
ffmpeg -y -loglevel error -i "$IN" \
  -vf "subtitles='$S':force_style='FontName=$FONT,FontSize=22,Outline=2,Shadow=0,MarginV=40'" \
  -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a copy "$OUT"
echo "出力: $OUT"
