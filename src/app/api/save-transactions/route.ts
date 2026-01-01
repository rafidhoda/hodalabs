import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabaseClient";

export async function POST(request: NextRequest) {
  try {
    const { transactions } = await request.json();

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: "Transactions array is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceClient();

    // Insert transactions using service role (bypasses RLS)
    const { error: insertError } = await supabase
      .from("transactions")
      .upsert(
        transactions.map((t: any) => ({
          stripe_payment_id: t.stripe_payment_id,
          amount: t.amount,
          currency: t.currency.toLowerCase(),
        })),
        {
          onConflict: "stripe_payment_id",
          ignoreDuplicates: false,
        }
      );

    if (insertError) {
      console.error("Error inserting transactions:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${transactions.length} transactions saved`,
    });
  } catch (error: any) {
    console.error("Error saving transactions:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to save transactions",
      },
      { status: 500 }
    );
  }
}

