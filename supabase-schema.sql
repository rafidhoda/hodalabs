-- Create feed_items table for storing data from Zapier and other webhook sources
CREATE TABLE IF NOT EXISTS feed_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  url TEXT,
  image_url TEXT,
  author TEXT,
  author_email TEXT,
  author_avatar TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_feed_items_created_at ON feed_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_items_source ON feed_items(source);

-- Enable Row Level Security (RLS)
ALTER TABLE feed_items ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to read feed items
CREATE POLICY "Allow authenticated users to read feed items"
  ON feed_items
  FOR SELECT
  TO authenticated
  USING (true);

-- Create policy to allow service role to insert (for webhooks)
-- Note: Webhooks will use the service role key, not the anon key
-- If you want to use anon key, you'll need to adjust this policy
CREATE POLICY "Allow service role to insert feed items"
  ON feed_items
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Alternative: If you want to allow inserts from webhooks using anon key,
-- you can create a function that bypasses RLS or use a different approach
-- For now, you may need to use the service role key in your webhook endpoint
-- or create a more permissive policy for inserts

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_feed_items_updated_at
  BEFORE UPDATE ON feed_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


