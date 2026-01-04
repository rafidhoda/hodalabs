# Transaction Fields Guide

## Projects

**Naming Convention:**
- Use human-readable names: `"Oslo Høstferie 2025"`
- No need for slugs unless building URLs/routing later
- Keep names descriptive and clear

**Examples:**
- `"Oslo Høstferie 2025"`
- `"Christmas Camp 2024"`
- `"Summer Intensive 2025"`
- `"General Operations"` (for non-project transactions)

## Counterparty Field Usage

### For Stripe Transactions:
- **`customer_email`**: Store the customer's email address (e.g., `"rahel_iitd@yahoo.com"`)
  - This is the primary identifier (unique, consistent)
  - Use this for matching/counting customers
- **`counterparty`**: Store customer name if available (e.g., `"Rahel IITD"`)
  - Optional but helpful for readability in dashboards
  - Falls back to email if name not available

### For Bank Statements:
- **`counterparty`**: Store the name from "Forklarende tekst" (e.g., `"Utdannet.No AS"`, `"Tripletex AS"`)
  - This is the primary identifier for bank transactions
- **`customer_email`**: Usually null (unless you manually add it)

### For Invoices:
- **`customer_email`**: Store client email
- **`counterparty`**: Store client company/person name

## Field Summary

| Field | Stripe | Bank | Invoice | Manual |
|-------|--------|------|---------|--------|
| `type` | 'income' | 'income' or 'expense' | 'income' | 'income' or 'expense' |
| `source_type` | 'stripe' | 'bank' | 'invoice' | 'manual' |
| `source_reference` | stripe_payment_id | archive_reference | invoice_number | null |
| `customer_email` | ✅ Customer email | ❌ Usually null | ✅ Client email | ❌ Usually null |
| `counterparty` | ⚠️ Optional (customer name) | ✅ Name from description | ✅ Client name | ✅ Vendor/customer name |
| `archive_reference` | ❌ null | ✅ Arkivref | ❌ null | ❌ null |
| `bank_reference` | ❌ null | ✅ Referanse | ❌ null | ❌ null |

## Best Practices

1. **Projects**: Keep names simple and human-readable
2. **Stripe**: Always store `customer_email`, optionally store name in `counterparty`
3. **Bank**: Always store `counterparty` (name), `archive_reference` (unique ID)
4. **Matching**: Use `customer_email` for Stripe, `archive_reference` for bank statements



