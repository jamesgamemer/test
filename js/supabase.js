
const SUPABASE_URL = "https://gzlkdxigiejwwxewyikq.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6bGtkeGlnaWVqd3d4ZXd5aWtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NjU2NzMsImV4cCI6MjA4ODU0MTY3M30.62lXidTteew5WB2r3kmm6zqBVHB_6AHLz-vWwj3rRrs"

const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
)
