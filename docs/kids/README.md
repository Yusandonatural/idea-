# まなびポイント（こども学習サイト 共通ポイント）

百人一首・日本史・まいにち30ぷん など、こども向けの学習アプリで共通のポイントを貯めるしくみ。

- 入口ページ（アプリ選択画面）：https://yusandonatural.github.io/idea-/kids/ （まいにち30ぷん・百人一首・日本史・世界史・おてつだいこづかい帳 を並べて選べる。兄弟別の合計・レベル・アプリ別・さいきんの記録。保護者向けに子どもの追加とバックアップ）
- 部品：`points.js`（`window.KidsPoints`）。ビルド不要、依存なし
- アプリ一覧：`apps.js`（アプリを増やす・公開URLが決まったらここを直す）
- 試す：`?demo` を付けて開くとテスト用の「+10」ボタンが出る

## アプリへのつなぎ込み（百人一首・日本史の担当者向け）

1. ページに読み込む（どのアプリも `yusandonatural.github.io` の上にあれば、記録は同じ端末で共有される）

   ```html
   <script src="https://yusandonatural.github.io/idea-/kids/points.js"></script>
   ```

   オフラインでも動かしたいときは、`points.js` をアプリにコピーして置いてもよい（保存先のキーが同じなので記録は共有される）。

2. ポイントをあげたいところで呼ぶ

   ```js
   // ふつう（呼ぶたびにふえる）
   KidsPoints.award({ app: "hyakunin", points: 10, reason: "1〜10番 クイズ クリア" });

   // はじめての達成など、1回だけにしたいとき（同じ key は二度ふえない）
   KidsPoints.award({ app: "nihonshi", points: 30, reason: "縄文時代 はじめてクリア", key: "era-jomon" });
   ```

   - `app`：`apps.js` の id（百人一首 `hyakunin`、れきしドリル `nihonshi`、せかいしドリル `sekaishi`、ちりドリル `chiri`、まいにち30ぷん `study`）
   - 画面下に「⭐ +10 ポイント　ぜんぶで 230」が出る。自分で表示するなら `toast: false`
   - その日はじめてのポイントには、アプリ共通の「まいにちボーナス」+5 が自動でつく
   - 返り値 `{ added, bonus, balance, kid }`（`added` が 0 なら二重だった）

3. 画面に今のポイントを出したいとき

   ```js
   KidsPoints.current();            // { id, name, icon } 今の子
   KidsPoints.balance();            // 今もっている点
   KidsPoints.level(KidsPoints.earned()); // { level, rest, ratio }
   KidsPoints.onChange(() => { /* 描き直す */ });
   ```

   アプリ側で子どもを選ばせているなら、`KidsPoints.ensureKid("たろう")` で同じ名前の子を探す（なければ作る）。返り値の `id` を `award({ kid })` に渡す。

## ポイントのめやす（アプリ間でそろえるため）

| こと | 点 |
|---|---|
| 1問 正解 | 1 |
| 1回分（クエスト・10問など）を終えた | 10 |
| 1回分を 8割以上 正解 | +5 |
| はじめての達成（首を覚えた・時代をクリア など）`key` 付き | 20〜30 |
| その日はじめてのポイント（自動） | 5 |

1日ふつうに学んで 30〜60 点くらいになるのを目安にする。レベルは「これまでにもらった合計」で決まる（50・150・300・500 … 点で上がる）。

今は「貯めるだけ」。ごほうびとの交換をはじめるときのために `KidsPoints.spend(点, 理由)` は用意してあるが、画面からは使えないようにしている（使っても レベルは下がらない）。

## 記録のしくみ

- 端末の localStorage、キー `kids-points:v1`。形は `points.js` の先頭のコメント
- 記録は1件ずつ id 付きで残すので、端末どうしは id の和集合で合わせられる（`KidsPoints.merge`）。今は入口ページの「書き出す／読み込む」で移す。あとで 90日外国語会話と同じ Google ログイン＋Firestore 同期をつなぐときも、この merge をそのまま使う
- 注意：localStorage は「同じアドレス（オリジン）」の中だけで共有される。独自ドメイン（例：`xxx.yusando.com`）で公開したアプリとは共有されないので、そのときは同期をつなぐ必要がある
