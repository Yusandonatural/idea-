# 90日外国語会話プログラム

> 同じリポジトリに **SNS一括投稿ツール** があります → [`sns-hub/`](sns-hub/README.md)

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

## 百人一首まなび（`docs/hyakunin/`）

小倉百人一首100首を、20首ずつ5つの巻に分けて覚えるアプリ。公開URLは `https://lang90.yusando.com/hyakunin/`（同じ GitHub Pages に同居、ビルド不要）。

- 5つの巻：一の巻 1〜20番 ／ 二の巻 21〜40 ／ 三の巻 41〜60 ／ 四の巻 61〜80 ／ 五の巻 81〜100
- 巻ごとに ①暗記カード ②下の句クイズ ③決まり字クイズ（取り札はひらがな縦書き） ④作者クイズ ⑤巻のテスト（20問中16問で修了）
- ほかに 百首一覧・苦手復習（まちがえた歌が集まる）・記録。歌ごとに現代語訳と読み上げ（端末の音声）つき
- 歌のデータは `docs/hyakunin/data/poems.js`（1行1首。決まり字は競技かるたの標準、1字7・2字42・3字37・4字6・5字2・6字6）
- 記録はこの端末の localStorage（`hyakunin:v1`）。ログイン同期はなし
- 巻のテスト修了時に `app_action_complete`（site: hyakunin, action: section_pass）を送る

## 日本史アプリ「れきしドリル」（`docs/history/`）

小学6年〜早慶レベルの日本史を、Duolingo のようなクイズで進める別アプリ。公開先は `/history/`。

- 通史（旧石器〜現代の15単元）を **5周** する：小6 → 中学 → 高校（共通テスト）→ 難関大（国公立二次・MARCH）→ 早慶。学年を選ぶとそのステージから始まり、「飛び級テスト」で先へ進める。
- 1単元2レッスン（各10問前後）。問題は4択・〇×・年代ならべかえ・組み合わせ。まちがえた問題はレッスンの最後にもう一度出て、そのあと間隔反復の「ふくしゅう」に入る。
- XP・連続日数・1日の目標・バッジ・年表（検索つき）。記録はこの端末の localStorage（`rekishi:v1`）のみ。
- 教材：`docs/history/data/u01.js`〜`u15.js`（形式は `docs/history/data/SCHEMA.md`）。直したら `node tools/check_history.js` で形式チェック。

## 世界史版「せかいしドリル」（`docs/world/`）・地理版「ちりドリル」（`docs/geo/`）

日本史版と同じアプリ本体（`docs/history/app.js`・`style.css`）を使い、科目ごとの名前・ステージ・保存キーは各フォルダの `app-data.js`（`HIST.app`）で決める。

- 世界史：古代オリエント〜現代の16単元 × 入門（中学）・基礎（歴史総合）・共通テスト・難関大・早慶の5周。
- 地理：地図・地形・気候・産業・地誌・日本の16単元 × 小学・中学・高校・難関大・早慶の5周。並べかえは「北にあるじゅん」「人口が多いじゅん」のように `events` の `k` ごとに出し、年表タブは「データ帳」になる（形式は `docs/geo/data/SCHEMA.md`）。
- 形式チェック：`node tools/check_history.js --dir docs/world/data`／`--dir docs/geo/data`
- 早慶ステージ（lv5）は1単元20問以上で、2文の正誤問題・史料（地理は統計）問題を含む（書き方は各 `SCHEMA.md` の末尾）。
