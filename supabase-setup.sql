-- ============================================
-- Hoda Labs Transactions & Projects Schema
-- ============================================
-- Run this in Supabase SQL Editor
--
-- NOTE: If you have an existing 'transactions' table with data,
-- you may need to migrate data first or drop the old table.
-- ============================================

-- Projects table for tracking project profitability
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active', -- 'active', 'completed', 'on_hold'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enhanced Transactions table - handles Stripe, invoices, and bank statements
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Transaction Type & Amount
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount BIGINT NOT NULL, -- Always positive, type determines income/expense (stored in minor units: øre/cents)
  currency TEXT NOT NULL DEFAULT 'usd',
  
  -- Transaction Date
  transaction_date DATE NOT NULL, -- Actual transaction date (not created_at)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Source Identification
  source_type TEXT NOT NULL CHECK (source_type IN ('stripe', 'invoice', 'bank', 'manual')),
  source_reference TEXT, -- stripe_payment_id, invoice_number, bank_reference, etc.
  
  -- Project Association (optional)
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  
  -- Transaction Details
  description TEXT, -- Transaction description/notes
  counterparty TEXT, -- Name of the other party (customer name, vendor name, etc.)
  customer_email TEXT, -- Email address (for Stripe: use customer email, for bank: can be null)
  
  -- Bank Statement Specific Fields
  bank_reference TEXT, -- "Referanse" from bank statement
  archive_reference TEXT, -- "Arkivref" from bank statement
  transaction_type TEXT, -- "Transaksjonstype" (e.g., "Overføring innland", "Visa", "Giro")
  
  -- Metadata (for any extra info we might need)
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_source_type ON transactions(source_type);
CREATE INDEX IF NOT EXISTS idx_transactions_project_id ON transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_transactions_source_ref ON transactions(source_reference) 
  WHERE source_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_archive_ref ON transactions(archive_reference) 
  WHERE archive_reference IS NOT NULL;

-- Partial unique indexes for preventing duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_stripe_payment 
  ON transactions(source_reference) 
  WHERE source_type = 'stripe' AND source_reference IS NOT NULL;
  
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_bank_archive_ref 
  ON transactions(archive_reference) 
  WHERE source_type = 'bank' AND archive_reference IS NOT NULL;

-- Enable Row Level Security (RLS)
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow authenticated users to read transactions" ON transactions;
DROP POLICY IF EXISTS "Allow authenticated users to insert transactions" ON transactions;
DROP POLICY IF EXISTS "Allow authenticated users to update transactions" ON transactions;
DROP POLICY IF EXISTS "Allow service role full access to transactions" ON transactions;
DROP POLICY IF EXISTS "Allow authenticated users to read projects" ON projects;
DROP POLICY IF EXISTS "Allow authenticated users to manage projects" ON projects;
DROP POLICY IF EXISTS "Allow service role full access to projects" ON projects;

-- RLS Policies for transactions
CREATE POLICY "Allow authenticated users to read transactions"
  ON transactions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert transactions"
  ON transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update transactions"
  ON transactions
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow service role full access to transactions"
  ON transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for projects
CREATE POLICY "Allow authenticated users to read projects"
  ON projects
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to manage projects"
  ON projects
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service role full access to projects"
  ON projects
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger function (create if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Updated_at trigger for projects
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Helper view for dashboard queries (income vs expenses by project)
CREATE OR REPLACE VIEW transaction_summary AS
SELECT 
  project_id,
  p.name as project_name,
  type,
  currency,
  DATE_TRUNC('month', transaction_date) as month,
  DATE_TRUNC('year', transaction_date) as year,
  COUNT(*) as transaction_count,
  SUM(amount) as total_amount
FROM transactions t
LEFT JOIN projects p ON t.project_id = p.id
GROUP BY project_id, p.name, type, currency, month, year;

-- ============================================
-- Migration Notes (if you have existing data):
-- ============================================
-- If you have an old 'transactions' table with Stripe data, you can migrate it like this:
--
-- INSERT INTO transactions (
--   type, amount, currency, transaction_date, source_type, source_reference, created_at
-- )
-- SELECT 
--   'income' as type,
--   amount,
--   currency,
--   DATE(created_at) as transaction_date,
--   'stripe' as source_type,
--   stripe_payment_id as source_reference,
--   created_at
-- FROM old_transactions_table;
-- ============================================

