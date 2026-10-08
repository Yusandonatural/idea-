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
  status TEXT NOT NULL DEFAULT 'pending', -- pending | ok | manual（コピーして手で投稿） | error
  remote_id TEXT,
  url TEXT,
  error TEXT,
  published_at INTEGER
);
CREATE INDEX IF NOT EXISTS targets_post ON targets(post_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
