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
  published_at INTEGER
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
