import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseClient } from "@/lib/supabaseClient";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "No signature provided" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const error = err as Error;
    console.error("Webhook signature verification failed:", error.message);
    return NextResponse.json(
      { error: `Webhook Error: ${error.message}` },
      { status: 400 }
    );
  }

  // Handle payment events
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    try {
      const supabase = getSupabaseClient();

      // Extract relevant payment information
      const paymentData = {
        stripe_payment_id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        customer_email: paymentIntent.receipt_email || null,
        customer_id: paymentIntent.customer
          ? String(paymentIntent.customer)
          : null,
        description: paymentIntent.description || null,
        metadata: paymentIntent.metadata || {},
        created_at: new Date(paymentIntent.created * 1000).toISOString(),
      };

      const { error } = await supabase.from("payments").insert(paymentData);

      if (error) {
        console.error("Error inserting payment:", error);
        return NextResponse.json(
          { error: "Failed to save payment" },
          { status: 500 }
        );
      }
    } catch (err) {
      console.error("Error processing payment:", err);
      return NextResponse.json(
        { error: "Failed to process payment" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ received: true });
}


