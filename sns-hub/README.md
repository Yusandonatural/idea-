# SNS一括投稿（sns-hub）

1つの画面から Instagram（リール含む）・Facebookページ・YouTube・Threads・X・LINE公式・Pinterest・Shopifyブログ・Bluesky・Mastodon にまとめて投稿し、メルマガ・TikTok・note・小紅書の原稿も同時に用意する、悠三堂用の管理ツール。予約・履歴・アカウントもここで管理する。

- **一括投稿**：本文と画像（最大8MB/枚）・動画（最大95MB）を1回書けば、選んだSNSすべてに投稿。SNSごとに本文を書き分けることもできる
- **AIで書き分け**：伝えたいことをメモ書きして「✨ AIでSNSごとに書き分ける」を押すと、Claude が X は短く、Instagram はハッシュタグ多め、ブログは見出し付きの読み物、メルマガは挨拶と署名付き…とSNSごとの文章とタイトルを作る。そのまま直してから投稿できる
- **YouTube・Shopifyブログ**：YouTube は動画を1本アップロード（画像は使わない）、Shopifyブログは記事として投稿（1枚目の画像がアイキャッチ、「## 」が見出し）。タイトル欄が出る
- **note・メルマガ**：投稿用の公式APIがないので、文章（タイトル・件名つき）を用意して「コピー」ボタンで貼れるようにする。履歴にも残る
- **SNSフル活用プランを反映**（[プランの doc](https://claude.ai/artifact/Kky8WHto1BZ6C4rpyNpkmm)、`public/plan.js`）：
  - **投稿の柱**：畑と季節30%・自然茶道20%・思想と言葉20%・人と暮らし15%・商品と淹れ方15%。投稿ごとに柱を選び、カレンダーで今月の比率と目安を比べられる。AI は柱の導線（買う・学ぶ…）に合わせて書く
  - **お茶ごよみ・週間スケジュール**：カレンダーに今月の作業・発信テーマ・販売の山と、曜日ごとの投稿の型（月：リール 畑と季節…）を表示。日にちを押すと、その曜日の柱を選んだ状態で予約投稿を作り始める
  - **UTM**：yusando.com へのリンクに媒体ごとの UTM（utm_source=instagram など、キャンペーンは柱）を自動で付け、Shopify で媒体別の売上を見えるようにする（設定で切れる）
  - **リール・動画**：Instagram はリール、Threads は動画として投稿（動画があれば動画1本だけ）
  - **多言語**：AI で Instagram・YouTube・Pinterest に英語・フランス語・中国語の訳を添えられる
  - **新しい投稿先**：Pinterest（API）、TikTok・小紅書（文章を用意してコピー。小紅書は中国語）
- **ハッシュタグ管理**：「ハッシュタグ」タブで、よく使うタグをセット（例：お茶の基本＝#日本茶 #自然栽培 #奈良）にまとめておける。投稿画面でワンクリックで入れられるほか、セットごとに「自動で付けるSNS」を選ぶと、投稿するときに本文の最後へ自動で足す（本文にすでにあるタグと、文字数に収まらない分は足さない。画面に「自動で付くタグ」として表示され、文字数にも含めて数える）。過去の投稿でよく使ったタグのランキングも見られる。AIで書き分けるときもセットのタグを優先して使う
- **文字数・画像チェック**：X（日本語は2文字換算・URLは23）、Bluesky（300）、Threads（500）など、SNSごとの数え方で残り文字数を表示。Instagram の「JPEGのみ・画像必須」なども投稿前に止める
- **予約投稿とカレンダー**：日時を指定すると、毎分動く cron が時刻どおりに投稿する。「カレンダー」タブで月ごとに予約・公開済みを一覧でき、日にちを押せばその日の予約投稿を作れる。予約中の投稿はドラッグで別の日に動かせる（時刻はそのまま）
- **メンバー**：投稿する人ごと（5人でも20人まで）にログインIDとパスワードを作れる。「投稿担当」は投稿・予約・AIの書き分けだけ、「管理者」はSNSの鍵・メンバー・AIの設定も変えられる。誰が作った・直した投稿かが履歴に残る
- **履歴と再試行**：SNSごとの成功・失敗・投稿へのリンクを記録。一部だけ失敗したときは「失敗分を再試行」で、成功済みのSNSには二度投稿せず残りだけ送る
- **アカウント管理**：接続テスト・停止/再開・鍵の更新。Threads / Instagram のトークン（60日期限）は毎日自動で延長する
- **安全**：Google アカウントでログイン（メンバーに登録したメールだけ通す。Google の署名をサーバーで確かめる）。オーナーは予備として合言葉でも入れる。停止やメール変更でその人のログインはすぐ切れる。各SNSの鍵は AES-GCM で暗号化して保存。検索エンジンには載せない（noindex・robots.txt で全拒否。管理ツールなので GA4 タグも入れない）

## 公開先

- 管理画面：https://sns-hub.isozaki-f67.workers.dev （Cloudflare Workers `sns-hub`、D1 `sns-hub`、R2 `sns-hub-media`）
- 独自ドメイン（例 `sns.yusando.com`）をつけたら、`wrangler.toml` の `PUBLIC_URL` を変えて `npm run deploy`

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
| `public/` | 管理画面（`textlen.js`・`hashtags.js` は Worker と共用）。デプロイ時に `scripts/build-static.mjs` が Worker に埋め込む |
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

前の版で `db:init` 済みなら、まだ当てていないものを番号順に一度ずつ実行する（新しく作るなら `db:init` だけでよい）。

```bash
npx wrangler d1 execute sns-hub --remote --file=migrations/0002_ai_titles.sql  # タイトル・AIの設定
npx wrangler d1 execute sns-hub --remote --file=migrations/0003_members.sql    # メンバー・作った人
npx wrangler d1 execute sns-hub --remote --file=migrations/0004_hashtags.sql   # ハッシュタグのセット
npx wrangler d1 execute sns-hub --remote --file=migrations/0005_google_login.sql # Google ログイン（メンバーのメール）
npx wrangler d1 execute sns-hub --remote --file=migrations/0006_plan.sql        # 投稿の柱
npx wrangler d1 execute sns-hub --remote --file=migrations/0007_research.sql    # リサーチ（競合・話題の投稿）
npx wrangler d1 execute sns-hub --remote --file=migrations/0008_reviews.sql     # 反応とふりかえり
```

## Google ログインとメンバー

ログインは Google アカウント（Firebase Authentication。90日外国語アプリと同じ `french90days` プロジェクトを使う）。

**最初に一度だけ（Firebase の設定）**：[Firebase コンソール](https://console.firebase.google.com/project/french90days/authentication/settings) → Authentication → 設定 →「承認済みドメイン」に `sns-hub.isozaki-f67.workers.dev`（独自ドメインをつけたらそれも）を追加する。追加しないと「承認済みドメインに入っていません」と出てログインできない。

**メンバーの追加**：
1. 管理者がログインして「設定」→「メンバー」で、名前・Google アカウントのメール・役割（投稿担当／管理者）を入れて追加
2. 本人は「Google でログイン」を押して、そのアカウントを選ぶだけ（パスワードは不要）

**最初の管理者**：次のどちらか。
- 「合言葉でログイン（オーナー用の予備）」から `ADMIN_PASSWORD` で入り、自分の Google アカウントを「管理者」としてメンバーに追加する
- または Cloudflare の管理画面 → Workers → `sns-hub` → 設定 → 変数で `OWNER_EMAILS` に自分のメールを入れる（そのメールで Google ログインするとオーナーになる。カンマ区切りで複数可）

オーナーの合言葉は画面からは変えられない（`npx wrangler secret put ADMIN_PASSWORD` で変える）。`ADMIN_PASSWORD` を登録しなければ、合言葉でのログインは表示されない。

## AIで書き分け

[Claude Console](https://console.anthropic.com/) で API キーを作り、`npx wrangler secret put ANTHROPIC_API_KEY` で入れる。使うモデルは Claude Opus 5.5（`src/ai.js` の `MODEL`）。

- 投稿画面の本文欄に伝えたいことをメモ書き → 投稿先を選ぶ → 「✨ AIでSNSごとに書き分ける」。選んだ投稿先それぞれに文章（とタイトル・件名）が入るので、確認・修正してから投稿する
- 「アカウント」タブの「AIで書き分け」で、お店の説明と口調を書き換えられる（AIが文章を書くときの前提。初期値は悠三堂の説明）
- メモにない日付・価格・効能は作らないよう指示しているが、投稿前に必ず読み直すこと
- 料金は1回あたり数円〜十数円程度（投稿先の数と文章の長さによる）。安全のための判定で断られたときは、Anthropic おすすめの別モデルで自動的にやり直す設定にしている
- Cloudflare AI Gateway を通すときは `ANTHROPIC_BASE_URL` にゲートウェイのURLを入れる（普段は不要）

## 反応とふりかえり

「履歴」の公開済み投稿に、SNSごとの数字（再生・リーチ・いいね・コメント・シェア・保存）と「いつもの何倍か」、AIのふりかえり（反応のまとめ・良かったところ・次回へのアドバイス3つ・次に試す案）が付く。

- 公開から約1日たつと、毎朝3時半ごろに自動で数字を集めてふりかえる（8日目まで数字は毎日更新）。「反応を見てふりかえる」ですぐにもできる
- 自動で数字を取れるのは Instagram・Facebook・Threads・YouTube・X・Bluesky・Mastodon。TikTok・note・小紅書・メルマガ・LINE などは「数字を入れる」で手入力する
- 「いつも」は、そのアカウントの直近20件の中央値（3件たまるまでは比べない）。反応の点数は いいね＋（コメント・シェア・保存）×3
- 次の投稿画面に「前回のふりかえりからのアドバイス」が出る。AIで書き分けるときも、最近のアドバイスを参考にする
- X は数字の取得にも API の利用枠を使う（プランによっては読み取りが有料）
- AI のふりかえりには `ANTHROPIC_API_KEY` が必要（なくても数字は見られる）

## リサーチ（競合・話題の投稿）

「リサーチ」タブで、見張る相手を登録すると最近の投稿と反応を集め、勢い（1日あたり）・いつもの何倍・反応率で並べる。同じ相手の中央値の2倍以上反応がある投稿に「話題」の印。「ネタにする」で参考メモとして投稿画面に入る。

| 種類 | 必要なもの |
|---|---|
| Instagram アカウント（ビジネス/クリエイターのみ）・ハッシュタグ | Facebook ページ経由（`graph.facebook.com`）で登録した Instagram アカウント。ハッシュタグは Instagram の決まりで7日間に30種類までなので、10個まで |
| YouTube チャンネル・キーワード | `npx wrangler secret put YOUTUBE_API_KEY`（Google Cloud で YouTube Data API v3 の APIキー）か、登録済みの YouTube アカウント（`youtube.readonly` 付き）。キーワードは直近30日の再生数順 |
| TikTok・X・Threads・小紅書・note | 他人の投稿を読む公式APIが審査制・有料のため、検索ページへのリンクを作る |

毎朝3時ごろ、古い順に15件ずつ自動で更新する。「すべて更新」でいつでも更新できる。

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
| **Instagram** | ユーザーID、長期トークン、APIホスト | プロアカウント（ビジネス/クリエイター）が必要。**おすすめは Facebook ページ経由**（APIホスト `graph.facebook.com`）：Instagram をFacebookページにつなぎ、Meta for Developers のアプリで Graph API エクスプローラーから `instagram_basic` `instagram_content_publish` `instagram_manage_insights` `pages_show_list` `pages_read_engagement` `business_management` 付きのユーザートークンを取り長期化 → `/me/accounts?fields=instagram_business_account` でユーザーIDを確認。この方法だと**投稿・反応の取得・競合リサーチ（他アカウント・ハッシュタグ）**が全部使える。Instagramログイン（`graph.instagram.com`、権限 `instagram_business_basic` `instagram_business_content_publish` `instagram_business_manage_insights`）でも投稿と反応の取得はできるが、競合リサーチはできない。**画像はJPEGのみ・1枚以上必須**。1日の投稿上限あり |
| **Threads** | ユーザーID、長期トークン | Meta for Developers で Threads API のアプリ → 権限 `threads_basic` `threads_content_publish` `threads_manage_insights`（反応の取得用）→ 短期トークンを長期トークンに交換 |
| **Facebookページ** | ページID、ページアクセストークン | Graph API エクスプローラーで `pages_manage_posts` `pages_read_engagement` を付けたユーザートークン → 長期化 → `/me/accounts` でページトークンを取る（長期ユーザートークン由来なら無期限） |
| **LINE公式** | チャネルアクセストークン（長期） | LINE Developers → 公式アカウントの Messaging API チャネル → 「Messaging API設定」で発行。**友だち全員への一斉配信**で、月の無料メッセージ数を消費する |
| **Bluesky** | ハンドル、アプリパスワード | 設定 → プライバシーとセキュリティ → アプリパスワード |
| **Mastodon** | サーバーURL、アクセストークン | 設定 → 開発 → 新規アプリ（`write:statuses` `write:media` `read:accounts`） |
| **YouTube** | OAuth クライアントID・シークレット、リフレッシュトークン、公開設定 | Google Cloud でプロジェクトを作り「YouTube Data API v3」を有効化 → OAuth 同意画面（テストユーザーに自分を追加）→ 認証情報で「OAuth クライアントID（ウェブアプリ）」を作る → [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) の設定で自分のクライアントIDを使い、`https://www.googleapis.com/auth/youtube.upload` と `youtube.readonly` を許可してリフレッシュトークンを取る。1日のアップロード数には上限（APIの割り当て）がある。動画は95MBまで |
| **Shopifyブログ** | ストアのドメイン、Admin APIトークン、ブログID | Shopify管理画面 → 設定 → アプリと販売チャネル → アプリを開発 → アプリを作成し、Admin API の `write_content` `read_content` を許可してインストール → トークンを表示。ブログIDは「オンラインストア → ブログ記事 → ブログを管理」で開いたURL末尾の数字。「すぐ公開」か「非公開で保存」を選べる |
| **Pinterest** | アクセストークン、ボードID | [Pinterest Developers](https://developers.pinterest.com/) でアプリを作り、`pins:write` `boards:read` でトークンを発行（ビジネスアカウント）。ボードIDは API の `/v5/boards` で確認。画像1枚（縦長2:3推奨）、本文の最初の yusando.com のURLがリンク先 |
| **TikTok・小紅書** | なし | 公式の投稿APIが審査制・非公開のため、文章を用意する（小紅書は中国語）。「コピー」して各アプリに貼る |
| **note** | なし | 公式の投稿APIがないため、文章だけ用意する。投稿後に「コピー」→ note の編集画面に貼る |
| **メルマガ** | なし | 下書き（件名＋本文）を用意する。「コピー」して配信サービスに貼る |

Meta 系（Instagram・Threads・Facebook）は、自分のアカウントだけに使うならアプリを「開発モード」のままで動く（審査不要）。

## 今後足せるもの

- SNS上の投稿の削除
- Instagram リール・X などへの動画投稿（今は YouTube のみ）
- メルマガを Gmail の下書きや Shopify Email に直接作る
- 投稿カレンダー表示、テンプレート・定型ハッシュタグ
- Google Business Profile、LinkedIn、TikTok（審査が必要）
