-- 原価計算：販売価格と、原価に足す加工費など（袋詰費用・保管料・加工賃…）
ALTER TABLE items ADD COLUMN price REAL;
ALTER TABLE items ADD COLUMN cost_extras TEXT;
