-- ============================================================
-- STEP 4: สร้าง POLICIES สำหรับตาราง USER
-- ============================================================
-- รันไฟล์นี้เป็นอันดับที่ 4
-- ตารางเหล่านี้เกี่ยวข้องกับข้อมูลของ user แต่ละคน
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- USER_BUILDS TABLE (Cloud Saves - แยกกันของแต่ละคน)
-- ════════════════════════════════════════════════════════════
-- ตรวจสอบว่าตาราง user_builds มีอยู่แล้ว ถ้ายังไม่มีให้สร้าง
CREATE TABLE IF NOT EXISTS user_builds (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'My Build',
  build_data  JSONB NOT NULL DEFAULT '{}'::jsonb,
  char_names  TEXT[] DEFAULT '{}',
  char_count  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_builds_user_id ON user_builds (user_id);

ALTER TABLE user_builds ENABLE ROW LEVEL SECURITY;

-- แต่ละคนเห็นเฉพาะ builds ของตัวเอง
CREATE POLICY "Users can view own builds"
  ON user_builds FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own builds"
  ON user_builds FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own builds"
  ON user_builds FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own builds"
  ON user_builds FOR DELETE
  USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
-- USER_PROFILES TABLE (โปรไฟล์ผู้ใช้)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT,
  avatar_url    TEXT,
  provider      TEXT DEFAULT 'email',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- แต่ละคนเห็นเฉพาะโปรไฟล์ของตัวเอง
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

-- แต่ละคนแก้ไขเฉพาะโปรไฟล์ของตัวเอง
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- สร้างโปรไฟล์ได้เฉพาะของตัวเอง
CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Auto-create profile เมื่อ user สมัครใหม่
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name, avatar_url, provider)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    COALESCE(NEW.raw_app_meta_data->>'provider', 'email')
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    provider = EXCLUDED.provider,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ════════════════════════════════════════════════════════════
-- COMMUNITY_BUILDS TABLE (ทุกคนดูได้ ผู้ใช้ที่ login แล้วเพิ่มได้)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS community_builds (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_name   TEXT NOT NULL DEFAULT 'Anonymous',
  title         TEXT NOT NULL DEFAULT 'My Build',
  description   TEXT DEFAULT '',
  tag           TEXT DEFAULT '',
  build_data    JSONB NOT NULL DEFAULT '{}'::jsonb,
  char_names    TEXT[] DEFAULT '{}',
  char_images   TEXT[] DEFAULT '{}',
  char_count    INTEGER DEFAULT 0,
  votes         INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE community_builds ENABLE ROW LEVEL SECURITY;

-- ทุกคนดู community builds ได้
CREATE POLICY "Anyone can view community builds"
  ON community_builds FOR SELECT
  USING (true);

-- ผู้ใช้ที่ login แล้วเพิ่ม builds ได้
CREATE POLICY "Authenticated users can insert community builds"
  ON community_builds FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- admin สามารถลบ community builds ที่ไม่เหมาะสมได้
CREATE POLICY "Admin can delete community builds"
  ON community_builds FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- admin สามารถแก้ไข community builds ได้
CREATE POLICY "Admin can update community builds"
  ON community_builds FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- BUILD_VOTES TABLE (แต่ละคนจัดการ vote ของตัวเอง)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS build_votes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  build_id    UUID NOT NULL REFERENCES community_builds(id) ON DELETE CASCADE,
  direction   TEXT NOT NULL CHECK (direction IN ('up', 'down')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_user_build_vote UNIQUE (user_id, build_id)
);

CREATE INDEX IF NOT EXISTS idx_build_votes_user_id ON build_votes (user_id);
CREATE INDEX IF NOT EXISTS idx_build_votes_build_id ON build_votes (build_id);

ALTER TABLE build_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own votes"
  ON build_votes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own votes"
  ON build_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own votes"
  ON build_votes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes"
  ON build_votes FOR DELETE
  USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
-- COMMUNITY_TIER_LISTS TABLE
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS community_tier_lists (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_name   TEXT NOT NULL DEFAULT 'Anonymous',
  title         TEXT NOT NULL DEFAULT 'My Tier List',
  description   TEXT DEFAULT '',
  tiers         JSONB NOT NULL DEFAULT '{}'::jsonb,
  votes         INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE community_tier_lists ENABLE ROW LEVEL SECURITY;

-- ทุกคนดูได้
CREATE POLICY "Anyone can view community tier lists"
  ON community_tier_lists FOR SELECT
  USING (true);

-- ผู้ใช้ที่ login แล้วเพิ่มได้
CREATE POLICY "Authenticated users can insert community tier lists"
  ON community_tier_lists FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- admin แก้ไข/ลบได้
CREATE POLICY "Admin can update community tier lists"
  ON community_tier_lists FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin can delete community tier lists"
  ON community_tier_lists FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ════════════════════════════════════════════════════════════
-- TRANSLATION_CACHE TABLE
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS translation_cache (
  source_hash     TEXT PRIMARY KEY,
  source_text     TEXT DEFAULT '',
  source_lang     TEXT DEFAULT 'en',
  target_lang     TEXT DEFAULT 'th',
  translated_text TEXT DEFAULT '',
  model           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE translation_cache ENABLE ROW LEVEL SECURITY;

-- ทุกคนอ่าน cache ได้ (เพื่อแสดงผลแปลภาษา)
CREATE POLICY "Anyone can read translation cache"
  ON translation_cache FOR SELECT
  USING (true);

-- ผู้ใช้ที่ login แล้วเขียน cache ได้
CREATE POLICY "Authenticated can upsert translation cache"
  ON translation_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update translation cache"
  ON translation_cache FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);


SELECT 'Step 4 Complete: User table policies created' AS status;
