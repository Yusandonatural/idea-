-- 在庫管理（zaiko）の D1 テーブル

-- 品目：製品・商品・半製品・仕掛品・原材料・資材（袋・缶・ティーバッグ・ラベルなど）
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- product | goods | semi | wip | material | supply（src/inventory.js の KINDS）
  unit TEXT NOT NULL DEFAULT '個',    -- 個・g・kg・枚・袋 など
  qty REAL NOT NULL DEFAULT 0,        -- いまの在庫（moves の合計。速く読むために持つ）
  unit_cost REAL NOT NULL DEFAULT 0,  -- 1単位あたりの在庫単価（円）。在庫金額 = qty × unit_cost
  price REAL,                         -- 販売価格（円）。原価率の計算に使う
  cost_extras TEXT,                   -- 原価に足す加工費など JSON：[{label: '袋詰費用', amount: 30}, …]（1単位あたり）
  reorder_point REAL,                 -- これを下回ったら「補充」と表示
  make_on_order INTEGER NOT NULL DEFAULT 0, -- 1：作り置きしない。売れたら構成品（中身・袋…）から引く
  sku TEXT,
  shopify_variant_id TEXT UNIQUE,     -- gid://shopify/ProductVariant/...
  shopify_inventory_item_id TEXT,     -- gid://shopify/InventoryItem/...
  push_to_shopify INTEGER NOT NULL DEFAULT 0, -- 1：この在庫数（作れる数）を Shopify に反映する
  pushed_qty INTEGER,                 -- 最後に Shopify へ送った数
  note TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS items_kind ON items(kind, archived);

-- 構成（レシピ）：parent を1単位つくるのに child を qty 使う
CREATE TABLE IF NOT EXISTS bom (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  child_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  qty REAL NOT NULL,
  UNIQUE (parent_id, child_id)
);
CREATE INDEX IF NOT EXISTS bom_child ON bom(child_id);

-- 伝票：入荷・製造・出荷（Shopify注文）・棚卸・調整 を1回ずつまとめる
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                 -- receive | produce | sale | cancel | count | adjust | waste
  at INTEGER NOT NULL,                -- 日付（ミリ秒）。在庫評価の基準日はこれで数える
  ref TEXT,                           -- 注文番号・仕入先など
  note TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS batches_at ON batches(at);

-- 入出庫：品目ごとの増減（+ が入、- が出）
CREATE TABLE IF NOT EXISTS moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  qty REAL NOT NULL,
  unit_cost REAL,                     -- 入荷したときの仕入単価（記録用）
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS moves_item ON moves(item_id, at);
CREATE INDEX IF NOT EXISTS moves_batch ON moves(batch_id);

-- 取り込んだ Shopify 注文（二重に引かないため）
CREATE TABLE IF NOT EXISTS shopify_orders (
  order_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  batch_id INTEGER,
  cancel_batch_id INTEGER,
  unmapped TEXT,                      -- 品目に結びついていない明細 JSON
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- メンバー（Google でログイン）
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff', -- admin | staff
  disabled INTEGER NOT NULL DEFAULT 0,
  session_version INTEGER NOT NULL DEFAULT 0,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL
);
