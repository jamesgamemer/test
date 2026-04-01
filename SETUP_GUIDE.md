# 7DS Origin - Setup Guide

## การแก้ไขปัญหา GitHub Pages 404 และ Discord OAuth2

### ปัญหาที่พบ

1. **GitHub Pages 404**: เมื่อ OAuth redirect กลับมาที่ `https://jamesgamemer.github.io/` (root) แต่ไม่มี GitHub Pages ที่ root เพราะเว็บอยู่ที่ `/jamesSS/`
2. **Discord OAuth2 redirect_uri ไม่ถูกต้อง**: เมื่อเปิดไฟล์จาก local (`file:///`) ทำให้ redirect_uri เป็น `file:///...` ซึ่ง Discord ไม่ยอมรับ

---

### สิ่งที่แก้ไขในโค้ดแล้ว

1. **`js/supabase-config.js`** - เพิ่มตัวแปร `SITE_URL` ที่กำหนด URL ของเว็บไซต์ที่ถูกต้อง
2. **`js/user-auth.js`** - แก้ไข `redirectTo` ให้ใช้ `SITE_URL` แทน `window.location.href` เพื่อป้องกันปัญหา `file:///` และ redirect ไปผิด URL

---

### สิ่งที่ต้องตั้งค่าเพิ่มเติมใน Supabase Dashboard

#### ขั้นตอนที่ 1: ตั้งค่า Site URL

1. ไปที่ [Supabase Dashboard](https://supabase.com/dashboard)
2. เลือกโปรเจกต์ของคุณ
3. ไปที่ **Authentication** > **URL Configuration**
4. ตั้งค่า **Site URL** เป็น:
   ```
   https://jamesgamemer.github.io/jamesSS
   ```

#### ขั้นตอนที่ 2: เพิ่ม Redirect URLs

ในหน้า **URL Configuration** เดียวกัน ให้เพิ่ม **Redirect URLs** ดังนี้:

```
https://jamesgamemer.github.io/jamesSS/**
https://jamesgamemer.github.io/jamesSS/team-builder.html
https://jamesgamemer.github.io/jamesSS/index.html
```

> **หมายเหตุ**: ใช้ `**` (wildcard) เพื่อให้ redirect กลับมาที่หน้าใดก็ได้ภายใต้ `/jamesSS/`

#### ขั้นตอนที่ 3: ตั้งค่า Discord OAuth Provider

1. ไปที่ **Authentication** > **Providers**
2. เปิดใช้งาน **Discord**
3. ใส่ **Client ID** และ **Client Secret** จาก Discord Developer Portal
4. ตรวจสอบว่า **Redirect URL** ที่ Supabase แสดงให้ (เช่น `https://gzlkdxigiejwwxewyikq.supabase.co/auth/v1/callback`) ถูกเพิ่มใน Discord Developer Portal แล้ว

#### ขั้นตอนที่ 4: ตั้งค่า Discord Developer Portal

1. ไปที่ [Discord Developer Portal](https://discord.com/developers/applications)
2. เลือก Application ของคุณ (Client ID: `1483031168088054784`)
3. ไปที่ **OAuth2** > **Redirects**
4. เพิ่ม Redirect URL ของ Supabase:
   ```
   https://gzlkdxigiejwwxewyikq.supabase.co/auth/v1/callback
   ```
5. **บันทึกการเปลี่ยนแปลง**

---

### ทางเลือก: ใช้ Custom Domain (ไม่ต้องมี /jamesSS/)

หากต้องการให้เว็บอยู่ที่ root (`jamesgamemer.github.io/`) โดยไม่ต้องมี `/jamesSS/`:

1. เปลี่ยนชื่อ repository เป็น `jamesgamemer.github.io`
2. อัปเดต `SITE_URL` ใน `js/supabase-config.js` เป็น `https://jamesgamemer.github.io`
3. อัปเดต Site URL ใน Supabase Dashboard ให้ตรงกัน

---

### สรุปไฟล์ที่แก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|----------------|
| `js/supabase-config.js` | เพิ่ม `SITE_URL` สำหรับ OAuth redirect |
| `js/user-auth.js` | แก้ `redirectTo` ให้ใช้ `SITE_URL` แทน `window.location.href` |
| `SETUP_GUIDE.md` | เพิ่มคู่มือการตั้งค่า (ไฟล์นี้) |

---

**วันที่แก้ไข:** 16 มีนาคม 2026
