-- Mantemos IDs em texto UUID e valores monetários em centavos inteiros.
-- Isso evita problemas de arredondamento e facilita a migração para PostgreSQL.

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash', 'checking', 'savings', 'credit_card', 'investment', 'other')),
  currency TEXT NOT NULL DEFAULT 'BRL',
  opening_balance_cents INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer_in', 'transfer_out')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  category TEXT,
  description TEXT,
  occurred_on TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_account_date
  ON transactions(account_id, occurred_on);

CREATE INDEX IF NOT EXISTS idx_transactions_type_date
  ON transactions(type, occurred_on);

CREATE INDEX IF NOT EXISTS idx_transactions_category_date
  ON transactions(category, occurred_on);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
