# Stripe CSV Export Guide

## Required Fields to Export

For importing Stripe transactions into the new schema, you need these columns:

### ✅ **PAYMENT DETAILS** section:
- ✅ **PaymentIntent ID** - This becomes `source_reference` (stripe_payment_id)
- ✅ **Amount** - Already in minor units (øre/cents) from Stripe
- ✅ **Currency** - Currency code (NOK, USD, etc.)
- ✅ **Created date (UTC)** - For `transaction_date`
- ✅ **Status** - To filter out failed/canceled payments (optional but recommended)
- ✅ **Description** - Optional, for the `description` field

### ✅ **CUSTOMER DETAILS** section:
- ✅ **Customer Email** - For `customer_email` field
- ✅ **Customer ID** - Optional, can store in metadata if needed

## Fields NOT Needed
- Card Details (not needed for transactions)
- Disputes (handle separately if needed)
- Invoices (separate source_type)
- Converted Amount (use original currency)
- Fees (can add later if needed)

## Recommended Export Settings

**Date Range:** Custom (01-01-2025 to 31-12-2025)

**Columns to Check:**
1. PaymentIntent ID ✅
2. Amount ✅
3. Currency ✅
4. Created date (UTC) ✅
5. Status ✅
6. Description ✅
7. Customer Email ✅
8. Customer ID (optional)

## After Export

You'll need to:
1. Clean the CSV (filter out failed/canceled payments if Status column shows issues)
2. Map columns to new schema:
   - PaymentIntent ID → source_reference
   - Amount → amount (already in minor units)
   - Currency → currency
   - Created date → transaction_date
   - Customer Email → customer_email
   - Description → description
3. Add:
   - type = 'income' (all Stripe payments are income)
   - source_type = 'stripe'
4. Assign project_id later (or manually)


