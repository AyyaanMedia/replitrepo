/*
  # Create lookup history and API usage tracking tables

  ## New Tables

  ### lookup_history
  Stores every WHOIS lookup result for 7-day history with date-wise CSV download.
  - id: unique row id
  - domain: the queried domain
  - status: found / not_found / error
  - expires_on: domain expiry date string
  - registrar: registrar name
  - registrant_name: registrant name
  - registrant_org: registrant organization
  - email: registrant email
  - session_id: groups lookups from one scan session
  - looked_up_at: timestamp of lookup

  ### api_usage
  Tracks APILayer credit consumption per day.
  - id: unique row id
  - used_at: date of usage (date only, one row per day per key_index)
  - key_index: which key (0-based) was used
  - credits_used: number of lookups charged to that key that day

  ## Security
  - RLS enabled on both tables
  - Public insert/select allowed (no auth in this app — tool is internal-use)
    using a service-role bypass pattern via anon key with permissive policies
    appropriate for a single-operator internal tool
*/

CREATE TABLE IF NOT EXISTS lookup_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL,
  status text NOT NULL,
  expires_on text,
  registrar text,
  registrant_name text,
  registrant_org text,
  email text,
  session_id text NOT NULL DEFAULT '',
  looked_up_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lookup_history_looked_up_at_idx ON lookup_history (looked_up_at DESC);
CREATE INDEX IF NOT EXISTS lookup_history_session_id_idx ON lookup_history (session_id);

ALTER TABLE lookup_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon insert to lookup_history"
  ON lookup_history FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon select from lookup_history"
  ON lookup_history FOR SELECT
  TO anon
  USING (true);

-- Auto-delete rows older than 7 days via a function + cron (handled in app layer)

CREATE TABLE IF NOT EXISTS api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  used_date date NOT NULL DEFAULT CURRENT_DATE,
  key_index integer NOT NULL DEFAULT 0,
  credits_used integer NOT NULL DEFAULT 0,
  UNIQUE (used_date, key_index)
);

CREATE INDEX IF NOT EXISTS api_usage_used_date_idx ON api_usage (used_date DESC);

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon insert to api_usage"
  ON api_usage FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon select from api_usage"
  ON api_usage FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon update to api_usage"
  ON api_usage FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
