-- 2つ目の更新：題名と設定（2026-10 以前に schema.sql で作ったDBに当てる）
ALTER TABLE targets ADD COLUMN title TEXT;
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
