-- 届いた投稿（まとめた後も 30 日だけ残す）
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  ip TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  version TEXT NOT NULL,
  env TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_time ON feedback (created_at);
CREATE INDEX IF NOT EXISTS feedback_ip_time ON feedback (ip, created_at);

-- 日ごとのまとめ（日本時間の日付）
CREATE TABLE IF NOT EXISTS digests (
  day TEXT PRIMARY KEY,
  total INTEGER NOT NULL,
  counts TEXT NOT NULL,
  data TEXT NOT NULL
);
