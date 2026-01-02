import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabaseClient";

interface Transaction {
  stripe_payment_id?: string;
  amount: number;
  currency: string;
  archive_reference?: string;
  bank_reference?: string;
}

// Normalize payment ID for comparison (case-insensitive, trimmed)
function normalizePaymentId(id: string): string {
  return id.toLowerCase().trim();
}

// Check if two payment IDs match (exact match after normalization)
function paymentIdsMatch(id1: string, id2: string): boolean {
  return normalizePaymentId(id1) === normalizePaymentId(id2);
}

// Check if transaction matches by identifier, amount, and currency
function transactionMatches(
  extracted: Transaction,
  dbTransaction: any
): boolean {
  // For bank statements: match by archive_reference
  if (extracted.archive_reference && dbTransaction.archive_reference) {
    if (normalizePaymentId(extracted.archive_reference) === normalizePaymentId(dbTransaction.archive_reference)) {
      return true;
    }
  }

  // For Stripe: match by source_reference (stripe_payment_id)
  if (extracted.stripe_payment_id && dbTransaction.source_reference) {
    if (paymentIdsMatch(extracted.stripe_payment_id, dbTransaction.source_reference)) {
      return true;
    }
  }

  // Fallback: Match by amount + currency (for OCR errors in payment ID)
  // Only use this if amounts match exactly and currencies match
  if (
    extracted.amount === dbTransaction.amount &&
    normalizePaymentId(extracted.currency) === normalizePaymentId(dbTransaction.currency)
  ) {
    // Additional check: identifiers should be similar length (within 5 chars)
    const extractedId = extracted.stripe_payment_id || extracted.archive_reference || "";
    const dbId = dbTransaction.source_reference || dbTransaction.archive_reference || "";
    if (extractedId && dbId) {
      const lenDiff = Math.abs(extractedId.length - dbId.length);
      if (lenDiff <= 5) {
        return true;
      }
    }
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    const { transactions } = await request.json();

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: "Transactions array is required" },
        { status: 400 }
      );
    }

    // Validate transactions have required fields
    const validTransactions = transactions.filter((t: Transaction) => {
      return (
        (t.stripe_payment_id || t.archive_reference || t.bank_reference) &&
        typeof t.amount === "number" &&
        t.currency
      );
    });

    if (validTransactions.length === 0) {
      return NextResponse.json(
        { error: "No valid transactions provided" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceClient();

    console.log("Checking duplicates for", validTransactions.length, "transactions");

    // Fetch ALL transactions from database
    const { data: allDbTransactions, error } = await supabase
      .from("transactions")
      .select("source_reference, archive_reference, amount, currency, source_type");

    if (error) {
      console.error("Error fetching transactions:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    console.log("Fetched", allDbTransactions?.length || 0, "total transactions from DB");

    // Match extracted transactions against database
    const matchedExtractedIds = new Set<string>();
    const matchDetails: Array<{
      extractedId: string;
      matchedId: string;
      matchType: "payment_id" | "archive_reference" | "amount_currency";
    }> = [];

    for (const extracted of validTransactions) {
      // Use archive_reference for bank statements, stripe_payment_id for Stripe
      const extractedId = extracted.archive_reference || extracted.stripe_payment_id || extracted.bank_reference || "";
      
      for (const dbTxn of allDbTransactions || []) {
        if (transactionMatches(extracted, dbTxn)) {
          const dbId = dbTxn.archive_reference || dbTxn.source_reference || "";
          
          let matchType: "payment_id" | "archive_reference" | "amount_currency";
          if (extracted.archive_reference && dbTxn.archive_reference) {
            matchType = "archive_reference";
          } else if (extracted.stripe_payment_id && dbTxn.source_reference) {
            matchType = paymentIdsMatch(extracted.stripe_payment_id, dbTxn.source_reference)
              ? "payment_id"
              : "amount_currency";
          } else {
            matchType = "amount_currency";
          }

          matchedExtractedIds.add(normalizePaymentId(extractedId));
          matchDetails.push({
            extractedId: extractedId,
            matchedId: dbId,
            matchType,
          });

          console.log(
            `Matched: ${extractedId} → ${dbId} (${matchType})`
          );
          break; // Found a match, move to next extracted transaction
        }
      }
    }

    console.log("Found", matchedExtractedIds.size, "matches out of", validTransactions.length, "extracted transactions");

    return NextResponse.json({
      matchedExtractedIds: Array.from(matchedExtractedIds),
      matchDetails: matchDetails,
    });
  } catch (error: any) {
    console.error("Error checking duplicates:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to check duplicates",
      },
      { status: 500 }
    );
  }
}

