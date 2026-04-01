-- ============================================================
-- STEP 3: สร้าง POLICIES ใหม่สำหรับตาราง ADMIN
-- ============================================================
-- รันไฟล์นี้เป็นอันดับที่ 3
-- ตารางเหล่านี้ทุกคนอ่านได้ แต่เฉพาะ ADMIN เท่านั้นที่แก้ไขได้
-- (ก่อนหน้านี้ authenticated ทุกคนแก้ไขได้ = ปัญหา!)
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- CHARACTERS TABLE
-- ════════════════════════════════════════════════════════════
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;

-- ทุกคนอ่านได้ (เว็บสาธารณะ)
CREATE POLICY "Anyone can read characters"
  ON characters FOR SELECT
  USING (true);

-- เฉพาะ admin เพิ่มได้
CREATE POLICY "Only admin can insert characters"
  ON characters FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- เฉพาะ admin แก้ไขได้
CREATE POLICY "Only admin can update characters"
  ON characters FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- เฉพาะ admin ลบได้
CREATE POLICY "Only admin can delete characters"
  ON characters FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ════════════════════════════════════════════════════════════
-- WEAPONS TABLE
-- ════════════════════════════════════════════════════════════
ALTER TABLE weapons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read weapons"
  ON weapons FOR SELECT
  USING (true);

CREATE POLICY "Only admin can insert weapons"
  ON weapons FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Only admin can update weapons"
  ON weapons FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Only admin can delete weapons"
  ON weapons FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ════════════════════════════════════════════════════════════
-- WEAPON_CHARACTERS TABLE
-- ════════════════════════════════════════════════════════════
ALTER TABLE weapon_characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read weapon_characters"
  ON weapon_characters FOR SELECT
  USING (true);

CREATE POLICY "Only admin can insert weapon_characters"
  ON weapon_characters FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Only admin can update weapon_characters"
  ON weapon_characters FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Only admin can delete weapon_characters"
  ON weapon_characters FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ════════════════════════════════════════════════════════════
-- EVENTS TABLE
-- ════════════════════════════════════════════════════════════
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read events"
  ON events FOR SELECT
  USING (true);

CREATE POLICY "Only admin can insert events"
  ON events FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Only admin can update events"
  ON events FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Only admin can delete events"
  ON events FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ════════════════════════════════════════════════════════════
-- GUIDES TABLE
-- ════════════════════════════════════════════════════════════
ALTER TABLE guides ENABLE ROW LEVEL SECURITY;

-- ทุกคนอ่าน published guides ได้
CREATE POLICY "Anyone can read published guides"
  ON guides FOR SELECT
  USING (status = 'published');

-- admin อ่าน drafts ได้ด้วย
CREATE POLICY "Admin can read all guides"
  ON guides FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Only admin can insert guides"
  ON guides FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Only admin can update guides"
  ON guides FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Only admin can delete guides"
  ON guides FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ════════════════════════════════════════════════════════════
-- GUIDE_BLOCKS TABLE
-- ════════════════════════════════════════════════════════════
ALTER TABLE guide_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read guide blocks"
  ON guide_blocks FOR SELECT
  USING (true);

CREATE POLICY "Only admin can insert guide blocks"
  ON guide_blocks FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Only admin can update guide blocks"
  ON guide_blocks FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Only admin can delete guide blocks"
  ON guide_blocks FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ════════════════════════════════════════════════════════════
-- MEDIA TABLE
-- ════════════════════════════════════════════════════════════
ALTER TABLE media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read media"
  ON media FOR SELECT
  USING (true);

CREATE POLICY "Only admin can insert media"
  ON media FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Only admin can update media"
  ON media FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Only admin can delete media"
  ON media FOR DELETE
  TO authenticated
  USING (public.is_admin());


SELECT 'Step 3 Complete: Admin-only policies created for characters, weapons, events, guides, media' AS status;
