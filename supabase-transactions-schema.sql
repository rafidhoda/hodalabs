-- Create simple transactions table for Stripe payments/revenue
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_payment_id TEXT UNIQUE NOT NULL,
  amount BIGINT NOT NULL, -- Amount in smallest currency unit (e.g., cents for USD, øre for NOK)
  currency TEXT NOT NULL DEFAULT 'usd',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_payment_id ON transactions(stripe_payment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to read transactions
CREATE POLICY "Allow authenticated users to read transactions"
  ON transactions
  FOR SELECT
  TO authenticated
  USING (true);

-- Create policy to allow service role to insert transactions (for webhooks)
CREATE POLICY "Allow service role to insert transactions"
  ON transactions
  FOR INSERT
  TO service_role
  WITH CHECK (true);
