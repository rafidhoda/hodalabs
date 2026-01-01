import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabaseClient";

interface Transaction {
  stripe_payment_id: string;
  amount: number;
  currency: string;
}

// Normalize payment ID for comparison (case-insensitive, trimmed)
function normalizePaymentId(id: string): string {
  return id.toLowerCase().trim();
}

// Check if two payment IDs match (exact match after normalization)
function paymentIdsMatch(id1: string, id2: string): boolean {
  return normalizePaymentId(id1) === normalizePaymentId(id2);
}

// Check if transaction matches by payment ID, amount, and currency
function transactionMatches(
  extracted: Transaction,
  dbTransaction: Transaction
): boolean {
  // Primary: Match by payment ID (case-insensitive)
  if (paymentIdsMatch(extracted.stripe_payment_id, dbTransaction.stripe_payment_id)) {
    return true;
  }

  // Fallback: Match by amount + currency (for OCR errors in payment ID)
  // Only use this if amounts match exactly and currencies match
  if (
    extracted.amount === dbTransaction.amount &&
    normalizePaymentId(extracted.currency) === normalizePaymentId(dbTransaction.currency)
  ) {
    // Additional check: payment IDs should be similar length (within 5 chars)
    const lenDiff = Math.abs(
      extracted.stripe_payment_id.length - dbTransaction.stripe_payment_id.length
    );
    if (lenDiff <= 5) {
      return true;
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
        t.stripe_payment_id &&
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
      .select("stripe_payment_id, amount, currency");

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
      matchType: "payment_id" | "amount_currency";
    }> = [];

    for (const extracted of validTransactions) {
      for (const dbTxn of allDbTransactions || []) {
        if (transactionMatches(extracted, dbTxn)) {
          const matchType = paymentIdsMatch(
            extracted.stripe_payment_id,
            dbTxn.stripe_payment_id
          )
            ? "payment_id"
            : "amount_currency";

          matchedExtractedIds.add(extracted.stripe_payment_id);
          matchDetails.push({
            extractedId: extracted.stripe_payment_id,
            matchedId: dbTxn.stripe_payment_id,
            matchType,
          });

          console.log(
            `Matched: ${extracted.stripe_payment_id} → ${dbTxn.stripe_payment_id} (${matchType})`
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

