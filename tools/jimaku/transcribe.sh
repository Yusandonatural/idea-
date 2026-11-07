#!/usr/bin/env bash
# 使い方: tools/jimaku/transcribe.sh <音声か動画> [言語=ja] [出力フォルダ]
# 出力: <名前>.srt / <名前>.vtt / <名前>.txt / <名前>.json（単語ごとの時刻）
set -euo pipefail
IN="$(realpath "$1")"; LANG_CODE="${2:-ja}"
NAME="$(basename "${IN%.*}")"
OUT="$(realpath -m "${3:-$(dirname "$IN")/${NAME}_jimaku}")"
MODEL="${WHISPER_MODEL:-small}"
mkdir -p "$OUT"
export NODE_USE_ENV_PROXY=1 NODE_NO_WARNINGS=1

cd "$OUT"
hyperframes transcribe "$IN" --model "$MODEL" --language "$LANG_CODE" -d "$OUT"
cp transcript.json "$NAME.json"
python3 "$(dirname "$(realpath "$0")")/cues.py" "$NAME.json" "$NAME" "$LANG_CODE"
rm -f transcript.json
echo "出力: $OUT"; ls -1 "$OUT"
