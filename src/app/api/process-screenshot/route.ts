import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: NextRequest) {
  try {
    const { image, mimeType, context } = await request.json();

    if (!image) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!anthropicKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not set" },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType || "image/png",
                data: image,
              },
            },
            {
              type: "text",
              text: `Extract transaction data from this screenshot. This could be a Stripe transactions table, bank statement, or other financial document.

${context ? `USER INSTRUCTIONS:\n${context}\n\nPlease follow these instructions carefully.\n\n` : ""}

CRITICAL EXTRACTION RULES:

1. TRANSACTION TYPE DETECTION:
   - For Stripe transactions: Look for payment IDs starting with "pi_", "ch_", or similar Stripe prefixes
   - For bank statements: Look for transaction references, archive references, or account numbers
   - For expenses: Amounts may be negative or shown with a minus sign. Extract the absolute value as a positive number.
   - If user specified "only expenses" or "negative numbers only", ONLY extract transactions with negative amounts or outgoing payments

2. IDENTIFIER FIELD (source_reference):
   - Stripe: Copy payment ID EXACTLY as shown (usually starts with "pi_"). Be extremely careful with:
     - Letters vs numbers (e.g., "I" vs "1", "O" vs "0", "G" vs "6")
     - Case sensitivity (preserve original case)
     - No extra spaces or characters
   - Bank statements: Use archive reference ("Arkivref") or bank reference ("Referanse") if available
   - If no unique identifier is visible, use a combination of date + amount + counterparty

3. amount: Extract as a NUMBER (not a string), in major currency units:
   - "NOK 3,999.00" → 3999
   - "USD 600.00" → 600
   - "-26.000,00" (expense) → 26000 (extract absolute value)
   - "26.000,00" (with minus sign) → 26000
   - Do NOT convert to minor units (no multiplication by 100)
   - Always extract as a positive number (even if shown as negative)

4. currency: Lowercase currency code (e.g., "nok", "usd", "eur")

5. date: ISO format YYYY-MM-DD if visible (required for bank statements)

6. counterparty: Name of the other party (company name, vendor, customer) if visible

7. description: Transaction description or type (e.g., "Overføring innland", "Giro", "Visa") if visible

8. customer_email: Email address if visible (optional, mainly for Stripe)

9. status: Transaction status if visible (optional, mainly for Stripe)

10. bank_reference: Bank reference number if visible (for bank statements)

11. archive_reference: Archive reference ("Arkivref") if visible (for bank statements)

Return ONLY a valid JSON array of transactions in this exact format:
[
  {
    "stripe_payment_id": "pi_3SjITkFpApLy86NM0jBOGGKb",
    "amount": 3999,
    "currency": "nok",
    "date": "2025-12-29",
    "customer_email": "example@email.com",
    "status": "succeeded",
    "counterparty": "Customer Name",
    "description": "Payment description",
    "bank_reference": "420189451",
    "archive_reference": "670001"
  }
]

VALIDATION REQUIREMENTS:
- stripe_payment_id (or equivalent identifier) is required
- For Stripe: payment ID must start with "pi_", "ch_", or similar Stripe prefix and be at least 20 characters
- For bank statements: archive_reference or bank_reference is preferred, but date+amount+counterparty combination is acceptable
- amount must be a positive number (extract absolute value even if shown as negative)
- currency must be a valid 3-letter code (nok, usd, eur, etc.)
- date is required for bank statements
- Return an empty array [] if no transactions are found
- If ANY required field is missing or unclear, exclude that transaction
- If user specified to only extract expenses, ONLY include transactions that are clearly expenses (negative amounts, outgoing payments, etc.)`,
            },
          ],
        },
      ],
    });

    const textContent = response.content.find(
      (c) => c.type === "text"
    ) as { type: "text"; text: string } | undefined;

    if (!textContent) {
      return NextResponse.json(
        { error: "No text response from Claude" },
        { status: 500 }
      );
    }

    // Extract JSON from response (handle cases where Claude adds markdown code blocks)
    let jsonText = textContent.text.trim();
    
    // Remove markdown code blocks if present
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n/, "").replace(/\n```$/, "");
    }

    let transactions;
    try {
      transactions = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("Failed to parse JSON:", jsonText);
      return NextResponse.json(
        { error: "Failed to parse transaction data from Claude response" },
        { status: 500 }
      );
    }

    if (!Array.isArray(transactions)) {
      return NextResponse.json(
        { error: "Expected array of transactions" },
        { status: 500 }
      );
    }

    // Validate and clean transactions
    const validTransactions = transactions.filter((t) => {
      // Required fields: need either stripe_payment_id OR (archive_reference OR bank_reference)
      const hasStripeId = t.stripe_payment_id && String(t.stripe_payment_id).trim().length > 0;
      const hasBankRef = (t.archive_reference && String(t.archive_reference).trim().length > 0) ||
                         (t.bank_reference && String(t.bank_reference).trim().length > 0);
      
      if (!hasStripeId && !hasBankRef) {
        // If no identifier, try to create one from date + amount + counterparty
        if (!t.date || typeof t.amount !== "number" || !t.counterparty) {
          console.warn("Transaction missing required identifier fields");
          return false;
        }
      }

      if (typeof t.amount !== "number" || !t.currency) {
        return false;
      }

      // Payment ID validation (only for Stripe transactions)
      if (hasStripeId) {
        const paymentId = String(t.stripe_payment_id).trim();
        if (!paymentId.startsWith("pi_") && !paymentId.startsWith("ch_") && !paymentId.startsWith("in_")) {
          // Not a Stripe ID, might be a bank reference - allow it
          console.warn(`Payment ID doesn't match Stripe format: ${paymentId}`);
        }
        if (paymentId.length < 10) {
          console.warn(`Payment ID too short: ${paymentId}`);
          return false;
        }
      }

      // Amount validation (must be positive, extract absolute value)
      if (t.amount <= 0 || !isFinite(t.amount)) {
        console.warn(`Invalid amount: ${t.amount}`);
        return false;
      }

      // Currency validation
      const currency = String(t.currency).toLowerCase().trim();
      if (currency.length !== 3) {
        console.warn(`Invalid currency: ${currency}`);
        return false;
      }

      return true;
    }).map((t) => {
      // For bank statements: prioritize archive_reference, then bank_reference, then generate composite
      // For Stripe: use stripe_payment_id
      let sourceReference = t.stripe_payment_id;
      
      // If it's a bank statement (has archive_reference or bank_reference, or no Stripe ID format)
      const hasStripeFormat = t.stripe_payment_id && 
                             (t.stripe_payment_id.startsWith("pi_") || 
                              t.stripe_payment_id.startsWith("ch_") || 
                              t.stripe_payment_id.startsWith("in_"));
      
      if (!hasStripeFormat) {
        // Bank statement: use archive_reference as primary, bank_reference as fallback
        sourceReference = t.archive_reference || t.bank_reference;
        
        // If still no reference, generate composite ID
        if (!sourceReference && t.date && t.amount && (t.counterparty || t.description)) {
          const identifier = (t.counterparty || t.description || "unknown")
            .substring(0, 20)
            .replace(/\s+/g, '_')
            .replace(/[^a-zA-Z0-9_]/g, '');
          sourceReference = `bank_${t.date}_${t.amount}_${identifier}`;
        }
      }

      return {
        ...t,
        stripe_payment_id: sourceReference || String(t.stripe_payment_id || "").trim(),
        currency: String(t.currency).toLowerCase().trim(),
        amount: Math.round(t.amount), // Ensure integer amounts
        date: t.date || undefined,
        counterparty: t.counterparty || undefined,
        description: t.description || undefined,
        bank_reference: t.bank_reference || undefined,
        archive_reference: t.archive_reference || undefined,
        customer_email: t.customer_email || undefined,
        status: t.status || undefined,
      };
    });

    return NextResponse.json({
      success: true,
      transactions: validTransactions,
    });
  } catch (error: any) {
    console.error("Error processing screenshot:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to process screenshot",
      },
      { status: 500 }
    );
  }
}

