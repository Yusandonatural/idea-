# SNS一括投稿（sns-hub）

1つの画面から X・Instagram・Threads・Facebookページ・LINE公式・Bluesky・Mastodon・YouTube・Shopifyブログにまとめて投稿し、note とメルマガの原稿も同時に用意する、悠三堂用の管理ツール。予約・履歴・アカウントもここで管理する。

- **一括投稿**：本文と画像（最大8MB/枚）・動画（最大95MB）を1回書けば、選んだSNSすべてに投稿。SNSごとに本文を書き分けることもできる
- **AIで書き分け**：伝えたいことをメモ書きして「✨ AIでSNSごとに書き分ける」を押すと、Claude が X は短く、Instagram はハッシュタグ多め、ブログは見出し付きの読み物、メルマガは挨拶と署名付き…とSNSごとの文章とタイトルを作る。そのまま直してから投稿できる
- **YouTube・Shopifyブログ**：YouTube は動画を1本アップロード（画像は使わない）、Shopifyブログは記事として投稿（1枚目の画像がアイキャッチ、「## 」が見出し）。タイトル欄が出る
- **note・メルマガ**：投稿用の公式APIがないので、文章（タイトル・件名つき）を用意して「コピー」ボタンで貼れるようにする。履歴にも残る
- **文字数・画像チェック**：X（日本語は2文字換算・URLは23）、Bluesky（300）、Threads（500）など、SNSごとの数え方で残り文字数を表示。Instagram の「JPEGのみ・画像必須」なども投稿前に止める
- **予約投稿**：日時を指定すると、毎分動く cron が時刻どおりに投稿する
- **履歴と再試行**：SNSごとの成功・失敗・投稿へのリンクを記録。一部だけ失敗したときは「失敗分を再試行」で、成功済みのSNSには二度投稿せず残りだけ送る
- **アカウント管理**：接続テスト・停止/再開・鍵の更新。Threads / Instagram のトークン（60日期限）は毎日自動で延長する
- **安全**：合言葉でログイン。各SNSの鍵は AES-GCM で暗号化して保存。検索エンジンには載せない（noindex・robots.txt で全拒否。管理ツールなので GA4 タグも入れない）

## 仕組み

```
ブラウザ（public/）──► Cloudflare Worker（src/）──► 各SNSのAPI
                         │  D1：アカウント・投稿・投稿先ごとの結果
                         │  R2：画像（/m/<ランダム名> で公開。Instagram・Threads・LINE が取りに来る）
                         └  Cron：毎分 予約投稿／毎日 トークン延長
```

| ファイル | 役割 |
|---|---|
| `src/index.js` | API と画像配信、cron の入口 |
| `src/publish.js` | 投稿の実行・再試行・予約の処理・制限チェック |
| `src/ai.js` | AIで書き分け（Claude API。SNSごとの書き方は各 `src/platforms/*.js` の `aiGuide`） |
| `src/platforms/*.js` | SNSごとの接続（1ファイル1SNS。増やすときはここに足して `index.js` に登録） |
| `public/` | 管理画面（`textlen.js` は Worker と共用の文字数計算） |
| `schema.sql` | D1 のテーブル |

## 公開する（初回だけ）

```bash
cd sns-hub
npm install
npx wrangler login
npx wrangler d1 create sns-hub          # 出てきた database_id を wrangler.toml に書く
npx wrangler r2 bucket create sns-hub-media
npm run db:init
npx wrangler secret put ADMIN_PASSWORD  # 管理画面の合言葉
npx wrangler secret put APP_SECRET      # 長いランダム文字列（例: openssl rand -base64 32）
npx wrangler secret put ANTHROPIC_API_KEY  # AIで書き分けを使うとき（下記）
npm run deploy
```

その後、Cloudflare のダッシュボードで Worker に独自ドメイン（例 `sns.yusando.com`）を付け、`wrangler.toml` の `PUBLIC_URL` を同じURLにして再デプロイする。
**APP_SECRET を変えると保存済みの鍵が読めなくなる**（アカウントの登録し直しになる）ので、変えないこと。

### すでに公開済みのDBを更新するとき

最初の版（タイトル列・設定表がない版）で `db:init` 済みなら、一度だけ次を実行する。

```bash
npx wrangler d1 execute sns-hub --remote --file=migrations/0002_ai_titles.sql
```

## AIで書き分け

