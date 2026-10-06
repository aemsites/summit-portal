CREATE TABLE booth_activity (
  event_id TEXT PRIMARY KEY NOT NULL,
  flow_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'search', 'report_selected', 'report_viewed', 'contact_requested', 'report_sent'
  )),
  report_path TEXT,
  company TEXT,
  report_label TEXT,
  notice_version TEXT NOT NULL
);

CREATE INDEX booth_activity_chronology ON booth_activity (occurred_at DESC, event_id DESC);
CREATE INDEX booth_activity_expiry ON booth_activity (expires_at);
CREATE INDEX booth_activity_flow ON booth_activity (flow_id, occurred_at);
CREATE INDEX booth_activity_kind ON booth_activity (kind, occurred_at DESC);
