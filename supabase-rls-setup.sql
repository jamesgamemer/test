-- ============================================================
-- 7DS ORIGIN - SUPABASE ROW LEVEL SECURITY (RLS) SETUP
-- Run this in Supabase SQL Editor to secure user_builds table
-- ============================================================

-- Enable RLS on user_builds table
ALTER TABLE user_builds ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only SELECT their own builds
CREATE POLICY "Users can view own builds"
  ON user_builds
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can only INSERT builds with their own user_id
CREATE POLICY "Users can insert own builds"
  ON user_builds
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only UPDATE their own builds
CREATE POLICY "Users can update own builds"
  ON user_builds
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only DELETE their own builds
CREATE POLICY "Users can delete own builds"
  ON user_builds
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- user_profiles table (if not exists)
-- ============================================================

-- Create user_profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  provider TEXT DEFAULT 'email',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON user_profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Auto-create profile on signup (trigger)
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

-- Drop existing trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- community_builds and build_votes (public read, auth write)
-- ============================================================

-- community_builds: anyone can read, authenticated users can insert
ALTER TABLE community_builds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view community builds"
  ON community_builds
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert community builds"
  ON community_builds
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- build_votes: users can manage their own votes
ALTER TABLE build_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own votes"
  ON build_votes
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own votes"
  ON build_votes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own votes"
  ON build_votes
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes"
  ON build_votes
  FOR DELETE
  USING (auth.uid() = user_id);
