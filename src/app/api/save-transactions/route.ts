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
    // First, check if multiple transactions share the same archive_reference
    // If so, we can't use archive_reference (it must be unique)
    const archiveRefCounts = new Map<string, number>();
    transactions.forEach((t: any) => {
      if (t.archive_reference) {
        archiveRefCounts.set(t.archive_reference, (archiveRefCounts.get(t.archive_reference) || 0) + 1);
      }
    });
    
    // Map to new schema format
    const transactionsToInsert = transactions.map((t: any) => {
      // If archive_reference is shared by multiple transactions, don't use it
      // (it must be unique per transaction for the constraint)
      const archiveRefCount = t.archive_reference ? archiveRefCounts.get(t.archive_reference) || 0 : 0;
      const useArchiveRef = archiveRefCount === 1; // Only use if unique
      
      return {
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
        // Only set archive_reference if it's unique (not shared by multiple transactions)
        archive_reference: useArchiveRef ? t.archive_reference : null,
        transaction_type: t.transaction_type || null,
        category: t.category || null,
      };
    });

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
    // For bank transactions, we need to check both archive_reference AND source_reference
    // because some might have archive_reference, others might only have source_reference
    const bankTransactions = transactionsToInsert.filter(t => t.source_type === 'bank');
    if (bankTransactions.length > 0) {
      // Check by archive_reference (only if it's set and unique)
      const archiveRefs = bankTransactions
        .map(t => t.archive_reference)
        .filter(Boolean)
        .filter((ref, idx, arr) => arr.indexOf(ref) === arr.lastIndexOf(ref)); // Only unique ones
      
      if (archiveRefs.length > 0) {
        const { data: existingBankByArchive } = await supabase
          .from("transactions")
          .select("archive_reference")
          .eq("source_type", "bank")
          .in("archive_reference", archiveRefs);
        
        existingBankByArchive?.forEach((t: any) => {
          if (t.archive_reference) existingRefs.add(t.archive_reference);
        });
      }

      // Always check by source_reference for bank transactions
      const sourceRefs = bankTransactions.map(t => t.source_reference).filter(Boolean);
      if (sourceRefs.length > 0) {
        const { data: existingBankBySource } = await supabase
          .from("transactions")
          .select("source_reference")
          .eq("source_type", "bank")
          .in("source_reference", sourceRefs);
        
        existingBankBySource?.forEach((t: any) => {
          if (t.source_reference) existingRefs.add(t.source_reference);
        });
      }
    }

    // Filter out existing transactions
    const newTransactions = transactionsToInsert.filter((t: any) => {
      if (t.source_type === 'bank') {
        // For bank transactions, check both archive_reference and source_reference
        if (t.archive_reference && existingRefs.has(t.archive_reference)) {
          return false;
        }
        if (t.source_reference && existingRefs.has(t.source_reference)) {
          return false;
        }
        return true;
      }
      // For Stripe, check source_reference
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
      
      // Provide more helpful error messages
      let errorMessage = insertError.message;
      if (insertError.message.includes("idx_unique_bank_archive_ref")) {
        errorMessage = "One or more transactions already exist (duplicate archive reference). Please check the preview table - existing transactions are marked in red.";
      } else if (insertError.message.includes("unique constraint")) {
        errorMessage = "One or more transactions already exist. Please check the preview table - existing transactions are marked in red.";
      }
      
      return NextResponse.json(
        { error: errorMessage },
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

