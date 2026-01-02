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
    // Map to new schema format
    const transactionsToInsert = transactions.map((t: any) => ({
      type: t.type || "income",
      amount: t.amount,
      currency: t.currency.toLowerCase(),
      transaction_date: t.transaction_date || new Date().toISOString().split("T")[0],
      source_type: t.source_type || "stripe",
      source_reference: t.source_reference || t.stripe_payment_id,
      project_id: t.project_id || null,
      customer_email: t.customer_email || null,
      description: t.description || null,
    }));

    const { error: insertError } = await supabase
      .from("transactions")
      .upsert(transactionsToInsert, {
        onConflict: "source_reference",
        ignoreDuplicates: false,
      });

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

