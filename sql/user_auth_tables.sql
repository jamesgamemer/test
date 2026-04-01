-- ============================================================
-- 7DS ORIGIN - User Authentication & Personal Builds
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── User Profiles (synced from Supabase Auth) ──
-- Automatically populated via trigger when a user signs up
CREATE TABLE IF NOT EXISTS user_profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT DEFAULT '',
  avatar_url   TEXT DEFAULT '',
  provider     TEXT DEFAULT 'email',   -- 'email', 'google', 'discord', 'github'
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read profiles
CREATE POLICY "Anyone can read profiles"
  ON user_profiles FOR SELECT USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ── Auto-create profile on signup ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name, avatar_url, provider)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    COALESCE(NEW.raw_app_meta_data->>'provider', 'email')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── User Saved Builds (personal builds) ──
CREATE TABLE IF NOT EXISTS user_builds (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL DEFAULT 'My Build',
  build_data  JSONB NOT NULL,           -- { nodes: [...], edges: [...] }
  char_names  TEXT[] DEFAULT '{}',
  char_count  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_builds_user ON user_builds (user_id, created_at DESC);

ALTER TABLE user_builds ENABLE ROW LEVEL SECURITY;

-- Users can read their own builds
CREATE POLICY "Users can read own builds"
  ON user_builds FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own builds
CREATE POLICY "Users can insert own builds"
  ON user_builds FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own builds
CREATE POLICY "Users can update own builds"
  ON user_builds FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own builds
CREATE POLICY "Users can delete own builds"
  ON user_builds FOR DELETE
  USING (auth.uid() = user_id);


-- ── Build Votes (one vote per user per build) ──
CREATE TABLE IF NOT EXISTS build_votes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  build_id    UUID REFERENCES community_builds(id) ON DELETE CASCADE NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('up', 'down')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, build_id)
);

CREATE INDEX IF NOT EXISTS idx_build_votes_build ON build_votes (build_id);
CREATE INDEX IF NOT EXISTS idx_build_votes_user ON build_votes (user_id);

ALTER TABLE build_votes ENABLE ROW LEVEL SECURITY;

-- Users can read all votes (for counting)
CREATE POLICY "Anyone can read votes"
  ON build_votes FOR SELECT USING (true);

-- Users can insert their own votes
CREATE POLICY "Users can insert own votes"
  ON build_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own votes
CREATE POLICY "Users can update own votes"
  ON build_votes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own votes
CREATE POLICY "Users can delete own votes"
  ON build_votes FOR DELETE
  USING (auth.uid() = user_id);


-- ── Update community_builds to track author user_id ──
-- Add user_id column if not exists (nullable for anonymous builds)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_builds' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE community_builds ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
