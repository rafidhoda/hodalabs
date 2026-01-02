-- Add category field to transactions table for tracking salary, taxes, etc.
-- Run this in Supabase SQL Editor

ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS category TEXT;

-- Create index for faster category queries
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category) WHERE category IS NOT NULL;

-- Add comment explaining category usage
COMMENT ON COLUMN transactions.category IS 'Transaction category for tax/tracking purposes. Common values: "salary", "tax", "rent", "utilities", etc.';

