CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  name TEXT NOT NULL,
  credentials TEXT NOT NULL,          -- AES-GCM で暗号化した JSON
  enabled INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL DEFAULT '',
  media TEXT NOT NULL DEFAULT '[]',   -- [{key,type,size,alt}]
  status TEXT NOT NULL,               -- draft | scheduled | publishing | done | partial | failed
  scheduled_at INTEGER,
  published_at INTEGER,
  pillar TEXT,                        -- 投稿の柱（public/plan.js の PILLARS）
  created_by TEXT,                    -- 作った人の名前
  updated_by TEXT,                    -- 最後に直した人の名前
  review TEXT,                        -- ふりかえり JSON：summary・good・next・idea
  review_at INTEGER,
  stage TEXT,                         -- 下書きの状態：idea（アイデア）| making（制作中）
  slot TEXT,                          -- 週間スケジュールの枠（public/plan.js の slotsOn の id）
  next_step TEXT,                     -- 次の一歩（public/plan.js の NEXT_STEPS）
  memo TEXT,                          -- 素材メモ・台本（投稿されない）
  format TEXT,                        -- リール台本・カルーセル構成など（素材から展開したもの）
  source_id INTEGER,                  -- もとの素材
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_due ON posts(status, scheduled_at);

CREATE TABLE IF NOT EXISTS targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  body TEXT,                          -- SNSごとに書き分けた本文（NULLなら共通本文）
  title TEXT,                         -- YouTube・ブログ・note の題名、メルマガの件名
  sent TEXT,                          -- 実際に送った本文（自動ハッシュタグ込み）
  status TEXT NOT NULL DEFAULT 'pending', -- pending | ok | manual（コピーして手で投稿） | error
  remote_id TEXT,
  url TEXT,
  error TEXT,
  published_at INTEGER,
  metrics TEXT,                       -- 反応 JSON：views・reach・likes・comments・shares・saves・clicks（manual: true は手入力）
  metrics_at INTEGER,
  metrics_error TEXT
);
CREATE INDEX IF NOT EXISTS targets_post ON targets(post_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL UNIQUE,         -- ログインID（Google ログインのメンバーはメールと同じ）
  email TEXT,                         -- Google アカウントのメール（小文字）
  name TEXT NOT NULL,                 -- 画面に出す名前
  password_hash TEXT NOT NULL,        -- PBKDF2
  role TEXT NOT NULL DEFAULT 'editor', -- admin（SNSの鍵・メンバーも管理） | editor（投稿だけ）
  session_version INTEGER NOT NULL DEFAULT 1,
  disabled INTEGER NOT NULL DEFAULT 0,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS hashtag_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',          -- ["#日本茶", ...]
  auto_platforms TEXT NOT NULL DEFAULT '[]', -- 投稿時に自動で付けるSNS（["instagram", ...]）
  sort INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email);

-- 競合チェック・話題の投稿
CREATE TABLE IF NOT EXISTS watches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,          -- ig_user | ig_tag | yt_channel | yt_query
  value TEXT NOT NULL,         -- ユーザー名・タグ・@ハンドル・キーワード
  info TEXT,                   -- JSON：名前・フォロワー数など（最後に取れたもの）
  last_error TEXT,
  fetched_at INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (kind, value)
);

CREATE TABLE IF NOT EXISTS watch_items (
  watch_id INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  url TEXT,
  caption TEXT,
  thumb TEXT,
  media_type TEXT,             -- image | video | carousel_album | reel | short
  posted_at INTEGER,
  likes INTEGER,
  comments INTEGER,
  views INTEGER,
  duration INTEGER,            -- 秒（YouTube）
  author TEXT,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (watch_id, item_id)
);

CREATE TABLE IF NOT EXISTS watch_stats (
  watch_id INTEGER NOT NULL,
  day TEXT NOT NULL,           -- 日本時間の日付
  followers INTEGER,
  posts INTEGER,
  PRIMARY KEY (watch_id, day)
);

-- 毎日の運用
CREATE INDEX IF NOT EXISTS posts_slot ON posts(slot);
CREATE INDEX IF NOT EXISTS posts_source ON posts(source_id);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,          -- voice（音声メモ）| shoot（撮影）| photo（スマホ写真）
  title TEXT NOT NULL,
  transcript TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS weekly_tasks (
  week_start TEXT NOT NULL,    -- その週の月曜（YYYY-MM-DD）
  step INTEGER NOT NULL,       -- public/plan.js の WORKFLOW
  done_by TEXT,
  done_at INTEGER,
  PRIMARY KEY (week_start, step)
);

CREATE TABLE IF NOT EXISTS kpi_weekly (
  week_start TEXT PRIMARY KEY, -- その週の月曜
  followers INTEGER, saves INTEGER, shares INTEGER, link_clicks INTEGER,
  line_signups INTEGER,        -- LINE・メルマガ登録者の合計
  ig_sales_jpy INTEGER, store_sales_jpy INTEGER,
  keep_pattern TEXT, stop_pattern TEXT, note TEXT,
  updated_by TEXT, updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS roadmap_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL,       -- 今週／0〜30日／31〜60日／61〜90日／アプリ
  title TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  done_by TEXT,
  done_at INTEGER
);
