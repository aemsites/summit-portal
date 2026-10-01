-- Durable customer report-request leads. Request IDs are internal-only:
-- visitors do not receive a support reference, while retry/idempotency and
-- internal auditing retain a stable key.
CREATE TABLE IF NOT EXISTS report_requests (
  request_id TEXT PRIMARY KEY NOT NULL,
  submitted_at TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  website TEXT NOT NULL,
  job_title TEXT,
  primary_market TEXT,
  consent_version TEXT NOT NULL,
  consented_at TEXT NOT NULL,
  search_text TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS report_requests_submitted_at
  ON report_requests (submitted_at DESC, request_id DESC);

CREATE INDEX IF NOT EXISTS report_requests_search_text
  ON report_requests (search_text);

CREATE TABLE IF NOT EXISTS report_request_idempotency (
  request_key_hash TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES report_requests (request_id)
);
