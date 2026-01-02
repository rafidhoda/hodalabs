import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabaseClient";

interface CSVTransaction {
  "PaymentIntent ID": string;
  "Created date (UTC)": string;
  Amount: string;
  Currency: string;
  "Project Name"?: string;
  "Customer Email"?: string;
  Description?: string;
  Status?: string;
}

// Convert amount from major units (with comma decimal) to minor units
function convertAmountToMinorUnits(amountStr: string, currency: string): number {
  // Handle formats like "3999,00" or "600,00" or "1,00"
  const cleaned = amountStr.replace(/[^\d,.-]/g, "").replace(",", ".");
  const majorUnits = parseFloat(cleaned);
  
  if (isNaN(majorUnits)) {
    throw new Error(`Invalid amount: ${amountStr}`);
  }

  // Convert to minor units (øre/cents)
  return Math.round(majorUnits * 100);
}

// Parse date string to YYYY-MM-DD format
function parseDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${dateStr}`);
    }
    return date.toISOString().split("T")[0];
  } catch {
    // Try to parse formats like "2025-12-29 18:48:03"
    const parts = dateStr.split(" ")[0];
    if (parts && parts.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return parts;
    }
    throw new Error(`Invalid date format: ${dateStr}`);
  }
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

    const supabase = getSupabaseServiceClient();

    // First, fetch all projects to create a name -> id mapping
    const { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select("id, name");

    if (projectsError) {
      console.error("Error fetching projects:", projectsError);
      return NextResponse.json(
        { error: "Failed to fetch projects" },
        { status: 500 }
      );
    }

    const projectMap = new Map<string, string>();
    (projects || []).forEach((p) => {
      projectMap.set(p.name.toLowerCase().trim(), p.id);
    });

    // Process transactions
    const transactionsToInsert = [];
    const errors: string[] = [];

    for (const csvTxn of transactions) {
      try {
        // Validate required fields
        if (!csvTxn["PaymentIntent ID"] || !csvTxn.Amount || !csvTxn.Currency) {
          errors.push(`Missing required fields for transaction: ${csvTxn["PaymentIntent ID"] || "unknown"}`);
          continue;
        }

        // Convert amount to minor units
        const amount = convertAmountToMinorUnits(csvTxn.Amount, csvTxn.Currency);

        // Parse date
        const transactionDate = parseDate(csvTxn["Created date (UTC)"]);

        // Find project ID by name
        let projectId: string | null = null;
        if (csvTxn["Project Name"]) {
          const projectName = csvTxn["Project Name"].trim();
          projectId = projectMap.get(projectName.toLowerCase()) || null;
          
          if (!projectId && projectName) {
            console.warn(`Project not found: "${projectName}"`);
          }
        }

        transactionsToInsert.push({
          type: "income", // All Stripe transactions are income
          amount: amount,
          currency: csvTxn.Currency.toLowerCase().trim(),
          transaction_date: transactionDate,
          source_type: "stripe",
          source_reference: csvTxn["PaymentIntent ID"].trim(),
          project_id: (csvTxn as any).project_id || projectId,
          customer_email: csvTxn["Customer Email"]?.trim() || null,
          description: csvTxn.Description?.trim() || null,
          category: (csvTxn as any).category || null,
        });
      } catch (err) {
        errors.push(
          `Error processing transaction ${csvTxn["PaymentIntent ID"]}: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    }

    if (transactionsToInsert.length === 0) {
      return NextResponse.json(
        { error: "No valid transactions to import", errors },
        { status: 400 }
      );
    }

    // Check for existing transactions first (due to partial unique index)
    const sourceReferences = transactionsToInsert.map((t) => t.source_reference);
    const { data: existing, error: checkError } = await supabase
      .from("transactions")
      .select("source_reference")
      .eq("source_type", "stripe")
      .in("source_reference", sourceReferences);

    if (checkError) {
      console.error("Error checking existing transactions:", checkError);
      return NextResponse.json(
        { error: "Failed to check for duplicates" },
        { status: 500 }
      );
    }

    const existingRefs = new Set(
      (existing || []).map((t) => t.source_reference)
    );
    const newTransactions = transactionsToInsert.filter(
      (t) => !existingRefs.has(t.source_reference)
    );

    if (newTransactions.length === 0) {
      return NextResponse.json({
        success: true,
        imported: 0,
        skipped: transactionsToInsert.length,
        message: "All transactions already exist",
      });
    }

    // Insert only new transactions
    const { error: insertError } = await supabase
      .from("transactions")
      .insert(newTransactions);

    if (insertError) {
      console.error("Error inserting transactions:", insertError);
      return NextResponse.json(
        { error: insertError.message, errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imported: newTransactions.length,
      skipped: transactionsToInsert.length - newTransactions.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Error importing CSV:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to import transactions",
      },
      { status: 500 }
    );
  }
}

