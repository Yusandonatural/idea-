-- 毎日の運用：投稿カード（枠・状態・次の一歩・素材）、素材、週の工程、KPI、ロードマップ
ALTER TABLE posts ADD COLUMN stage TEXT;          -- 下書きの状態：idea（アイデア）| making（制作中）
ALTER TABLE posts ADD COLUMN slot TEXT;           -- 週間スケジュールの枠（public/plan.js の slotsOn の id）
ALTER TABLE posts ADD COLUMN next_step TEXT;      -- 次の一歩（public/plan.js の NEXT_STEPS）
ALTER TABLE posts ADD COLUMN memo TEXT;           -- 素材メモ・台本（投稿されない）
ALTER TABLE posts ADD COLUMN format TEXT;         -- リール台本・カルーセル構成など（素材から展開したもの）
ALTER TABLE posts ADD COLUMN source_id INTEGER;   -- もとの素材
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
