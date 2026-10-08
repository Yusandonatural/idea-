# 90日外国語会話プログラム

1日60分 × 90日で、日本人がネイティブと10〜15分、自分のことと日常の話ができるようにする学習プログラム。最初の言語は中国語。

- 企画書：[企画書.md](企画書.md)
- アプリ：`docs/`（ビルド不要の静的サイト。GitHub Pages で `docs/` を公開するとそのまま動く）
- 意味リスト：`docs/data/meanings.csv` ／ 90日テーマ表：`docs/data/days.csv` ／ 差し替え単語：`docs/data/slots.csv`

## 入口ページ（学ぶ言語を選ぶ）

URL をそのまま開くと、学ぶ言語を選ぶ入口（`#/start`）が出ます。言語の一覧は `docs/data/langs.js`（言語を増やすときは1つ足す）。
同じ `yusandonatural.github.io` の上にある各アプリの記録をこの端末から読んで、Day・XP・連続日数を表示します。ホーム画面に追加したアプリは、これまでどおり中国語の「学ぶ」から開きます。

## ローカルで見る

```bash
cd docs && python3 -m http.server 8000
# http://localhost:8000/
```

## 教材を直す・増やす

原本は `docs/data/src/` の JSON。編集したら再生成する。

```bash
python3 tools/build.py
```

- `part*.json`：意味リスト（形式は `docs/data/src/SCHEMA.md`）
- `slots.json`：差し替え単語
- `sounds.json`：日本人がつまずく音トップ10
- `known.json`：実はもう知っている語

`meanings.js`・`lang/zh.js`・`days.js`・CSV は自動生成なので直接編集しない。文型・文法地図・同音セット・会話シーンは `docs/data/patterns.js` などを直接編集する。

## 構成

```
docs/
  index.html  style.css  app.js     アプリ本体
  sw.js  manifest.webmanifest       オフライン対応・ホーム画面追加
  data/meanings.js  data/days.js    意味リスト・90日表（自動生成）
  data/lang/zh.js                   中国語の訳・音・差し替え語（自動生成）
  data/patterns.js grammar.js homophones.js vocab.js scenes.js   中国語の参考教材
tools/build.py                      意味リストからアプリ用データとCSVを生成
google-ids.json                     GA4・広告・サイトURL
```

## ログインと記録の同期

「その他」で Google でログインすると、学習記録（録音以外）を iPhone と Web で同期します。

- しくみは 90日フランス語（Yusandonatural/french-90days）と共通：Firebase プロジェクト french90days、記録は Firestore の `progress-zh/{ユーザーID}`。
- `docs/sync/app.js`：このアプリへのつなぎ込み（合わせ方：数は大きい方、間隔反復のカードは箱が進んでいる方、メモは id でまとめる、ピンイン表示・テーマは新しい方）。
- `docs/sync/core/`：共通の部品（french-90days の `npm run build:sync-core` で作ったもの。直すときは向こうで直してコピー）。
- `docs/vendor/firebase/`：Firebase SDK のブラウザ用ファイル（自前で置いているので CDN 不要・オフライン可）。
- 手元で試す：Firebase エミュレーター（auth :9099・firestore :8085、`--project demo-french`）を起動し、`http://localhost:8000/?emulator#/more` を開く。
- 詳しくは french-90days の `SYNC_HANDOFF.md`。
