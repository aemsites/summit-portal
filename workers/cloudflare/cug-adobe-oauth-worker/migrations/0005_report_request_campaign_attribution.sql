-- Requests can arrive before the private mapping, so there is no foreign key.
ALTER TABLE report_requests ADD COLUMN public_campaign_id TEXT;

CREATE TABLE report_request_campaigns (
  public_campaign_id TEXT PRIMARY KEY NOT NULL,
  hub_campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL
);
