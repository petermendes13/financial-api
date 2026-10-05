ALTER TABLE users ADD COLUMN login TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;

CREATE UNIQUE INDEX idx_users_login ON users(login) WHERE login IS NOT NULL;