[Claude Console](https://console.anthropic.com/) で API キーを作り、`npx wrangler secret put ANTHROPIC_API_KEY` で入れる。使うモデルは Claude Opus 5.5（`src/ai.js` の `MODEL`）。

- 投稿画面の本文欄に伝えたいことをメモ書き → 投稿先を選ぶ → 「✨ AIでSNSごとに書き分ける」。選んだ投稿先それぞれに文章（とタイトル・件名）が入るので、確認・修正してから投稿する
- 「アカウント」タブの「AIで書き分け」で、お店の説明と口調を書き換えられる（AIが文章を書くときの前提。初期値は悠三堂の説明）
- メモにない日付・価格・効能は作らないよう指示しているが、投稿前に必ず読み直すこと
- 料金は1回あたり数円〜十数円程度（投稿先の数と文章の長さによる）。安全のための判定で断られたときは、Anthropic おすすめの別モデルで自動的にやり直す設定にしている
- Cloudflare AI Gateway を通すときは `ANTHROPIC_BASE_URL` にゲートウェイのURLを入れる（普段は不要）

## ローカルで試す

```bash
cp .dev.vars.example .dev.vars
npm run db:init:local
npm run dev        # http://localhost:8787  合言葉は dev
npm test
```

ローカルでは Instagram・Threads・Facebook・LINE は画像を取りに来られない（localhost なので）。画像付きでこの4つを試すときは公開版で。

## 各SNSの鍵の取り方

画面の「アカウント」→ SNS を選ぶと、必要な項目が出る。保存前に必ず接続テストをするので、間違っていればその場でわかる。

| SNS | 必要なもの | 取り方 |
|---|---|---|
| **X** | API Key / Secret、Access Token / Secret | [developer.x.com](https://developer.x.com) でアプリを作る → User authentication settings で **Read and write** にする → Keys and tokens で Access Token を（権限変更の**後に**）発行。投稿にはAPIの利用料がかかる（プランは X 側で確認） |
| **Instagram** | ユーザーID、長期トークン | プロアカウント（ビジネス/クリエイター）が必要。Meta for Developers でアプリを作り「Instagram API（Instagramログイン）」を追加 → 権限 `instagram_business_basic` `instagram_business_content_publish` でトークン生成。**画像はJPEGのみ・1枚以上必須**。1日の投稿上限あり |
| **Threads** | ユーザーID、長期トークン | Meta for Developers で Threads API のアプリ → 権限 `threads_basic` `threads_content_publish` → 短期トークンを長期トークンに交換 |
| **Facebookページ** | ページID、ページアクセストークン | Graph API エクスプローラーで `pages_manage_posts` `pages_read_engagement` を付けたユーザートークン → 長期化 → `/me/accounts` でページトークンを取る（長期ユーザートークン由来なら無期限） |
| **LINE公式** | チャネルアクセストークン（長期） | LINE Developers → 公式アカウントの Messaging API チャネル → 「Messaging API設定」で発行。**友だち全員への一斉配信**で、月の無料メッセージ数を消費する |
| **Bluesky** | ハンドル、アプリパスワード | 設定 → プライバシーとセキュリティ → アプリパスワード |
| **Mastodon** | サーバーURL、アクセストークン | 設定 → 開発 → 新規アプリ（`write:statuses` `write:media` `read:accounts`） |
| **YouTube** | OAuth クライアントID・シークレット、リフレッシュトークン、公開設定 | Google Cloud でプロジェクトを作り「YouTube Data API v3」を有効化 → OAuth 同意画面（テストユーザーに自分を追加）→ 認証情報で「OAuth クライアントID（ウェブアプリ）」を作る → [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) の設定で自分のクライアントIDを使い、`https://www.googleapis.com/auth/youtube.upload` と `youtube.readonly` を許可してリフレッシュトークンを取る。1日のアップロード数には上限（APIの割り当て）がある。動画は95MBまで |
| **Shopifyブログ** | ストアのドメイン、Admin APIトークン、ブログID | Shopify管理画面 → 設定 → アプリと販売チャネル → アプリを開発 → アプリを作成し、Admin API の `write_content` `read_content` を許可してインストール → トークンを表示。ブログIDは「オンラインストア → ブログ記事 → ブログを管理」で開いたURL末尾の数字。「すぐ公開」か「非公開で保存」を選べる |
| **note** | なし | 公式の投稿APIがないため、文章だけ用意する。投稿後に「コピー」→ note の編集画面に貼る |
| **メルマガ** | なし | 下書き（件名＋本文）を用意する。「コピー」して配信サービスに貼る |

Meta 系（Instagram・Threads・Facebook）は、自分のアカウントだけに使うならアプリを「開発モード」のままで動く（審査不要）。

## 今後足せるもの

- SNS上の投稿の削除・いいね数などの取得
- Instagram リール・X などへの動画投稿（今は YouTube のみ）
- メルマガを Gmail の下書きや Shopify Email に直接作る
- 投稿カレンダー表示、テンプレート・定型ハッシュタグ
- Google Business Profile、LinkedIn、TikTok（審査が必要）
