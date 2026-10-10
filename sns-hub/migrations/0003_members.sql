-- 3つ目の更新：メンバーのログインと、投稿を作った人・直した人
ALTER TABLE posts ADD COLUMN created_by TEXT;
ALTER TABLE posts ADD COLUMN updated_by TEXT;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  session_version INTEGER NOT NULL DEFAULT 1,
  disabled INTEGER NOT NULL DEFAULT 0,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL
);
