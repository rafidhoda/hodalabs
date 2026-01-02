import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabaseClient";

interface BankCSVTransaction {
  "Bokført dato"?: string;
  "Forklarende tekst"?: string;
  "Transaksjonstype"?: string;
  Ut?: string; // Outgoing (expenses)
  Inn?: string; // Incoming (income)
  "Arkivref."?: string;
  "Referanse"?: string;
  csvFormat?: "bank";
}

// Convert Norwegian number format to minor units
function convertAmountToMinorUnits(amountStr: string): number {
  // Remove spaces, replace comma with dot, remove dots (thousands separators)
  // Also handle negative amounts (they have a minus sign in the CSV)
  let cleaned = amountStr.trim().replace(/\s/g, "");
  
  // Extract and remove minus sign (amounts are stored as positive, type field determines expense/income)
  const isNegative = cleaned.startsWith("-");
  if (isNegative) {
    cleaned = cleaned.substring(1); // Remove the minus sign
  }
  
  // Convert Norwegian format (1.582,50) to standard format (1582.50)
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  
  const majorUnits = parseFloat(cleaned);
  
  if (isNaN(majorUnits)) {
    throw new Error(`Invalid amount: ${amountStr}`);
  }

  // Convert to minor units (øre) - always return positive (type field determines expense/income)
  return Math.round(majorUnits * 100);
}

