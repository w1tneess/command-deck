-- Email + password sign-in. Passwords are stored only as PBKDF2 hashes. Neither table is part of a backup file.
CREATE TABLE IF NOT EXISTS credentials (
  email TEXT PRIMARY KEY,
  pw_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- One live one-time code per address. Only a keyed hash of the code is kept.
CREATE TABLE IF NOT EXISTS email_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  sent_at INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0
);
