-- ============================================================
-- 7DS ORIGIN - SUPABASE DATABASE SCHEMA
-- Run this SQL in the Supabase SQL Editor to set up the database
-- ============================================================

-- ============================================================
-- 1. CHARACTERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS characters (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  rarity      TEXT DEFAULT 'SSR' CHECK (rarity IN ('SSR', 'SR')),
  description TEXT DEFAULT '',
  image       TEXT DEFAULT '',
  types       JSONB DEFAULT '[]'::jsonb,
  skills      JSONB DEFAULT '{}'::jsonb,
  potentials  JSONB DEFAULT '{}'::jsonb,
  costumes    JSONB DEFAULT '[]'::jsonb,
  tier        TEXT DEFAULT 'B' CHECK (tier IN ('S', 'A', 'B', 'C')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Index for fast slug lookups
CREATE INDEX IF NOT EXISTS idx_characters_slug ON characters (slug);

-- Index for tier list queries
CREATE INDEX IF NOT EXISTS idx_characters_tier ON characters (tier);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER characters_updated_at
  BEFORE UPDATE ON characters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 2. ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;

-- Everyone can READ characters (public website)
CREATE POLICY "Anyone can read characters"
  ON characters
  FOR SELECT
  USING (true);

-- Only authenticated users (admins) can INSERT
CREATE POLICY "Authenticated users can insert characters"
  ON characters
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only authenticated users (admins) can UPDATE
CREATE POLICY "Authenticated users can update characters"
  ON characters
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Only authenticated users (admins) can DELETE
CREATE POLICY "Authenticated users can delete characters"
  ON characters
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- 3. ENABLE REALTIME
-- ============================================================
-- Enable realtime for the characters table
ALTER PUBLICATION supabase_realtime ADD TABLE characters;

-- ============================================================
-- 4. STORAGE BUCKET FOR CHARACTER IMAGES
-- ============================================================
-- Run these in the SQL Editor:

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('character-images', 'character-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view images (public)
CREATE POLICY "Anyone can view character images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'character-images');

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload character images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'character-images');

-- Allow authenticated users to update images
CREATE POLICY "Authenticated users can update character images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'character-images');

-- Allow authenticated users to delete images
CREATE POLICY "Authenticated users can delete character images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'character-images');
