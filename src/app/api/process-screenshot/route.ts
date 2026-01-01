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

For each transaction, extract:
- stripe_payment_id (the payment intent ID, e.g., pi_xxxxx)
- amount (the numeric amount, as a number)
- currency (the currency code, e.g., "nok", "usd")
- date (optional, if visible)
- customer_email (optional, if visible)
- status (optional, if visible)

Return ONLY a valid JSON array of transactions in this exact format:
[
  {
    "stripe_payment_id": "pi_xxxxx",
    "amount": 3999,
    "currency": "nok",
    "date": "2025-12-29",
    "customer_email": "example@email.com",
    "status": "succeeded"
  }
]

Important:
- Amounts should be in major units (3999 for NOK 3,999.00, not 399900)
- Currency codes should be lowercase (nok, usd, etc.)
- Only include fields that are actually visible in the image
- Return an empty array [] if no transactions are found
- Ensure all required fields (stripe_payment_id, amount, currency) are present for each transaction`,
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

    // Validate transactions
    const validTransactions = transactions.filter((t) => {
      return (
        t.stripe_payment_id &&
        typeof t.amount === "number" &&
        t.currency
      );
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

