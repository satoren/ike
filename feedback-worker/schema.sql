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

-- 改善リスト：日をまたいで持ち越す、似た投稿をまとめた項目（毎日のルーチンや管理ページで更新する）
CREATE TABLE IF NOT EXISTS backlog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  count INTEGER NOT NULL DEFAULT 0,
  first_day TEXT NOT NULL,
  last_day TEXT NOT NULL,
  samples TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  pr TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS backlog_status ON backlog (status, count);
