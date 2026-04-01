-- ============================================================
-- 7DS ORIGIN - ADD COSTUMES & MATERIALS FIELDS
-- Migration: Add 'materials' column to characters table
-- NOTE: 'costumes' column already exists as JSONB DEFAULT '[]'
-- ============================================================

-- 1. Add 'materials' column (JSON array of material objects)
-- Structure: [{"name": "Vivid Wild Token", "image": "url"}, ...]
ALTER TABLE characters
ADD COLUMN IF NOT EXISTS materials JSONB DEFAULT '[]'::jsonb;

-- 2. Ensure costumes column supports the new richer structure
-- Old format: ["name1", "name2"] or [{"name": "x"}]
-- New format: [{"name": "x", "image": "url", "description": "text"}, ...]
-- No schema change needed — JSONB is flexible. Backward compatible.

-- 3. Create storage bucket for costume images (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('costume-images', 'costume-images', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage policies for costume-images bucket
CREATE POLICY "Anyone can view costume images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'costume-images');

CREATE POLICY "Authenticated users can upload costume images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'costume-images');

CREATE POLICY "Authenticated users can update costume images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'costume-images');

CREATE POLICY "Authenticated users can delete costume images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'costume-images');

-- 5. Create storage bucket for material images (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('material-images', 'material-images', true)
ON CONFLICT (id) DO NOTHING;

-- 6. Storage policies for material-images bucket
CREATE POLICY "Anyone can view material images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'material-images');

CREATE POLICY "Authenticated users can upload material images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'material-images');

CREATE POLICY "Authenticated users can update material images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'material-images');

CREATE POLICY "Authenticated users can delete material images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'material-images');
