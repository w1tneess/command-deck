-- Failed PIN attempts, for lockout. Rows older than an hour are pruned on each login attempt.
CREATE TABLE login_attempts (ip TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX login_attempts_ip_ts ON login_attempts(ip, ts);
-- Bumping session_version signs out every device at once.
CREATE TABLE auth_state (id INTEGER PRIMARY KEY CHECK (id = 1), session_version INTEGER NOT NULL);
INSERT INTO auth_state (id, session_version) VALUES (1, 1);
