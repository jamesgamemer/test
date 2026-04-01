-- ============================================================
-- STEP 1: ลบ POLICIES เก่าที่อาจมีปัญหา
-- ============================================================
-- รันไฟล์นี้ก่อนเป็นอันดับแรก
-- จะลบ policies เก่าออกทั้งหมดเพื่อสร้างใหม่ให้ถูกต้อง
-- ใช้ DO block เพื่อเช็คว่าตารางมีอยู่ก่อนจึงลบ policy
-- ============================================================

DO $$
DECLARE
  _tbl TEXT;
  _pol TEXT;
BEGIN

  -- ── characters ──
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='characters') THEN
    DROP POLICY IF EXISTS "Anyone can read characters" ON characters;
    DROP POLICY IF EXISTS "Authenticated users can insert characters" ON characters;
    DROP POLICY IF EXISTS "Authenticated users can update characters" ON characters;
    DROP POLICY IF EXISTS "Authenticated users can delete characters" ON characters;
    DROP POLICY IF EXISTS "Only admin can insert characters" ON characters;
    DROP POLICY IF EXISTS "Only admin can update characters" ON characters;
    DROP POLICY IF EXISTS "Only admin can delete characters" ON characters;
    RAISE NOTICE 'Cleaned policies for: characters';
  END IF;

  -- ── events ──
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='events') THEN
    DROP POLICY IF EXISTS "Anyone can read events" ON events;
    DROP POLICY IF EXISTS "Authenticated users can insert events" ON events;
    DROP POLICY IF EXISTS "Authenticated users can update events" ON events;
    DROP POLICY IF EXISTS "Authenticated users can delete events" ON events;
    DROP POLICY IF EXISTS "Only admin can insert events" ON events;
    DROP POLICY IF EXISTS "Only admin can update events" ON events;
    DROP POLICY IF EXISTS "Only admin can delete events" ON events;
    RAISE NOTICE 'Cleaned policies for: events';
  END IF;

  -- ── guides ──
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='guides') THEN
    DROP POLICY IF EXISTS "Anyone can read published guides" ON guides;
    DROP POLICY IF EXISTS "Authenticated can read all guides" ON guides;
    DROP POLICY IF EXISTS "Admin can read all guides" ON guides;
    DROP POLICY IF EXISTS "Authenticated can insert guides" ON guides;
    DROP POLICY IF EXISTS "Authenticated can update guides" ON guides;
    DROP POLICY IF EXISTS "Authenticated can delete guides" ON guides;
    DROP POLICY IF EXISTS "Only admin can insert guides" ON guides;
    DROP POLICY IF EXISTS "Only admin can update guides" ON guides;
    DROP POLICY IF EXISTS "Only admin can delete guides" ON guides;
    RAISE NOTICE 'Cleaned policies for: guides';
  END IF;

  -- ── guide_blocks ──
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='guide_blocks') THEN
    DROP POLICY IF EXISTS "Anyone can read guide blocks" ON guide_blocks;
    DROP POLICY IF EXISTS "Authenticated can insert guide blocks" ON guide_blocks;
    DROP POLICY IF EXISTS "Authenticated can update guide blocks" ON guide_blocks;
    DROP POLICY IF EXISTS "Authenticated can delete guide blocks" ON guide_blocks;
    DROP POLICY IF EXISTS "Only admin can insert guide blocks" ON guide_blocks;
    DROP POLICY IF EXISTS "Only admin can update guide blocks" ON guide_blocks;
    DROP POLICY IF EXISTS "Only admin can delete guide blocks" ON guide_blocks;
    RAISE NOTICE 'Cleaned policies for: guide_blocks';
  END IF;

  -- ── media ──
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='media') THEN
    DROP POLICY IF EXISTS "Anyone can read media" ON media;
    DROP POLICY IF EXISTS "Authenticated can insert media" ON media;
    DROP POLICY IF EXISTS "Authenticated can update media" ON media;
    DROP POLICY IF EXISTS "Authenticated can delete media" ON media;
    DROP POLICY IF EXISTS "Only admin can insert media" ON media;
    DROP POLICY IF EXISTS "Only admin can update media" ON media;
    DROP POLICY IF EXISTS "Only admin can delete media" ON media;
    RAISE NOTICE 'Cleaned policies for: media';
  END IF;

  -- ── weapons ──
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='weapons') THEN
    DROP POLICY IF EXISTS "Anyone can read weapons" ON weapons;
    DROP POLICY IF EXISTS "Authenticated users can insert weapons" ON weapons;
    DROP POLICY IF EXISTS "Authenticated users can update weapons" ON weapons;
    DROP POLICY IF EXISTS "Authenticated users can delete weapons" ON weapons;
    DROP POLICY IF EXISTS "Only admin can insert weapons" ON weapons;
    DROP POLICY IF EXISTS "Only admin can update weapons" ON weapons;
    DROP POLICY IF EXISTS "Only admin can delete weapons" ON weapons;
    RAISE NOTICE 'Cleaned policies for: weapons';
  END IF;

  -- ── weapon_characters ──
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='weapon_characters') THEN
    DROP POLICY IF EXISTS "Anyone can read weapon_characters" ON weapon_characters;
    DROP POLICY IF EXISTS "Authenticated users can insert weapon_characters" ON weapon_characters;
    DROP POLICY IF EXISTS "Authenticated users can update weapon_characters" ON weapon_characters;
    DROP POLICY IF EXISTS "Authenticated users can delete weapon_characters" ON weapon_characters;
    DROP POLICY IF EXISTS "Only admin can insert weapon_characters" ON weapon_characters;
    DROP POLICY IF EXISTS "Only admin can update weapon_characters" ON weapon_characters;
    DROP POLICY IF EXISTS "Only admin can delete weapon_characters" ON weapon_characters;
    RAISE NOTICE 'Cleaned policies for: weapon_characters';
  END IF;

  -- ── user_builds ──
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_builds') THEN
    DROP POLICY IF EXISTS "Users can view own builds" ON user_builds;
    DROP POLICY IF EXISTS "Users can insert own builds" ON user_builds;
    DROP POLICY IF EXISTS "Users can update own builds" ON user_builds;
    DROP POLICY IF EXISTS "Users can delete own builds" ON user_builds;
    RAISE NOTICE 'Cleaned policies for: user_builds';
  END IF;

  -- ── user_profiles ──
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_profiles') THEN
    DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
    DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
    DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
    RAISE NOTICE 'Cleaned policies for: user_profiles';
  END IF;

  -- ── community_builds ──
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='community_builds') THEN
    DROP POLICY IF EXISTS "Anyone can view community builds" ON community_builds;
    DROP POLICY IF EXISTS "Authenticated users can insert community builds" ON community_builds;
    DROP POLICY IF EXISTS "Admin can delete community builds" ON community_builds;
    DROP POLICY IF EXISTS "Admin can update community builds" ON community_builds;
    RAISE NOTICE 'Cleaned policies for: community_builds';
  END IF;

  -- ── build_votes ──
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='build_votes') THEN
    DROP POLICY IF EXISTS "Users can view own votes" ON build_votes;
    DROP POLICY IF EXISTS "Users can insert own votes" ON build_votes;
    DROP POLICY IF EXISTS "Users can update own votes" ON build_votes;
    DROP POLICY IF EXISTS "Users can delete own votes" ON build_votes;
    RAISE NOTICE 'Cleaned policies for: build_votes';
  END IF;

  -- ── community_tier_lists ──
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='community_tier_lists') THEN
    DROP POLICY IF EXISTS "Anyone can view community tier lists" ON community_tier_lists;
    DROP POLICY IF EXISTS "Authenticated users can insert community tier lists" ON community_tier_lists;
    DROP POLICY IF EXISTS "Authenticated users can update community tier lists" ON community_tier_lists;
    DROP POLICY IF EXISTS "Admin can update community tier lists" ON community_tier_lists;
    DROP POLICY IF EXISTS "Admin can delete community tier lists" ON community_tier_lists;
    RAISE NOTICE 'Cleaned policies for: community_tier_lists';
  ELSE
    RAISE NOTICE 'Skipped: community_tier_lists (table does not exist)';
  END IF;

  -- ── translation_cache ──
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='translation_cache') THEN
    DROP POLICY IF EXISTS "Anyone can read translation cache" ON translation_cache;
    DROP POLICY IF EXISTS "Authenticated can read translation cache" ON translation_cache;
    DROP POLICY IF EXISTS "Authenticated can insert translation cache" ON translation_cache;
    DROP POLICY IF EXISTS "Authenticated can upsert translation cache" ON translation_cache;
    DROP POLICY IF EXISTS "Authenticated can update translation cache" ON translation_cache;
    RAISE NOTICE 'Cleaned policies for: translation_cache';
  ELSE
    RAISE NOTICE 'Skipped: translation_cache (table does not exist)';
  END IF;

END $$;

SELECT 'Step 1 Complete: Old policies removed (tables that do not exist were skipped)' AS status;
