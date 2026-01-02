-- Optional: Create a Supabase table to store allowed users
-- This is an alternative to using environment variables
-- Run this in Supabase SQL Editor if you prefer database-based whitelist

CREATE TABLE IF NOT EXISTS allowed_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT -- Email of who added this user
);

-- Insert your allowed emails
-- Example:
-- INSERT INTO allowed_users (email, name) VALUES 
--   ('your-email@gmail.com', 'Your Name'),
--   ('another-email@gmail.com', 'Another Name')
-- ON CONFLICT (email) DO NOTHING;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_allowed_users_email ON allowed_users(email);

-- Optional: Add RLS policy if you want to restrict who can read this table
-- ALTER TABLE allowed_users ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow service role to read allowed_users" ON allowed_users
--   FOR SELECT USING (true); -- Only service role can read (via API)

