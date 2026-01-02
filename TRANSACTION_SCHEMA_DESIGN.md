# Transaction & Project Schema Design

## Questions to Consider

1. **Expenses**: Do expenses also come through Stripe, or are they manual entries/bank statements?
   - If bank statements: will you upload screenshots (like you do now)?
   - Should expenses have a similar "reference ID" system?

2. **Projects**: 
   - Can a transaction belong to multiple projects? (Probably no for simplicity)
   - Can a transaction have NO project? (Probably yes for general expenses/income)
   - What info do you want to track per project? (name, start date, status?)

3. **Invoices**:
   - Do invoices have an invoice number/reference ID?
   - Should we track the client/customer for invoices?
   - Do invoices come through a specific system (Stripe Invoicing, external tool)?

## Proposed Schema

### Projects Table
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active', -- 'active', 'completed', 'on_hold'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Transactions Table (Enhanced)
```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Transaction Type
  type TEXT NOT NULL, -- 'income' or 'expense'
  
  -- Source Identification (mutually exclusive)
  stripe_payment_id TEXT, -- For Stripe payments (most income)
  invoice_reference TEXT, -- For invoices (e.g., "INV-2025-001")
  source_type TEXT NOT NULL, -- 'stripe', 'invoice', 'manual'
  
  -- Amount & Currency
  amount BIGINT NOT NULL, -- In smallest currency unit (cents/øre)
  currency TEXT NOT NULL DEFAULT 'usd',
  
  -- Date
  transaction_date DATE NOT NULL, -- Actual transaction date
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Project Association
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  
  -- Additional Info
  description TEXT,
  customer_name TEXT, -- For invoices
  customer_email TEXT, -- For invoices/stripe
  
  -- Constraints
  CONSTRAINT check_source_match CHECK (
    (source_type = 'stripe' AND stripe_payment_id IS NOT NULL AND invoice_reference IS NULL) OR
    (source_type = 'invoice' AND invoice_reference IS NOT NULL AND stripe_payment_id IS NULL) OR
    (source_type = 'manual' AND stripe_payment_id IS NULL AND invoice_reference IS NULL)
  ),
  
  -- Unique constraint on stripe_payment_id (when present)
  CONSTRAINT unique_stripe_payment UNIQUE (stripe_payment_id) WHERE stripe_payment_id IS NOT NULL
);
```

## Alternative: Simpler Approach

If you want to keep it simpler, we could use:

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- 'income' or 'expense'
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  transaction_date DATE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  
  -- Flexible source identification
  source_type TEXT NOT NULL, -- 'stripe', 'invoice', 'manual'
  source_reference TEXT, -- stripe_payment_id OR invoice_number OR null
  
  description TEXT,
  customer_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

This is simpler but less strict (no database-level validation of source_type matching).

## Recommendation

I recommend the **simpler approach** because:
1. More flexible (easier to add new source types later)
2. Less complex constraints
3. Still clear and maintainable
4. Can add validation in application code

What do you think? Any fields you want to add/remove/change?

