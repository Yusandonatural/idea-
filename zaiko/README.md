# 在庫帳（zaiko）

悠三堂の在庫管理アプリ。Shopify の注文と連動して在庫を引き、**袋・缶・ティーバッグ・ラベルなどの資材**や、**荒茶・焙煎済みの茶葉・漬け込み中の番茶などの仕掛品・半製品**も在庫として持ち、決算の在庫計上（棚卸表）まで出す。

## できること

- **品目**：製品・商品・半製品・仕掛品・原材料・資材の6種類。単位は個・g・kg・枚など自由。単価・補充の目安・SKU
- **構成（レシピ）**：「ほうじ茶ティーバッグ 2g×10P ＝ ほうじ茶 20g・ティーバッグ 10枚・袋 1枚・ラベル 1枚」のように登録。ギフトセット（製品の中に製品）も入れられる。循環する構成は弾く。構成品から原価を積み上げて、単価にできる
- **作り置きしない製品**（都度詰め）：売れたら製品ではなく構成品（中身の茶葉・袋…）から引く。いまの資材で「何個作れるか」を表示する
- **入出庫**：入荷・仕入（単価を入れると移動平均で単価を更新）／製造・袋詰め（構成から使った量を計算、量は直せる。できたものの単価は使ったものの原価から自動計算）／廃棄／調整。伝票は「取り消す」で逆向きの伝票を足して戻せる
- **棚卸**：数えた数を入れると、帳簿との差だけを記録する
- **在庫評価**：基準日（例：3月31日）の数量 × 単価を、勘定科目（製品・商品・半製品・仕掛品・原材料・貯蔵品）ごとに合計。CSV（Excel で開ける）で出せる。資材は「貯蔵品」として計上
- **Shopify 連携**
  - 商品（バリエーションごと）を製品として取り込む
  - 10分ごとに新しい注文を取り込んで在庫を引く（都度詰めの製品は構成品から）。キャンセルは戻す。同じ注文は二度引かない
  - 「Shopify に反映する」にした製品は、在庫数（都度詰めなら作れる数）を Shopify に送る → 袋や茶葉が切れたら Shopify でも売り切れになる
  - 品目に結びついていない商品が売れたら一覧に出す
- **メンバー**：Google アカウントでログイン（sns-hub と同じ Firebase）。管理者／スタッフ

## 使いはじめの流れ

1. 「Shopify」タブでつなぎ、「商品を取り込む」
2. 「＋ 品目を追加」で、資材（袋・缶・ティーバッグ・ラベル・箱）と、中身（荒茶・焙煎済みほうじ茶 など、g 単位）を登録
3. 各製品を開いて構成を入れる（中身 ◯g・袋 1枚・ラベル 1枚…）
4. 「棚卸」でいまの在庫を数えて入れる（これが最初の在庫になる）
5. 以後は、仕入れたら「入荷」、焙煎・袋詰めしたら「製造」。売れた分は Shopify から自動で引かれる
6. 落ち着いたら、売り切れを自動にしたい製品で「Shopify に反映する」をオンにする

## 仕組み

```
ブラウザ（public/）──► Cloudflare Worker（src/）──► Shopify Admin API（2026-10）
                         │  D1：品目・構成・伝票・入出庫・取り込んだ注文
                         └  Cron：10分ごとに 注文の取り込み → 在庫数の反映
```

| ファイル | 役割 |
|---|---|
| `src/index.js` | API の入口と cron |
| `src/inventory.js` | 伝票（入荷・製造・棚卸・出荷）と在庫評価 |
| `src/shopify.js` | 商品の取り込み・注文の取り込み・在庫数の反映 |
| `public/core.js` | 構成の分解・作れる数・原価の積み上げ（画面と Worker で共用） |
| `public/` | 画面。デプロイ時に `scripts/build-static.mjs` が Worker に埋め込む |
| `schema.sql` | D1 のテーブル |

在庫は `moves`（入出庫）の合計で、`items.qty` は速く読むための写し。基準日の在庫は `moves.at` で数える。

## 公開する（初回だけ）

```bash
cd zaiko
npm install
npx wrangler login
npx wrangler d1 create zaiko            # 出てきた database_id を wrangler.toml に書く
npm run db:init
npx wrangler secret put ADMIN_PASSWORD  # 合言葉（オーナー用の予備）
npx wrangler secret put APP_SECRET      # 長いランダム文字列（例: openssl rand -base64 32）
npm run deploy
```

- Google でオーナーとして入るには、Cloudflare の Worker の変数に `OWNER_EMAILS`（例 `isozaki@yusando.com`）を足す
- Firebase コンソール（french90days）→ Authentication → 設定 → 承認済みドメイン に、公開URL（`zaiko.◯◯.workers.dev` や独自ドメイン）を足す
- **APP_SECRET を変えると保存済みの Shopify の鍵が読めなくなる**（つなぎ直しになる）

## Shopify とつなぐ

Shopify の管理画面 → 設定 → アプリと販売チャネル → アプリを開発（または Dev Dashboard）でアプリを作り、次の権限を付ける。

- `read_products`（商品の取り込み）
- `read_orders`（注文の取り込み）
- `read_inventory`・`write_inventory`・`read_locations`（在庫数の反映）

アクセストークン（`shpat_…`）か、Dev Dashboard のアプリならクライアントID とシークレットを「Shopify」タブに入れる。鍵は AES-GCM で暗号化して D1 に保存する。

注文は「つないだ時点」から取り込む。それより前の注文も引きたいときは、「Shopify」タブの取り込み開始日時を変えて「いま取り込む」。

## 手元で動かす・テスト

```bash
npm test                                   # node:test（D1 は node:sqlite でまねる）
printf 'ADMIN_PASSWORD=test1234\nAPP_SECRET=local-dev-secret\n' > .dev.vars
npm run db:init:local && npm run dev       # http://localhost:8787 （合言葉 test1234）
```
