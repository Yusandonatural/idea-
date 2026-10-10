-- 4つ目の更新：ハッシュタグのセットと、実際に送った本文
ALTER TABLE targets ADD COLUMN sent TEXT;
CREATE TABLE IF NOT EXISTS hashtag_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  auto_platforms TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
