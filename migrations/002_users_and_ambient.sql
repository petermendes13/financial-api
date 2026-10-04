ALTER TABLE painel RENAME TO users;
ALTER TABLE accounts RENAME COLUMN painel_id TO user_id;
ALTER TABLE transactions RENAME COLUMN painel_id TO user_id;

CREATE TABLE ambient (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('standart', 'vip', 'pro', 'premium')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  datepayment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO ambient (id, name, type, active, created_at, updated_at)
SELECT id, name, type, active, created_at, updated_at FROM users;

ALTER TABLE users ADD COLUMN ambient_id TEXT REFERENCES ambient(id);
UPDATE users SET ambient_id = id;
ALTER TABLE users DROP COLUMN type;
ALTER TABLE users DROP COLUMN active;

CREATE INDEX idx_users_ambient_id ON users(ambient_id);