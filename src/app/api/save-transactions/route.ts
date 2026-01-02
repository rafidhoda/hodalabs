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
      counterparty: t.counterparty || null,
      bank_reference: t.bank_reference || null,
      archive_reference: t.archive_reference || null,
      transaction_type: t.transaction_type || null,
      category: t.category || null,
    }));

    // For bank statements, we need to check duplicates using archive_reference
    // For Stripe, we use source_reference
    // We'll need to check for existing transactions first, then insert only new ones
    const existingRefs = new Set<string>();
    
    // Check for existing Stripe transactions
    const stripeTransactions = transactionsToInsert.filter(t => t.source_type === 'stripe');
    if (stripeTransactions.length > 0) {
      const stripeRefs = stripeTransactions.map(t => t.source_reference).filter(Boolean);
      const { data: existingStripe } = await supabase
        .from("transactions")
        .select("source_reference")
        .eq("source_type", "stripe")
        .in("source_reference", stripeRefs);
      
      existingStripe?.forEach((t: any) => {
        if (t.source_reference) existingRefs.add(t.source_reference);
      });
    }

    // Check for existing bank transactions
    const bankTransactions = transactionsToInsert.filter(t => t.source_type === 'bank' && t.archive_reference);
    if (bankTransactions.length > 0) {
      const archiveRefs = bankTransactions.map(t => t.archive_reference).filter(Boolean);
      const { data: existingBank } = await supabase
        .from("transactions")
        .select("archive_reference")
        .eq("source_type", "bank")
        .in("archive_reference", archiveRefs);
      
      existingBank?.forEach((t: any) => {
        if (t.archive_reference) existingRefs.add(t.archive_reference);
      });
    }

    // Filter out existing transactions
    const newTransactions = transactionsToInsert.filter((t: any) => {
      if (t.source_type === 'bank' && t.archive_reference) {
        return !existingRefs.has(t.archive_reference);
      }
      return !existingRefs.has(t.source_reference);
    });

    if (newTransactions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All transactions already exist",
        imported: 0,
        skipped: transactionsToInsert.length,
      });
    }

    const { error: insertError } = await supabase
      .from("transactions")
      .insert(newTransactions);

    if (insertError) {
      console.error("Error inserting transactions:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${newTransactions.length} transactions saved`,
      imported: newTransactions.length,
      skipped: transactionsToInsert.length - newTransactions.length,
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

