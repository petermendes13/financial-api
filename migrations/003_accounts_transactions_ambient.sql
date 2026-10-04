ALTER TABLE transactions RENAME TO transactions_with_user;
ALTER TABLE accounts RENAME TO accounts_with_user;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash', 'checking', 'savings', 'credit_card', 'investment', 'other')),
  currency TEXT NOT NULL DEFAULT 'BRL',
  opening_balance_cents INTEGER NOT NULL DEFAULT 0,
  ambient_id TEXT REFERENCES ambient(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO accounts (id, name, type, currency, opening_balance_cents, ambient_id, active, created_at, updated_at)
SELECT accounts_with_user.id, accounts_with_user.name, accounts_with_user.type, accounts_with_user.currency,
       accounts_with_user.opening_balance_cents, users.ambient_id, accounts_with_user.active,
       accounts_with_user.created_at, accounts_with_user.updated_at
FROM accounts_with_user
LEFT JOIN users ON users.id = accounts_with_user.user_id;

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer_in', 'transfer_out')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  category TEXT,
  ambient_id TEXT REFERENCES ambient(id),
  description TEXT,
  occurred_on TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

INSERT INTO transactions (id, account_id, type, amount_cents, category, ambient_id, description, occurred_on, metadata_json, created_at)
SELECT transactions_with_user.id, transactions_with_user.account_id, transactions_with_user.type,
       transactions_with_user.amount_cents, transactions_with_user.category, users.ambient_id,
       transactions_with_user.description, transactions_with_user.occurred_on,
       transactions_with_user.metadata_json, transactions_with_user.created_at
FROM transactions_with_user
LEFT JOIN users ON users.id = transactions_with_user.user_id;

DROP TABLE transactions_with_user;
DROP TABLE accounts_with_user;

CREATE INDEX idx_transactions_account_date ON transactions(account_id, occurred_on);
CREATE INDEX idx_transactions_type_date ON transactions(type, occurred_on);
CREATE INDEX idx_transactions_category_date ON transactions(category, occurred_on);