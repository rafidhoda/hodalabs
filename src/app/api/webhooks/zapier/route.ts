import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabaseClient";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const webhookSecret = request.headers.get("x-webhook-secret");

    // Optional: Verify webhook secret for security
    const expectedSecret = process.env.ZAPIER_WEBHOOK_SECRET;
    if (expectedSecret && webhookSecret !== expectedSecret) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = getSupabaseServiceClient();

    // Check if this is a Stripe transaction
    const stripePaymentId =
      body.stripe_payment_id ||
      body.payment_intent_id ||
      body.payment_intent?.id ||
      body.id;

    const hasAmount =
      body.amount !== undefined ||
      body.amount_total !== undefined ||
      body.amount_received !== undefined;

    // If it looks like a Stripe transaction, save to transactions table
    if (stripePaymentId && hasAmount) {
      // Parse amount (Stripe amounts are in smallest currency unit, e.g., cents)
      let amount = 0;
      if (typeof body.amount === "number") {
        // Stripe/Zapier sends amount as integer in minor units (cents)
        amount = body.amount;
      } else if (typeof body.amount_total === "number") {
        amount = body.amount_total;
      } else if (typeof body.amount_received === "number") {
        amount = body.amount_received;
      } else if (typeof body.amount === "string") {
        // Handle formatted strings (e.g., "3999" or "3999.00" or "NOK 3,999.00")
        // If it has decimals, assume major units and convert; otherwise assume minor units
        const cleanAmount = body.amount.replace(/[^0-9.-]/g, "");
        const numericValue = parseFloat(cleanAmount);
        if (!isNaN(numericValue)) {
          // If string contains decimal point, assume it's in major units
          if (body.amount.includes(".")) {
            amount = Math.round(numericValue * 100);
          } else {
            // No decimal, assume already in minor units
            amount = Math.round(numericValue);
          }
        }
      }

      // Get currency (default to usd)
      const currency =
        (body.currency || body.amount_currency || "usd").toLowerCase();

      const transaction = {
        stripe_payment_id: stripePaymentId,
        amount: amount,
        currency: currency,
      };

      const { error: transactionError } = await supabase
        .from("transactions")
        .upsert(transaction, {
          onConflict: "stripe_payment_id",
          ignoreDuplicates: false,
        });

      if (transactionError) {
        console.error("Error inserting transaction:", transactionError);
        return NextResponse.json(
          {
            error: "Failed to save transaction",
            details: transactionError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Transaction saved",
        type: "transaction",
      });
    }

    // Otherwise, treat as a generic feed item
    const feedItem = {
      source: body.source || body.app || body.service || "zapier",
      title: body.title || body.subject || body.name || "New Item",
      content:
        body.content || body.message || body.description || body.text || null,
      url: body.url || body.link || body.permalink || null,
      image_url: body.image_url || body.image || body.thumbnail || null,
      author: body.author || body.from || body.user || body.sender || null,
      author_email: body.author_email || body.email || body.from_email || null,
      author_avatar: body.author_avatar || body.avatar || body.profile_picture || null,
      metadata: body, // Store full payload for flexibility
      created_at: body.created_at || body.timestamp || new Date().toISOString(),
    };

    const { error: feedError } = await supabase
      .from("feed_items")
      .insert(feedItem);

    if (feedError) {
      console.error("Error inserting feed item:", feedError);
      return NextResponse.json(
        {
          error: "Failed to save feed item",
          details: feedError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: "Feed item created" 
    });
  } catch (err) {
    console.error("Error processing webhook:", err);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

