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
  amount BIGINT NOT NULL, -- Always positive, type determines income/expense
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
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Constraints
  CONSTRAINT unique_stripe_payment UNIQUE (source_reference) 
    WHERE source_type = 'stripe' AND source_reference IS NOT NULL,
  CONSTRAINT unique_bank_archive_ref UNIQUE (archive_reference) 
    WHERE source_type = 'bank' AND archive_reference IS NOT NULL
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_source_type ON transactions(source_type);
CREATE INDEX IF NOT EXISTS idx_transactions_project_id ON transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_transactions_source_ref ON transactions(source_reference) 
  WHERE source_reference IS NOT NULL;

-- Enable Row Level Security (RLS)
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

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

-- Updated_at trigger for projects
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

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

