-- ============================================================
-- 7DS ORIGIN - EVENTS TABLE SCHEMA
-- Run this SQL in the Supabase SQL Editor to set up the events table
-- ============================================================

-- ============================================================
-- 1. EVENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  image       TEXT DEFAULT '',
  start_date  DATE,
  end_date    DATE,
  event_type  TEXT DEFAULT 'event' CHECK (event_type IN ('event', 'update', 'guide', 'maintenance')),
  status      TEXT DEFAULT 'active' CHECK (status IN ('active', 'upcoming', 'ended')),
  color       TEXT DEFAULT 'linear-gradient(90deg,#3b82f6,#60a5fa)',
  rewards     JSONB DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_events_status ON events (status);
CREATE INDEX IF NOT EXISTS idx_events_type ON events (event_type);
CREATE INDEX IF NOT EXISTS idx_events_start ON events (start_date DESC);

-- Auto-update updated_at timestamp
CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 2. ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Everyone can READ events (public website)
CREATE POLICY "Anyone can read events"
  ON events
  FOR SELECT
  USING (true);

-- Only authenticated users (admins) can INSERT
CREATE POLICY "Authenticated users can insert events"
  ON events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only authenticated users (admins) can UPDATE
CREATE POLICY "Authenticated users can update events"
  ON events
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Only authenticated users (admins) can DELETE
CREATE POLICY "Authenticated users can delete events"
  ON events
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- 3. ENABLE REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE events;
