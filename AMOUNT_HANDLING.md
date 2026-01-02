# Amount Handling Guide

## Storage: Always Minor Units (øre/cents)

The database stores all amounts in **minor currency units** (smallest unit):
- NOK: Store in **øre** (1 NOK = 100 øre)
- USD: Store in **cents** (1 USD = 100 cents)

**Examples:**
- NOK 3,999.00 → Store as `399900` (3999 × 100)
- USD 600.00 → Store as `60000` (600 × 100)
- NOK 77.50 → Store as `7750` (77.50 × 100)

## Data Sources

### From Zapier/Stripe ✅
**Send amounts in minor units:**
- NOK 3,999 → Send `399900` (øre)
- USD 600 → Send `60000` (cents)

Stripe already sends amounts in minor units, so Zapier should pass them through as-is.

### From Screenshots (Bank/Stripe UI)
**Extract amounts in major units, then convert:**
- Screenshot shows: "NOK 3,999.00"
- Claude extracts: `3999` (major units)
- Code converts: `3999 × 100 = 399900` (before saving to DB)

### From Manual Entry
**Accept major units, convert before saving:**
- User enters: "3999 NOK"
- Code converts: `3999 × 100 = 399900` (before saving)

## Display

When showing amounts to users, always divide by 100:
- Database: `399900`
- Display: `3999` NOK or `3,999.00 NOK`

## Why Minor Units?

1. **Precision**: Avoids floating-point errors
2. **Standard Practice**: Financial systems use integers for amounts
3. **Consistency**: Stripe uses minor units natively
4. **Calculations**: Easier to sum, subtract, etc. without rounding errors

## Summary

| Source | Send/Extract | Store in DB | Display |
|--------|-------------|-------------|---------|
| Zapier/Stripe | Minor units (399900) | 399900 | 3999 NOK |
| Screenshots | Major units (3999) | 399900 (convert ×100) | 3999 NOK |
| Manual Entry | Major units (3999) | 399900 (convert ×100) | 3999 NOK |

