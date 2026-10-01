# パターンで話す中国語 3ヶ月

1日60分 × 12週で中国語の日常会話へ。文型・文法地図・同音対比で学ぶ学習サイトの企画とプロトタイプ。

- 企画書：[企画書.md](企画書.md)
- プロトタイプ：`docs/index.html`（ビルド不要。GitHub Pages で `docs/` を公開するとそのまま動く）

## ローカルで見る

```bash
cd docs && python3 -m http.server 8000
# http://localhost:8000/
```

## 構成

```
docs/
  index.html          アプリ本体（今日の60分 / 12週 / 文型 / 文法地図 / 同音・声調 / 語彙 / ドリル）
  data/curriculum.js  12週カリキュラム
  data/grammar.js     文法地図 49項目
  data/patterns.js    文型 50
  data/homophones.js  同音・声調セット 32
  data/vocab.js       動詞・副詞・言い回し、1日60分の時間割
  404.html / robots.txt / sitemap.xml
google-ids.json       GA4・広告・サイトURL（web-google-standard）
```

## 教材を増やす

`docs/data/*.js` を編集するだけ。文型は `patterns.js` に追加し、`curriculum.js` の該当週に ID を入れる。文型の `〔…〕` と差し替え語の `A / B / C` は個数を揃える（日本語は `／` 区切り、文全体を差し替えたいときは4要素目に書く）。

## head・サイトマップの再生成

```bash
S=~/.claude/skills/.../web-google-standard
python3 $S/scripts/generate_head.py google-ids.json --page-title "..." --description "..." > head.html
python3 $S/scripts/generate_sitemap.py docs https://zh.yusando.com
```
