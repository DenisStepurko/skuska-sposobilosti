-- One row per person per question: a repeated suggestion from the same device replaces the previous one.
CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cat TEXT NOT NULL,
  n INTEGER NOT NULL,
  letter TEXT NOT NULL, -- correct letters, sorted, e.g. 'ad'
  current TEXT,
  comment TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  client_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | rejected
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  UNIQUE (cat, n, client_id)
);
CREATE INDEX IF NOT EXISTS suggestions_status ON suggestions (status, cat, n);
CREATE INDEX IF NOT EXISTS suggestions_ip ON suggestions (ip_hash, created_at);