// Parse Norwegian date format (DD.MM.YYYY) to YYYY-MM-DD
// Also handles already-converted dates (YYYY-MM-DD)
function parseNorwegianDate(dateStr: string): string {
  // If already in YYYY-MM-DD format, return as-is
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateStr;
  }
  
  // Otherwise, parse from DD.MM.YYYY format
  const parts = dateStr.split(".");
  if (parts.length === 3) {
    const day = parts[0].padStart(2, "0");
    const month = parts[1].padStart(2, "0");
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }
  throw new Error(`Invalid date format: ${dateStr}`);
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

    console.log(`Received ${transactions.length} transactions for import`);
    if (transactions.length > 0) {
      console.log("Sample transaction:", JSON.stringify(transactions[0], null, 2));
    }

    const supabase = getSupabaseServiceClient();

    // Process transactions
    const transactionsToInsert = [];
    const errors: string[] = [];

    for (const csvTxn of transactions) {
      try {
        // Determine if expense or income
        // Ut field contains expenses (with minus sign), Inn field contains income
        const isExpense = !!csvTxn.Ut;
        const amountStr = isExpense ? csvTxn.Ut : csvTxn.Inn;

        console.log(`Processing transaction: Ut="${csvTxn.Ut}", Inn="${csvTxn.Inn}", isExpense=${isExpense}, amountStr="${amountStr}"`);

        if (!amountStr || !csvTxn["Bokført dato"]) {
          const errorMsg = `Missing required fields: amountStr="${amountStr}", date="${csvTxn["Bokført dato"]}"`;
          console.error(errorMsg);
          errors.push(`Missing required fields for transaction: ${csvTxn["Arkivref."] || "unknown"}`);
          continue;
        }

        // Convert amount to minor units (function handles minus sign and Norwegian format)
        let amount: number;
        try {
          amount = convertAmountToMinorUnits(amountStr);
          console.log(`Converted amount: "${amountStr}" -> ${amount} (minor units)`);
        } catch (err) {
          console.error(`Error converting amount "${amountStr}":`, err);
          errors.push(`Invalid amount format: ${amountStr}`);
          continue;
        }

        // Parse date
        let transactionDate: string;
        try {
          transactionDate = parseNorwegianDate(csvTxn["Bokført dato"]);
          console.log(`Parsed date: "${csvTxn["Bokført dato"]}" -> "${transactionDate}"`);
        } catch (err) {
          console.error(`Error parsing date "${csvTxn["Bokført dato"]}":`, err);
          errors.push(`Invalid date format: ${csvTxn["Bokført dato"]}`);
          continue;
        }

        // Extract counterparty from description (often the first part before semicolon or comma)
        let counterparty: string | null = null;
        const description = csvTxn["Forklarende tekst"] || "";
        
        // Try to extract counterparty (e.g., "Tripletex AS", "Rafid Hoda", etc.)
        // Many Norwegian bank descriptions have the counterparty name first
        if (description) {
          // Split by common separators and take first part
          const parts = description.split(/[;:]/);
          if (parts[0]) {
            counterparty = parts[0].trim();
            // Remove common prefixes like "054011345..." (card numbers)
            if (counterparty && counterparty.match(/^\d{15,}/)) {
              // This looks like a card number, try next part
              counterparty = parts[1]?.trim() || description.split(" ").slice(-2).join(" ") || null;
            }
          }
        }

        // Detect salary payments: transfers to "Rafid Hoda" are salary
        const counterpartyLower = (counterparty || "").toLowerCase();
        const descriptionLower = description.toLowerCase();
        const isSalary = counterpartyLower.includes("rafid hoda") || 
                        counterpartyLower.includes("rafid") ||
                        descriptionLower.includes("salary") ||
                        (csvTxn["Transaksjonstype"] === "Overføring innland" && counterpartyLower.includes("rafid"));

        transactionsToInsert.push({
          type: isExpense ? "expense" : "income",
          amount: amount,
          currency: "nok", // Norwegian bank statements are in NOK
          transaction_date: transactionDate,
          source_type: "bank",
          source_reference: csvTxn["Arkivref."] || csvTxn["Referanse"] || `bank_${transactionDate}_${amount}_${Math.random().toString(36).substr(2, 9)}`,
          archive_reference: csvTxn["Arkivref."] || null,
          bank_reference: csvTxn["Referanse"] || null,
          counterparty: counterparty,
          description: description || null,
          transaction_type: csvTxn["Transaksjonstype"] || null,
          category: (csvTxn as any).category || (isSalary ? "salary" : null),
          project_id: (csvTxn as any).project_id || null,
        });
      } catch (err) {
        errors.push(
          `Error processing transaction ${csvTxn["Arkivref."] || csvTxn["Referanse"] || "unknown"}: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    }

    console.log(`Processed ${transactionsToInsert.length} valid transactions out of ${transactions.length} total`);
    console.log(`Errors:`, errors);

    if (transactionsToInsert.length === 0) {
      return NextResponse.json(
        { error: "No valid transactions to import", errors },
        { status: 400 }
      );
    }

    // Check for existing transactions first (due to partial unique index)
    // Check by archive_reference for bank transactions
    const archiveRefs = transactionsToInsert
      .map((t) => t.archive_reference)
      .filter(Boolean);
    
    const existingRefs = new Set<string>();
    if (archiveRefs.length > 0) {
      const { data: existing, error: checkError } = await supabase
        .from("transactions")
        .select("archive_reference")
        .eq("source_type", "bank")
        .in("archive_reference", archiveRefs);

      if (checkError) {
        console.error("Error checking existing transactions:", checkError);
      } else {
        (existing || []).forEach((t: any) => {
          if (t.archive_reference) existingRefs.add(t.archive_reference);
        });
      }
    }

    // Also check by source_reference for transactions without archive_reference
    const sourceRefs = transactionsToInsert
      .map((t) => t.source_reference)
      .filter(Boolean);
    
    if (sourceRefs.length > 0) {
      const { data: existingBySource, error: checkError2 } = await supabase
        .from("transactions")
        .select("source_reference")
        .eq("source_type", "bank")
        .in("source_reference", sourceRefs);

      if (!checkError2) {
        (existingBySource || []).forEach((t: any) => {
          if (t.source_reference) existingRefs.add(t.source_reference);
        });
      }
    }

    const newTransactions = transactionsToInsert.filter((t: any) => {
      if (t.archive_reference && existingRefs.has(t.archive_reference)) {
        return false;
      }
      if (t.source_reference && existingRefs.has(t.source_reference)) {
        return false;
      }
      return true;
    });

    if (newTransactions.length === 0) {
      return NextResponse.json({
        success: true,
        imported: 0,
        skipped: transactionsToInsert.length,
        message: "All transactions already exist",
      });
    }

    // Detect if multiple transactions share the same archive_reference
    // If so, set archive_reference to null to avoid constraint violations
    const archiveRefCounts = new Map<string, number>();
    newTransactions.forEach((t: any) => {
      if (t.archive_reference) {
        archiveRefCounts.set(t.archive_reference, (archiveRefCounts.get(t.archive_reference) || 0) + 1);
      }
    });

    const finalTransactions = newTransactions.map((t: any) => {
      const archiveRefCount = t.archive_reference ? archiveRefCounts.get(t.archive_reference) || 0 : 0;
      const useArchiveRef = archiveRefCount === 1; // Only use if unique

      return {
        ...t,
        archive_reference: useArchiveRef ? t.archive_reference : null,
      };
    });

    // Insert only new transactions
    const { error: insertError } = await supabase
      .from("transactions")
      .insert(finalTransactions);

    if (insertError) {
      console.error("Error inserting transactions:", insertError);
      return NextResponse.json(
        { error: insertError.message, errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imported: finalTransactions.length,
      skipped: transactionsToInsert.length - finalTransactions.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Error importing bank CSV:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to import transactions",
      },
      { status: 500 }
    );
  }
}

