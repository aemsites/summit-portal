CREATE TABLE booth_activity_next (
  event_id TEXT PRIMARY KEY NOT NULL,
  flow_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'search', 'no_report', 'demo_selected', 'demo_viewed',
    'report_selected', 'report_viewed', 'contact_requested', 'report_sent'
  )),
  report_path TEXT,
  company TEXT,
  report_label TEXT,
  notice_version TEXT NOT NULL
);

INSERT INTO booth_activity_next SELECT * FROM booth_activity;
DROP TABLE booth_activity;
ALTER TABLE booth_activity_next RENAME TO booth_activity;

CREATE INDEX booth_activity_chronology ON booth_activity (occurred_at DESC, event_id DESC);
CREATE INDEX booth_activity_expiry ON booth_activity (expires_at);
CREATE INDEX booth_activity_flow ON booth_activity (flow_id, occurred_at);
CREATE INDEX booth_activity_kind ON booth_activity (kind, occurred_at DESC);
