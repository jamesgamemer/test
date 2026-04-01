-- ============================================================
-- 7DS ORIGIN - WEAPONS SYSTEM SCHEMA
-- Run this SQL in the Supabase SQL Editor to set up the
-- weapons database, junction table, indexes, RLS, and storage.
--
-- Prerequisites: characters table must already exist (schema.sql)
-- ============================================================


-- ============================================================
-- 1. WEAPONS TABLE
-- ============================================================
-- Core table storing all weapon data with bilingual support.
-- Designed for fast filtered queries and admin bulk editing.
-- ============================================================

CREATE TABLE IF NOT EXISTS weapons (
  -- ── Primary Key ──
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- ── Identity ──
  name_en         TEXT NOT NULL,
  name_th         TEXT DEFAULT '',
  slug            TEXT NOT NULL UNIQUE,
  series          TEXT DEFAULT '',

  -- ── Classification ──
  category        TEXT NOT NULL,
  playstyle       TEXT DEFAULT 'Striker',
  role            TEXT DEFAULT 'DPS',
  range           TEXT DEFAULT 'Melee' CHECK (range IN ('Melee', 'Ranged')),
  rarity          INTEGER DEFAULT 5 CHECK (rarity IN (3, 4, 5)),
  tier            TEXT DEFAULT 'B' CHECK (tier IN ('SS', 'S', 'A', 'B', 'C')),

  -- ── Stats ──
  equipment_atk   INTEGER DEFAULT 0,
  sub_stat_type   TEXT DEFAULT '',
  sub_stat_value  TEXT DEFAULT '',
  stats_by_level  JSONB DEFAULT '{}'::jsonb,

  -- ── Passive Ability (Bilingual) ──
  passive_name_en TEXT DEFAULT '',
  passive_name_th TEXT DEFAULT '',
  passive_desc_en TEXT DEFAULT '',
  passive_desc_th TEXT DEFAULT '',

  -- ── Lore (Bilingual) ──
  lore_en         TEXT DEFAULT '',
  lore_th         TEXT DEFAULT '',

  -- ── Media ──
  icon_url        TEXT DEFAULT '',
  image_url       TEXT DEFAULT '',

  -- ── Acquisition ──
  source          TEXT DEFAULT 'Gacha',

  -- ── Timestamps ──
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Add table comment for documentation
COMMENT ON TABLE weapons IS 'Stores all weapon data for the 7DS Origin database with bilingual EN/TH support';
COMMENT ON COLUMN weapons.series IS 'Weapon set/series name (e.g., Black Flame Wings, Eternal Grace)';
COMMENT ON COLUMN weapons.category IS 'Weapon type: Axe, Cudgel, Dual Swords, Gauntlets, Greatsword, Grimoire, Lance, Longsword, Rapier, Staff, Sword & Shield, Wand';
COMMENT ON COLUMN weapons.playstyle IS 'Combat playstyle: Striker, Assassin, Brawler, Caster, Fencer, Guardian, Lancer, Swordsman';
COMMENT ON COLUMN weapons.role IS 'Combat role: DPS, Support, Healer, Tank';
COMMENT ON COLUMN weapons.stats_by_level IS 'JSON object with level-keyed stats, e.g. {"1":{"atk":44},"60":{"atk":510}}';
COMMENT ON COLUMN weapons.icon_url IS 'Small icon image URL (used in lists and cards)';
COMMENT ON COLUMN weapons.image_url IS 'Full-size artwork URL (used in detail page)';


-- ============================================================
-- 2. WEAPONS INDEXES
-- ============================================================
-- Optimized for the most common query patterns:
--   - Listing page: filter by category, rarity, role, range + sort
--   - Detail page: lookup by slug
--   - Admin: search by name, filter by series
--   - Tier list: filter by tier
-- ============================================================

-- Primary lookup: slug (unique, already indexed by UNIQUE constraint)
CREATE INDEX IF NOT EXISTS idx_weapons_slug
  ON weapons (slug);

-- Filter indexes: most common filter combinations
CREATE INDEX IF NOT EXISTS idx_weapons_category
  ON weapons (category);

CREATE INDEX IF NOT EXISTS idx_weapons_rarity
  ON weapons (rarity);

CREATE INDEX IF NOT EXISTS idx_weapons_role
  ON weapons (role);

CREATE INDEX IF NOT EXISTS idx_weapons_range
  ON weapons (range);

CREATE INDEX IF NOT EXISTS idx_weapons_tier
  ON weapons (tier);

CREATE INDEX IF NOT EXISTS idx_weapons_series
  ON weapons (series);

-- Composite index for the most common listing query:
-- "Show all 5-star Longswords sorted by ATK"
CREATE INDEX IF NOT EXISTS idx_weapons_category_rarity
  ON weapons (category, rarity);

-- Composite index for role-based filtering:
-- "Show all DPS Melee weapons"
CREATE INDEX IF NOT EXISTS idx_weapons_role_range
  ON weapons (role, range);

-- Enable the pg_trgm extension (required for trigram text search index)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Text search: fast LIKE/ILIKE queries on weapon names
CREATE INDEX IF NOT EXISTS idx_weapons_name_en_trgm
  ON weapons USING gin (name_en gin_trgm_ops);

-- Sort optimization: frequently sorted columns
CREATE INDEX IF NOT EXISTS idx_weapons_equipment_atk
  ON weapons (equipment_atk DESC);

CREATE INDEX IF NOT EXISTS idx_weapons_created_at
  ON weapons (created_at DESC);


-- ============================================================
-- 3. WEAPON_CHARACTERS JUNCTION TABLE
-- ============================================================
-- Links weapons to characters with priority ranking.
-- Supports bidirectional queries:
--   - "Which characters use this weapon?" (weapon detail page)
--   - "Which weapons are recommended for this character?" (character page)
-- ============================================================

CREATE TABLE IF NOT EXISTS weapon_characters (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  weapon_id       UUID NOT NULL REFERENCES weapons(id) ON DELETE CASCADE,
  character_id    UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  priority        INTEGER DEFAULT 0,
  is_signature    BOOLEAN DEFAULT false,
  notes_en        TEXT DEFAULT '',
  notes_th        TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT now(),

  -- Prevent duplicate weapon-character pairs
  CONSTRAINT uq_weapon_character UNIQUE (weapon_id, character_id)
);

COMMENT ON TABLE weapon_characters IS 'Junction table linking weapons to recommended characters with priority ranking';
COMMENT ON COLUMN weapon_characters.priority IS 'Ranking order: 1 = Best-in-Slot, 2 = Alternative, 3 = Budget option, etc.';
COMMENT ON COLUMN weapon_characters.is_signature IS 'True if this is the character''s signature/named weapon';
COMMENT ON COLUMN weapon_characters.notes_en IS 'English note explaining why this weapon suits the character';
COMMENT ON COLUMN weapon_characters.notes_th IS 'Thai translation of the note';

-- Junction table indexes for fast bidirectional lookups
CREATE INDEX IF NOT EXISTS idx_wc_weapon_id
  ON weapon_characters (weapon_id);

CREATE INDEX IF NOT EXISTS idx_wc_character_id
  ON weapon_characters (character_id);

-- Composite index for "get all characters for a weapon, sorted by priority"
CREATE INDEX IF NOT EXISTS idx_wc_weapon_priority
  ON weapon_characters (weapon_id, priority ASC);

-- Composite index for "get all weapons for a character, sorted by priority"
CREATE INDEX IF NOT EXISTS idx_wc_character_priority
  ON weapon_characters (character_id, priority ASC);

-- Index for signature weapon lookups
CREATE INDEX IF NOT EXISTS idx_wc_signature
  ON weapon_characters (is_signature) WHERE is_signature = true;


-- ============================================================
-- 4. AUTO-UPDATE TRIGGERS
-- ============================================================
-- Reuse the existing update_updated_at() function from schema.sql
-- If it doesn't exist yet, create it (idempotent).
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER weapons_updated_at
  BEFORE UPDATE ON weapons
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Follows the same pattern as characters and guides:
--   - Public: SELECT (read-only)
--   - Authenticated: INSERT, UPDATE, DELETE (admin only)
-- ============================================================

-- ── Weapons Table RLS ──
ALTER TABLE weapons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read weapons"
  ON weapons
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert weapons"
  ON weapons
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update weapons"
  ON weapons
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete weapons"
  ON weapons
  FOR DELETE
  TO authenticated
  USING (true);

-- ── Weapon_Characters Table RLS ──
ALTER TABLE weapon_characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read weapon_characters"
  ON weapon_characters
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert weapon_characters"
  ON weapon_characters
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update weapon_characters"
  ON weapon_characters
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete weapon_characters"
  ON weapon_characters
  FOR DELETE
  TO authenticated
  USING (true);


-- ============================================================
-- 6. ENABLE REALTIME
-- ============================================================
-- Allow frontend to subscribe to weapon changes for live updates
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE weapons;
ALTER PUBLICATION supabase_realtime ADD TABLE weapon_characters;


-- ============================================================
-- 7. STORAGE BUCKET FOR WEAPON IMAGES
-- ============================================================
-- Separate bucket for weapon icons and artwork
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('weapon-images', 'weapon-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view weapon images (public)
CREATE POLICY "Anyone can view weapon images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'weapon-images');

-- Allow authenticated users to upload weapon images
CREATE POLICY "Authenticated users can upload weapon images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'weapon-images');

-- Allow authenticated users to update weapon images
CREATE POLICY "Authenticated users can update weapon images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'weapon-images');

-- Allow authenticated users to delete weapon images
CREATE POLICY "Authenticated users can delete weapon images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'weapon-images');


-- ============================================================
-- 8. HELPER VIEWS (Optional but recommended)
-- ============================================================
-- Pre-built views for common complex queries to simplify
-- frontend JavaScript and improve maintainability.
-- ============================================================

-- View: Weapons with their recommended character count
CREATE OR REPLACE VIEW weapons_with_char_count AS
SELECT
  w.*,
  COALESCE(wc.char_count, 0) AS recommended_character_count
FROM weapons w
LEFT JOIN (
  SELECT weapon_id, COUNT(*) AS char_count
  FROM weapon_characters
  GROUP BY weapon_id
) wc ON w.id = wc.weapon_id;

-- View: Full weapon-character relationships with names
CREATE OR REPLACE VIEW weapon_character_details AS
SELECT
  wc.id AS link_id,
  wc.priority,
  wc.is_signature,
  wc.notes_en,
  wc.notes_th,
  w.id AS weapon_id,
  w.name_en AS weapon_name,
  w.slug AS weapon_slug,
  w.icon_url AS weapon_icon,
  w.category AS weapon_category,
  w.rarity AS weapon_rarity,
  c.id AS character_id,
  c.name AS character_name,
  c.slug AS character_slug,
  c.image AS character_image,
  c.rarity AS character_rarity
FROM weapon_characters wc
JOIN weapons w ON wc.weapon_id = w.id
JOIN characters c ON wc.character_id = c.id
ORDER BY wc.priority ASC;


-- ============================================================
-- 9. SEED DATA FUNCTION (Optional)
-- ============================================================
-- Helper function for bulk importing weapons from JSON.
-- Can be called from the admin dashboard or a sync script.
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_weapon(
  p_name_en TEXT,
  p_slug TEXT,
  p_series TEXT DEFAULT '',
  p_category TEXT DEFAULT '',
  p_playstyle TEXT DEFAULT 'Striker',
  p_role TEXT DEFAULT 'DPS',
  p_range TEXT DEFAULT 'Melee',
  p_rarity INTEGER DEFAULT 5,
  p_equipment_atk INTEGER DEFAULT 0,
  p_sub_stat_type TEXT DEFAULT '',
  p_sub_stat_value TEXT DEFAULT '',
  p_passive_desc_en TEXT DEFAULT '',
  p_icon_url TEXT DEFAULT '',
  p_source TEXT DEFAULT 'Gacha'
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO weapons (
    name_en, slug, series, category, playstyle, role, range, rarity,
    equipment_atk, sub_stat_type, sub_stat_value, passive_desc_en,
    icon_url, source
  ) VALUES (
    p_name_en, p_slug, p_series, p_category, p_playstyle, p_role, p_range, p_rarity,
    p_equipment_atk, p_sub_stat_type, p_sub_stat_value, p_passive_desc_en,
    p_icon_url, p_source
  )
  ON CONFLICT (slug) DO UPDATE SET
    name_en = EXCLUDED.name_en,
    series = EXCLUDED.series,
    category = EXCLUDED.category,
    playstyle = EXCLUDED.playstyle,
    role = EXCLUDED.role,
    range = EXCLUDED.range,
    rarity = EXCLUDED.rarity,
    equipment_atk = EXCLUDED.equipment_atk,
    sub_stat_type = EXCLUDED.sub_stat_type,
    sub_stat_value = EXCLUDED.sub_stat_value,
    passive_desc_en = EXCLUDED.passive_desc_en,
    icon_url = EXCLUDED.icon_url,
    source = EXCLUDED.source,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
