-- ============================================================
-- 7DS ORIGIN - GUIDE CMS SCHEMA
-- Run this SQL in the Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. GUIDES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS guides (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  cover_image TEXT DEFAULT '',
  category    TEXT DEFAULT 'general',
  status      TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guides_slug ON guides (slug);
CREATE INDEX IF NOT EXISTS idx_guides_category ON guides (category);
CREATE INDEX IF NOT EXISTS idx_guides_status ON guides (status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_guides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guides_updated_at
  BEFORE UPDATE ON guides
  FOR EACH ROW
  EXECUTE FUNCTION update_guides_updated_at();

-- ============================================================
-- 2. GUIDE_BLOCKS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS guide_blocks (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  guide_id    UUID NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  content     JSONB DEFAULT '{}'::jsonb,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guide_blocks_guide_id ON guide_blocks (guide_id);
CREATE INDEX IF NOT EXISTS idx_guide_blocks_position ON guide_blocks (guide_id, position);

-- ============================================================
-- 3. MEDIA TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS media (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url         TEXT NOT NULL,
  type        TEXT DEFAULT 'image' CHECK (type IN ('image', 'video')),
  filename    TEXT DEFAULT '',
  guide_id    UUID REFERENCES guides(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_guide_id ON media (guide_id);

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;

-- GUIDES: Anyone can read published guides
CREATE POLICY "Anyone can read published guides"
  ON guides FOR SELECT USING (status = 'published');

-- GUIDES: Authenticated users can read all guides (including drafts)
CREATE POLICY "Authenticated can read all guides"
  ON guides FOR SELECT TO authenticated USING (true);

-- GUIDES: Authenticated users can insert
CREATE POLICY "Authenticated can insert guides"
  ON guides FOR INSERT TO authenticated WITH CHECK (true);

-- GUIDES: Authenticated users can update
CREATE POLICY "Authenticated can update guides"
  ON guides FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- GUIDES: Authenticated users can delete
CREATE POLICY "Authenticated can delete guides"
  ON guides FOR DELETE TO authenticated USING (true);

-- GUIDE_BLOCKS: Anyone can read blocks of published guides
CREATE POLICY "Anyone can read guide blocks"
  ON guide_blocks FOR SELECT USING (true);

-- GUIDE_BLOCKS: Authenticated users can manage blocks
CREATE POLICY "Authenticated can insert guide blocks"
  ON guide_blocks FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update guide blocks"
  ON guide_blocks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete guide blocks"
  ON guide_blocks FOR DELETE TO authenticated USING (true);

-- MEDIA: Anyone can read
CREATE POLICY "Anyone can read media"
  ON media FOR SELECT USING (true);

-- MEDIA: Authenticated users can manage
CREATE POLICY "Authenticated can insert media"
  ON media FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update media"
  ON media FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete media"
  ON media FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 5. STORAGE BUCKET FOR GUIDE MEDIA
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('guide-media', 'guide-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view guide media
CREATE POLICY "Anyone can view guide media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'guide-media');

-- Allow authenticated users to upload guide media
CREATE POLICY "Authenticated can upload guide media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'guide-media');

-- Allow authenticated users to update guide media
CREATE POLICY "Authenticated can update guide media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'guide-media');

-- Allow authenticated users to delete guide media
CREATE POLICY "Authenticated can delete guide media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'guide-media');
