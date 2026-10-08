# SNS一括投稿（sns-hub）

1つの画面から X・Instagram・Threads・Facebookページ・LINE公式・Bluesky・Mastodon にまとめて投稿し、予約・履歴・アカウントを管理する、悠三堂用の管理ツール。

- **一括投稿**：本文と画像（最大8MB/枚）を1回書けば、選んだSNSすべてに投稿。SNSごとに本文を書き分けることもできる
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
npm run deploy
```

その後、Cloudflare のダッシュボードで Worker に独自ドメイン（例 `sns.yusando.com`）を付け、`wrangler.toml` の `PUBLIC_URL` を同じURLにして再デプロイする。
**APP_SECRET を変えると保存済みの鍵が読めなくなる**（アカウントの登録し直しになる）ので、変えないこと。

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

Meta 系（Instagram・Threads・Facebook）は、自分のアカウントだけに使うならアプリを「開発モード」のままで動く（審査不要）。

## 今後足せるもの

- SNS上の投稿の削除・いいね数などの取得
- 動画（リール・ショート）
- 投稿カレンダー表示、テンプレート・定型ハッシュタグ
- Google Business Profile、LinkedIn、TikTok（審査が必要）
