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
