import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: NextRequest) {
  try {
    const { image, mimeType } = await request.json();

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
              text: `Extract all transaction data from this screenshot. This appears to be a Stripe transactions table.

CRITICAL EXTRACTION RULES:
1. stripe_payment_id: Copy EXACTLY as shown (usually starts with "pi_"). Be extremely careful with:
   - Letters vs numbers (e.g., "I" vs "1", "O" vs "0", "G" vs "6")
   - Case sensitivity (preserve original case)
   - No extra spaces or characters
   - Double-check each character matches the screenshot exactly

2. amount: Extract as a NUMBER (not a string), in major currency units:
   - "NOK 3,999.00" → 3999
   - "USD 600.00" → 600
   - "USD 99" → 99
   - Do NOT convert to minor units (no multiplication by 100)

3. currency: Lowercase currency code (e.g., "nok", "usd", "eur")

4. date: ISO format YYYY-MM-DD if visible (optional)

5. customer_email: Email address if visible (optional)

6. status: Transaction status if visible (optional)

Return ONLY a valid JSON array of transactions in this exact format:
[
  {
    "stripe_payment_id": "pi_3SjITkFpApLy86NM0jBOGGKb",
    "amount": 3999,
    "currency": "nok",
    "date": "2025-12-29",
    "customer_email": "example@email.com",
    "status": "succeeded"
  }
]

VALIDATION REQUIREMENTS:
- stripe_payment_id must start with "pi_" or "ch_" or similar Stripe prefix
- stripe_payment_id must be at least 20 characters long
- amount must be a positive number
- currency must be a valid 3-letter code (nok, usd, eur, etc.)
- Return an empty array [] if no transactions are found
- If ANY required field (stripe_payment_id, amount, currency) is missing or unclear, exclude that transaction`,
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
      // Required fields check
      if (!t.stripe_payment_id || typeof t.amount !== "number" || !t.currency) {
        return false;
      }

      // Payment ID validation
      const paymentId = String(t.stripe_payment_id).trim();
      if (!paymentId.startsWith("pi_") && !paymentId.startsWith("ch_")) {
        console.warn(`Invalid payment ID format: ${paymentId}`);
        return false;
      }
      if (paymentId.length < 20) {
        console.warn(`Payment ID too short: ${paymentId}`);
        return false;
      }

      // Amount validation
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
    }).map((t) => ({
      ...t,
      stripe_payment_id: String(t.stripe_payment_id).trim(),
      currency: String(t.currency).toLowerCase().trim(),
      amount: Math.round(t.amount), // Ensure integer amounts
    }));

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

