-- 投稿ごとの反応とふりかえり
ALTER TABLE targets ADD COLUMN metrics TEXT;        -- JSON：views・reach・likes・comments・shares・saves・clicks（manual: true は手入力）
ALTER TABLE targets ADD COLUMN metrics_at INTEGER;
ALTER TABLE targets ADD COLUMN metrics_error TEXT;
ALTER TABLE posts ADD COLUMN review TEXT;           -- JSON：summary・good・next・idea
ALTER TABLE posts ADD COLUMN review_at INTEGER;
