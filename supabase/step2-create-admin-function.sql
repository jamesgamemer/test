-- ============================================================
-- STEP 2: สร้าง ADMIN CHECK FUNCTION
-- ============================================================
-- รันไฟล์นี้เป็นอันดับที่ 2
-- สร้างฟังก์ชันสำหรับเช็คว่า user เป็น admin หรือไม่
-- โดยเช็คจาก email ที่กำหนดไว้
-- ============================================================

-- ┌─────────────────────────────────────────────────────────┐
-- │  แก้ไข email ด้านล่างให้ตรงกับ admin email ของคุณ       │
-- └─────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT email IN (
      'jamesgamemer@gmail.com',
      'jamesmerstudio@gmail.com'
    )
    FROM auth.users
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ทดสอบว่าฟังก์ชันทำงานได้
SELECT public.is_admin() AS am_i_admin;
