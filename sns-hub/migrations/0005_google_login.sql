-- 5つ目の更新：Google アカウントでのログイン（メンバーはメールで見分ける）
ALTER TABLE users ADD COLUMN email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email);
