-- Insert bank transfer income transactions
-- Amounts are stored in minor units (øre), so 26,000 NOK = 2,600,000 øre

-- Transaction 1: Chw AS - 26,000 NOK on 2025-09-08
INSERT INTO transactions (
  type,
  amount,
  currency,
  transaction_date,
  source_type,
  source_reference,
  project_id,
  description,
  counterparty,
  bank_reference,
  archive_reference,
  transaction_type
) VALUES (
  'income',
  2600000, -- 26,000 NOK in øre
  'NOK',
  '2025-09-08',
  'bank',
  '420189451', -- Bank reference
  NULL, -- No matching project found for "Chw AS"
  'Overføring innland',
  'Chw AS',
  '420189451',
  '670001', -- Archive reference (used for duplicate prevention)
  'Overføring innland'
)
ON CONFLICT (archive_reference) WHERE source_type = 'bank' AND archive_reference IS NOT NULL
DO NOTHING;

-- Transaction 2: Utdannet.No AS - 25,000 NOK on 2025-12-02
INSERT INTO transactions (
  type,
  amount,
  currency,
  transaction_date,
  source_type,
  source_reference,
  project_id,
  description,
  counterparty,
  bank_reference,
  archive_reference,
  transaction_type
) VALUES (
  'income',
  2500000, -- 25,000 NOK in øre
  'NOK',
  '2025-12-02',
  'bank',
  '798130217', -- Bank reference
  (SELECT id FROM projects WHERE name = 'Utdannet.no Roblox' LIMIT 1), -- Match to project
  'Giro',
  'Utdannet.No AS',
  '798130217',
  '6376674', -- Archive reference (used for duplicate prevention)
  'Giro'
)
ON CONFLICT (archive_reference) WHERE source_type = 'bank' AND archive_reference IS NOT NULL
DO NOTHING;

