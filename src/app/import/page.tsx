"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

interface Transaction {
  stripe_payment_id?: string;
  amount: number;
  currency: string;
  date?: string;
  customer_email?: string;
  status?: string;
  exists?: boolean;
  counterparty?: string;
  description?: string;
  bank_reference?: string;
  archive_reference?: string;
  category?: string;
}

interface CSVTransaction {
  // Stripe format
  "PaymentIntent ID"?: string;
  "Created date (UTC)"?: string;
  Amount?: string;
  Currency?: string;
  "Project Name"?: string;
  "Customer Email"?: string;
  Description?: string;
  Status?: string;
  // Bank format
  "Bokført dato"?: string;
  "Forklarende tekst"?: string;
  "Transaksjonstype"?: string;
  Ut?: string; // Outgoing (expenses)
  Inn?: string; // Incoming (income)
  "Arkivref."?: string;
  "Referanse"?: string;
  // Common
  csvFormat?: "stripe" | "bank";
  category?: string;
  project_id?: string;
  exists?: boolean;
}

type ImportMode = "screenshot" | "csv";

export default function ImportPage() {
  const [mode, setMode] = useState<ImportMode>("screenshot");
  
  // Screenshot state
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [aiContext, setAiContext] = useState<string>("");
  
  // CSV state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvTransactions, setCsvTransactions] = useState<CSVTransaction[]>([]);
  const [csvPage, setCsvPage] = useState(0);
  const [csvSelected, setCsvSelected] = useState<Set<number>>(new Set());
  const CSV_PAGE_SIZE = 20;
  
  // Projects state
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  
  // Shared state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // Fetch projects on mount
  useEffect(() => {
    const fetchProjects = async () => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Supabase environment variables are missing");
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await supabase
        .from("projects")
        .select("id, name")
        .order("name");

      if (error) {
        console.error("Error fetching projects:", error);
      } else {
        setProjects(data || []);
      }
    };

    fetchProjects();
  }, []);

  // ========== Screenshot Functions ==========
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    console.log("File selected:", selectedFile?.name, selectedFile?.size);
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setTransactions([]);
      setError(null);
      setSuccess(false);
      setPreviewMode(false);
    } else {
      console.warn("No file selected");
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const processScreenshot = async () => {
    if (!file) {
      setError("Please select a file first");
      return;
    }

    console.log("Starting screenshot processing...", { file: file.name, size: file.size });
    setLoading(true);
    setError(null);
    setSuccess(false);
    setTransactions([]);
    setPreviewMode(false);

    try {
      console.log("Converting file to base64...");
      const base64 = await fileToBase64(file);
      console.log("Base64 conversion complete, length:", base64.length);

      console.log("Sending request to /api/process-screenshot...");
      const response = await fetch("/api/process-screenshot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: base64,
          mimeType: file.type,
          context: aiContext.trim() || undefined,
        }),
      });

      console.log("Response status:", response.status);
      const data = await response.json();
      console.log("Response data:", data);

      if (!response.ok) {
        throw new Error(data.error || "Failed to process screenshot");
      }

      const extractedTransactions = data.transactions || [];
      console.log("Extracted transactions:", extractedTransactions.length);

      // Check which transactions already exist
      if (extractedTransactions.length > 0) {
        try {
          const checkResponse = await fetch("/api/check-duplicates", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ transactions: extractedTransactions }),
          });

          if (!checkResponse.ok) {
            const errorData = await checkResponse.json();
            throw new Error(errorData.error || "Failed to check duplicates");
          }

          const checkData = await checkResponse.json();
          const matchedExtractedIds = checkData.matchedExtractedIds || [];
          const matchedIdsSet = new Set(
            matchedExtractedIds.map((id: string) => id.toLowerCase().trim())
          );

          const transactionsWithFlags = extractedTransactions.map((t: Transaction) => {
            // For bank statements, check archive_reference first, then source_reference
            // For Stripe, check stripe_payment_id
            let identifier = "";
            if (t.archive_reference) {
              identifier = t.archive_reference;
            } else if (t.stripe_payment_id) {
              identifier = t.stripe_payment_id;
            } else if (t.bank_reference) {
              identifier = t.bank_reference;
            }
            const normalizedId = identifier.toLowerCase().trim();
            const exists = matchedIdsSet.has(normalizedId);
            return {
              ...t,
              exists,
            };
          });

          setTransactions(transactionsWithFlags);
          setPreviewMode(true);
        } catch (checkError) {
          console.error("Error checking duplicates:", checkError);
          setTransactions(extractedTransactions);
          setPreviewMode(true);
        }
      } else {
        setTransactions(extractedTransactions);
        setPreviewMode(true);
      }
    } catch (err) {
      console.error("Error processing screenshot:", err);
      setError(err instanceof Error ? err.message : "Failed to process screenshot");
      setTransactions([]);
      setPreviewMode(false);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmScreenshot = async () => {
    const newTransactions = transactions.filter((t) => !t.exists);

    if (newTransactions.length === 0) {
      setError("All transactions already exist in the database");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Detect if user wants expenses based on context
      const contextLower = aiContext.toLowerCase();
      const isExpenseImport = contextLower.includes("expense") || 
                              contextLower.includes("negative") ||
                              contextLower.includes("only expenses");

      // Convert to new schema format
      const transactionsToSave = newTransactions.map((t: any) => {
        // Detect if it's a bank statement (has archive_reference, bank_reference, or doesn't match Stripe format)
        const hasStripeId = t.stripe_payment_id && 
                           (t.stripe_payment_id.startsWith("pi_") || 
                            t.stripe_payment_id.startsWith("ch_") || 
                            t.stripe_payment_id.startsWith("in_"));
        const hasBankRef = t.archive_reference || t.bank_reference;
        const isBankStatement = hasBankRef || (!hasStripeId && (t.counterparty || t.description));

        // Detect salary payments: transfers to "Rafid Hoda" are salary
        const counterpartyLower = (t.counterparty || "").toLowerCase();
        const isSalary = counterpartyLower.includes("rafid hoda") || 
                        counterpartyLower.includes("rafid") ||
                        (t.description && t.description.toLowerCase().includes("salary"));

        // Use manually set category if available, otherwise auto-detect
        const category = t.category || (isSalary ? "salary" : null);

        // For bank statements: use archive_reference if available, otherwise use generated source_reference
        // But only set archive_reference if it was actually extracted (not generated)
        const hasActualArchiveRef = t.archive_reference && 
                                    !t.archive_reference.startsWith("bank_") && 
                                    t.archive_reference.length > 5;
        
        return {
          type: isExpenseImport ? ("expense" as const) : ("income" as const),
          amount: Math.round(t.amount * 100), // Convert to minor units
          currency: t.currency.toLowerCase(),
          transaction_date: t.date || new Date().toISOString().split("T")[0],
          source_type: isBankStatement ? ("bank" as const) : ("stripe" as const),
          source_reference: t.stripe_payment_id || t.archive_reference || t.bank_reference,
          // Only set archive_reference if it was actually extracted from the bank statement
          // Don't use generated composite IDs as archive_reference
          archive_reference: hasActualArchiveRef ? t.archive_reference : null,
          bank_reference: t.bank_reference || null,
          counterparty: t.counterparty || null,
          customer_email: t.customer_email || null,
          description: t.description || null,
          transaction_type: t.description || null, // For bank statements, description often contains transaction type
          category: category, // Use manually set or auto-detected category
        };
      });

      const response = await fetch("/api/save-transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transactions: transactionsToSave }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save transactions");
      }

      setImportResult({
        imported: data.imported || newTransactions.length,
        skipped: data.skipped || 0,
      });

      // Only show success if some were imported
      if (data.imported > 0) {
        setSuccess(true);
      } else {
        setError(`All transactions already exist. ${data.skipped || 0} transactions skipped.`);
      }

      setTransactions([]);
      setFile(null);
      setPreview(null);
      setAiContext("");
      setPreviewMode(false);
      const fileInput = document.getElementById("file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save transactions");
    } finally {
      setSaving(false);
    }
  };

  // ========== CSV Functions ==========
  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setCsvFile(selectedFile);
      setCsvTransactions([]);
      setCsvPage(0); // Reset to first page when new file is selected
      setCsvSelected(new Set()); // Reset selections
      setError(null);
      setSuccess(false);
      setPreviewMode(false);
    }
  };

  // Helper to parse CSV line with delimiter (handles quoted fields)
  const parseCSVLine = (line: string, delimiter: string): string[] => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  // Convert Norwegian date format (DD.MM.YYYY) to YYYY-MM-DD
  const parseNorwegianDate = (dateStr: string): string => {
    const parts = dateStr.split(".");
    if (parts.length === 3) {
      const day = parts[0].padStart(2, "0");
      const month = parts[1].padStart(2, "0");
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
    throw new Error(`Invalid date format: ${dateStr}`);
  };

  // Convert Norwegian number format (1.582,50) to number string
  const parseNorwegianNumber = (numStr: string): string => {
    // Remove spaces, then replace comma with dot, then remove dots (thousands separators)
    let cleaned = numStr.trim().replace(/\s/g, "");
    // If there's a comma, it's the decimal separator
    if (cleaned.includes(",")) {
      // Replace dot with nothing (thousands separator) and comma with dot (decimal)
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    }
    return cleaned;
  };

  // Clean up bank transaction descriptions by removing long numeric prefixes
  const cleanDescription = (description: string): string => {
    if (!description) return "";
    
    let cleaned = description.trim();
    
    // Remove long numeric prefixes (typically 15+ digits) at the start
    // Pattern: "054000775340100020991679053532 Usd 6,18 Name-Cheap.Com"
    // Should become: "Name-Cheap.Com" or "Usd 6,18 Name-Cheap.Com"
    
    // Remove leading long numbers (15+ digits) followed by space
    cleaned = cleaned.replace(/^\d{15,}\s+/g, "");
    
    // If description starts with currency code after cleaning, try to find the vendor name
    // Pattern: "Usd 49,00 Restream, Inc." -> "Restream, Inc."
    // But keep currency info if it's useful: "Usd 49,00 Restream, Inc." -> keep "Restream, Inc." (or maybe "Restream, Inc. (Usd 49,00)")
    
    // For now, just remove the leading long numbers - the rest is usually meaningful
    // If it starts with currency code + amount, that's still useful context
    
    return cleaned.trim() || description; // Return original if we removed everything
  };

  const parseCSV = async (file: File): Promise<CSVTransaction[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split("\n").filter((line) => line.trim());

          if (lines.length < 2) {
            reject(new Error("CSV file is empty or invalid"));
            return;
          }

          // Detect delimiter: check first few lines for semicolons
          const hasSemicolon = lines.some((line) => line.includes(";"));
          const delimiter = hasSemicolon ? ";" : ",";

          // Find the header row (Norwegian bank CSVs have headers on line 4 or 5, not line 0)
          let headerRowIndex = 0;
          let headers: string[] = [];
          let isBankFormat = false;

          // Try to find the header row by looking for known bank CSV columns
          // Check first 10 lines to find the header (Norwegian bank CSVs have headers around line 4-5)
          for (let i = 0; i < Math.min(10, lines.length); i++) {
            const testHeaders = parseCSVLine(lines[i], delimiter).map((h) => h.replace(/^"|"$/g, "").trim());
            // Check for bank CSV columns (try both with and without Norwegian characters for encoding issues)
            const hasBankColumns = testHeaders.some((h) => {
              const hLower = h.toLowerCase();
              return hLower.includes("bokf") && hLower.includes("dato") || // "Bokført dato"
                     h === "Ut" || h.toLowerCase() === "ut" ||
                     h === "Inn" || h.toLowerCase() === "inn" ||
                     h.includes("Arkivref") || h.toLowerCase().includes("arkivref") ||
                     (h.includes("Forklarende") && h.includes("tekst")) ||
                     hLower.includes("forklarende");
            });
            if (hasBankColumns) {
              headerRowIndex = i;
              headers = testHeaders;
              isBankFormat = true;
              break;
            }
          }

          // If we didn't find bank format, try Stripe format (first line)
          if (!isBankFormat) {
            headers = parseCSVLine(lines[0], delimiter).map((h) => h.replace(/^"|"$/g, "").trim());
            headerRowIndex = 0;
          }

          const parsed: CSVTransaction[] = [];

          if (isBankFormat) {
            // Bank CSV format - use flexible matching for encoding issues
            const dateIdx = headers.findIndex((h) => 
              h === "Bokført dato" || (h.toLowerCase().includes("bokf") && h.toLowerCase().includes("dato"))
            );
            const descriptionIdx = headers.findIndex((h) => 
              h === "Forklarende tekst" || (h.toLowerCase().includes("forklarende") && h.toLowerCase().includes("tekst"))
            );
            const transactionTypeIdx = headers.findIndex((h) => 
              h === "Transaksjonstype" || h.toLowerCase().includes("transaksjonstype")
            );
            const utIdx = headers.findIndex((h) => h === "Ut" || h.toLowerCase() === "ut");
            const innIdx = headers.findIndex((h) => h === "Inn" || h.toLowerCase() === "inn");
            const archiveRefIdx = headers.findIndex((h) => 
              h === "Arkivref." || h.toLowerCase().includes("arkivref")
            );
            const referenceIdx = headers.findIndex((h) => 
              h === "Referanse" || h.toLowerCase().includes("referanse")
            );

            if (dateIdx === -1 || (utIdx === -1 && innIdx === -1)) {
              reject(
                new Error(
                  "Bank CSV missing required columns: Bokført dato, and either Ut or Inn"
                )
              );
              return;
            }

            // Skip header rows - start after the header row we found
            const startRow = headerRowIndex + 1;

            for (let i = startRow; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;

              const values = parseCSVLine(line, delimiter);
              if (values.length < headers.length) continue;

              const dateStr = values[dateIdx]?.replace(/^"|"$/g, "").trim() || "";
              const utStr = values[utIdx]?.replace(/^"|"$/g, "").trim() || "";
              const innStr = values[innIdx]?.replace(/^"|"$/g, "").trim() || "";
              const description = values[descriptionIdx]?.replace(/^"|"$/g, "").trim() || "";
              const transactionType = values[transactionTypeIdx]?.replace(/^"|"$/g, "").trim() || "";
              const archiveRef = values[archiveRefIdx]?.replace(/^"|"$/g, "").trim() || "";
              const reference = values[referenceIdx]?.replace(/^"|"$/g, "").trim() || "";

              // Skip if no date or no amount
              if (!dateStr || (!utStr && !innStr)) continue;

              // Determine if expense or income
              const isExpense = !!utStr;
              const amountStr = isExpense ? utStr : innStr;

              // Skip if amount is empty
              if (!amountStr || amountStr === "0" || amountStr === "0,00") continue;

              // Store original date string (API expects original Norwegian format DD.MM.YYYY)
              // The API will parse it - don't convert here

              const transaction: CSVTransaction = {
                "Bokført dato": dateStr,
                "Forklarende tekst": description,
                "Transaksjonstype": transactionType,
                Ut: isExpense ? amountStr : undefined,
                Inn: !isExpense ? amountStr : undefined,
                "Arkivref.": archiveRef || undefined,
                "Referanse": reference || undefined,
                csvFormat: "bank",
              };

              parsed.push(transaction);
            }
          } else {
            // Stripe CSV format
            const paymentIntentIdx = headers.findIndex((h) => h === "PaymentIntent ID");
            const amountIdx = headers.findIndex((h) => h === "Amount");
            const currencyIdx = headers.findIndex((h) => h === "Currency");
            const dateIdx = headers.findIndex(
              (h) => h === "Created date (UTC)" || h.includes("date")
            );

            if (
              paymentIntentIdx === -1 ||
              amountIdx === -1 ||
              currencyIdx === -1 ||
              dateIdx === -1
            ) {
              reject(
                new Error(
                  "CSV missing required columns: PaymentIntent ID, Amount, Currency, Created date (UTC)"
                )
              );
              return;
            }

            for (let i = 1; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;

              const values = parseCSVLine(line, delimiter);

              if (values.length < headers.length) continue;

              const transaction: CSVTransaction = {
                "PaymentIntent ID": values[paymentIntentIdx]?.replace(/^"|"$/g, "").trim() || "",
                "Created date (UTC)": values[dateIdx]?.replace(/^"|"$/g, "").trim() || "",
                Amount: values[amountIdx]?.replace(/^"|"$/g, "").trim() || "",
                Currency: values[currencyIdx]?.replace(/^"|"$/g, "").trim() || "",
                "Project Name": values[headers.findIndex((h) => h === "Project Name")]?.replace(/^"|"$/g, "").trim() || "",
                "Customer Email": values[headers.findIndex((h) => h === "Customer Email")]?.replace(/^"|"$/g, "").trim() || "",
                Description: values[headers.findIndex((h) => h === "Description")]?.replace(/^"|"$/g, "").trim() || "",
                Status: values[headers.findIndex((h) => h === "Status")]?.replace(/^"|"$/g, "").trim() || "",
                csvFormat: "stripe",
              };

              if (
                transaction["PaymentIntent ID"] &&
                transaction.Amount &&
                (!transaction.Status ||
                  transaction.Status.toLowerCase() === "paid" ||
                  transaction.Status.toLowerCase() === "succeeded")
              ) {
                parsed.push(transaction);
              }
            }
          }

          if (parsed.length === 0) {
            reject(new Error("No valid transactions found in CSV file"));
            return;
          }

          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  };

  const processCSV = async () => {
    if (!csvFile) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const parsed = await parseCSV(csvFile);
      
      // Check which transactions already exist
      if (parsed.length > 0) {
        try {
          // Convert CSV transactions to format expected by check-duplicates API
          const transactionsToCheck = parsed.map((csvTxn: CSVTransaction) => {
            if (csvTxn.csvFormat === "bank") {
              const isExpense = !!csvTxn.Ut;
              const amountStr = isExpense ? csvTxn.Ut : csvTxn.Inn;
              const amount = parseFloat(parseNorwegianNumber(amountStr || "0"));
              
              return {
                archive_reference: csvTxn["Arkivref."],
                bank_reference: csvTxn["Referanse"],
                amount: amount,
                currency: "nok",
              };
            } else {
              // Stripe format
              const amount = parseFloat(csvTxn.Amount?.replace(/[^0-9.-]/g, "") || "0");
              const currency = csvTxn.Currency?.toLowerCase() || "usd";
              
              return {
                stripe_payment_id: csvTxn["PaymentIntent ID"],
                amount: amount,
                currency: currency,
              };
            }
          });

          const checkResponse = await fetch("/api/check-duplicates", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ transactions: transactionsToCheck }),
          });

          if (!checkResponse.ok) {
            const errorData = await checkResponse.json();
            throw new Error(errorData.error || "Failed to check duplicates");
          }

          const checkData = await checkResponse.json();
          const matchedExtractedIds = checkData.matchedExtractedIds || [];
          const matchedIdsSet = new Set(
            matchedExtractedIds.map((id: string) => id.toLowerCase().trim())
          );

          const transactionsWithFlags = parsed.map((csvTxn: CSVTransaction) => {
            let identifier = "";
            if (csvTxn.csvFormat === "bank") {
              identifier = csvTxn["Arkivref."] || csvTxn["Referanse"] || "";
            } else {
              identifier = csvTxn["PaymentIntent ID"] || "";
            }
            const normalizedId = identifier.toLowerCase().trim();
            const exists = matchedIdsSet.has(normalizedId);
            return {
              ...csvTxn,
              exists,
            };
          });

          setCsvTransactions(transactionsWithFlags);
          // Select all transactions by default
          setCsvSelected(new Set(transactionsWithFlags.map((_, i) => i)));
          setPreviewMode(true);
        } catch (checkError) {
          console.error("Error checking duplicates:", checkError);
          setCsvTransactions(parsed);
          // Select all transactions by default
          setCsvSelected(new Set(parsed.map((_, i) => i)));
          setPreviewMode(true);
        }
      } else {
        setCsvTransactions(parsed);
        setCsvSelected(new Set());
        setPreviewMode(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse CSV");
    } finally {
      setLoading(false);
    }
  };

  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);

  const handleConfirmCSV = async () => {
    if (csvTransactions.length === 0) return;

    // Filter to only selected transactions
    const selectedTransactions = csvTransactions.filter((_, index) => csvSelected.has(index));
    
    if (selectedTransactions.length === 0) {
      setError("Please select at least one transaction to import");
      return;
    }

    setSaving(true);
    setError(null);
    setImportResult(null);

    try {
      // Determine which API endpoint to use based on CSV format
      const isBankFormat = selectedTransactions[0]?.csvFormat === "bank";
      const endpoint = isBankFormat ? "/api/import-bank-csv" : "/api/import-stripe-csv";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transactions: selectedTransactions }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to import transactions");
      }

      setImportResult({
        imported: data.imported || 0,
        skipped: data.skipped || 0,
      });
      
      // Only show success if some were imported
      if (data.imported > 0) {
        setSuccess(true);
      } else {
        setError(`All transactions already exist. ${data.skipped || 0} transactions skipped.`);
      }

      setCsvTransactions([]);
      setCsvSelected(new Set());
      setCsvFile(null);
      setPreviewMode(false);
      const fileInput = document.getElementById("csv-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import transactions");
    } finally {
      setSaving(false);
    }
  };

  // ========== Shared Display Functions ==========
  const formatAmount = (amount: number, currency: string) => {
    return `${currency.toUpperCase()} ${amount.toLocaleString()}`;
  };

  const formatCsvAmount = (amountStr: string, currency: string) => {
    const cleaned = amountStr.replace(/[^\d,.-]/g, "").replace(",", ".");
    const amount = parseFloat(cleaned);
    if (isNaN(amount)) return "Invalid";
    return `${currency.toUpperCase()} ${amount.toLocaleString()}`;
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toISOString().split("T")[0];
    } catch {
      return dateStr;
    }
  };

  const currentTransactions = mode === "screenshot" ? transactions : csvTransactions;
  const hasTransactions = mode === "screenshot" 
    ? transactions.length > 0 
    : csvTransactions.length > 0;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <div className="mx-auto max-w-full px-4 py-8">
        <h1 className="mb-8 text-4xl font-bold tracking-tight text-black dark:text-zinc-50">
          Import Transactions
        </h1>

        {/* Mode Selector */}
        <div className="mb-6 flex gap-4">
          <button
            onClick={() => {
              setMode("screenshot");
              setPreviewMode(false);
              setError(null);
              setSuccess(false);
            }}
            className={`rounded-lg px-6 py-3 font-medium transition-colors ${
              mode === "screenshot"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            Screenshot
          </button>
          <button
            onClick={() => {
              setMode("csv");
              setPreviewMode(false);
              setError(null);
              setSuccess(false);
            }}
            className={`rounded-lg px-6 py-3 font-medium transition-colors ${
              mode === "csv"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            CSV File
          </button>
        </div>

        {/* Screenshot Upload */}
        {mode === "screenshot" && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <label
              htmlFor="file-input"
              className="mb-4 block text-sm font-medium text-black dark:text-zinc-50"
            >
              Select Screenshot (Bank Statement or Transaction List)
            </label>
            <input
              id="file-input"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700 dark:text-gray-400"
            />

            <div className="mt-4">
              <label
                htmlFor="ai-context"
                className="mb-2 block text-sm font-medium text-black dark:text-zinc-50"
              >
                Additional Instructions (Optional)
              </label>
              <textarea
                id="ai-context"
                value={aiContext}
                onChange={(e) => setAiContext(e.target.value)}
                placeholder="e.g., 'Only import expenses (negative numbers)', 'This is a bank statement for December 2025', 'Ignore transactions before 2025-01-01'"
                rows={3}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-black placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-zinc-50 dark:placeholder-gray-500"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Provide context to help the AI extract the right data. For expenses, mention "only expenses" or "negative numbers only".
              </p>
            </div>

            {preview && (
              <div className="mt-4">
                <img
                  src={preview}
                  alt="Preview"
                  className="max-h-96 rounded-lg border border-gray-200 dark:border-gray-700"
                />
              </div>
            )}

            {file && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  console.log("Extract Transactions button clicked", { file: file.name, loading });
                  processScreenshot();
                }}
                disabled={loading || !file}
                className="mt-4 rounded-lg bg-blue-600 px-6 py-3 text-white font-medium transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Processing..." : "Extract Transactions"}
              </button>
            )}
          </div>
        )}

        {/* CSV Upload */}
        {mode === "csv" && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <label
              htmlFor="csv-input"
              className="mb-4 block text-sm font-medium text-black dark:text-zinc-50"
            >
              Select CSV File
            </label>
            <input
              id="csv-input"
              type="file"
              accept=".csv"
              onChange={handleCsvFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700 dark:text-gray-400"
            />

            {csvFile && (
              <button
                onClick={processCSV}
                disabled={loading}
                className="mt-4 rounded-lg bg-blue-600 px-6 py-3 text-white font-medium transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Processing..." : "Parse CSV"}
              </button>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 dark:bg-red-900/20 dark:border-red-800">
            <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
            <p className="text-red-700 dark:text-red-300 mt-1">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {success && importResult && (
          <div className="mb-6 rounded-lg bg-green-50 border border-green-200 p-4 dark:bg-green-900/20 dark:border-green-800">
            <p className="text-green-800 dark:text-green-200 font-medium">Success!</p>
            <p className="text-green-700 dark:text-green-300 mt-1">
              {importResult.imported} transaction{importResult.imported !== 1 ? "s" : ""} imported successfully
              {importResult.skipped > 0 && (
                <span className="block mt-1">
                  {importResult.skipped} transaction{importResult.skipped !== 1 ? "s" : ""} skipped (already exist)
                </span>
              )}
            </p>
          </div>
        )}

        {/* Preview Table - Screenshot */}
        {previewMode && mode === "screenshot" && transactions.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                    Preview ({transactions.length} transactions)
                  </h2>
                  {transactions.filter((t) => t.exists).length > 0 && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                      {transactions.filter((t) => !t.exists).length} new,{" "}
                      {transactions.filter((t) => t.exists).length} already exist
                    </p>
                  )}
                </div>
                <button
                  onClick={handleConfirmScreenshot}
                  disabled={saving || transactions.filter((t) => !t.exists).length === 0}
                  className="rounded-lg bg-green-600 px-6 py-2 text-white font-medium transition-colors hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving
                    ? "Saving..."
                    : `Save ${transactions.filter((t) => !t.exists).length} New`}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Payment ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Currency
                      </th>
                      {transactions[0]?.date && (
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Date
                        </th>
                      )}
                      {(transactions[0]?.counterparty || transactions[0]?.description) && (
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Details
                        </th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Category
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                    {transactions.map((transaction, index) => {
                      // Use manually set category or auto-detect salary
                      const counterpartyLower = (transaction.counterparty || "").toLowerCase();
                      const autoDetectedSalary = counterpartyLower.includes("rafid hoda") || 
                                               counterpartyLower.includes("rafid") ||
                                               (transaction.description && transaction.description.toLowerCase().includes("salary"));
                      const currentCategory = transaction.category || (autoDetectedSalary ? "salary" : undefined);
                      
                      return (
                        <tr
                          key={index}
                          className={
                            transaction.exists
                              ? "bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500"
                              : ""
                          }
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-zinc-50">
                            <div className="flex items-center gap-2">
                              {transaction.stripe_payment_id || transaction.archive_reference || transaction.bank_reference || "N/A"}
                              {transaction.exists && (
                                <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                                  Exists
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-zinc-50">
                            {formatAmount(transaction.amount, transaction.currency)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            {transaction.currency.toUpperCase()}
                          </td>
                          {transaction.date && (
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                              {transaction.date}
                            </td>
                          )}
                          {(transaction.counterparty || transaction.description) && (
                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                              {transaction.counterparty && (
                                <div className="font-medium">{transaction.counterparty}</div>
                              )}
                              {transaction.description && (
                                <div className="text-xs text-gray-400">{transaction.description}</div>
                              )}
                            </td>
                          )}
                          <td className="whitespace-nowrap px-4 py-3 text-sm">
                            <select
                              value={currentCategory || ""}
                              onChange={(e) => {
                                const updated = [...transactions];
                                updated[index].category = e.target.value || undefined;
                                setTransactions(updated);
                              }}
                              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-zinc-50"
                              disabled={transaction.exists}
                            >
                              <option value="">—</option>
                              <option value="salary">Salary</option>
                              <option value="software">Software</option>
                              <option value="utilities">Utilities</option>
                              <option value="office">Office</option>
                              <option value="travel">Travel</option>
                              <option value="marketing">Marketing</option>
                              <option value="professional">Professional Services</option>
                              <option value="equipment">Equipment</option>
                              <option value="other">Other</option>
                            </select>
                            {currentCategory && (
                              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                {currentCategory === "salary" && "💰"}
                                {currentCategory === "software" && "💻"}
                                {currentCategory === "utilities" && "⚡"}
                                {currentCategory === "office" && "🏢"}
                                {currentCategory === "travel" && "✈️"}
                                {currentCategory === "marketing" && "📢"}
                                {currentCategory === "professional" && "👔"}
                                {currentCategory === "equipment" && "🖥️"}
                                {currentCategory === "other" && "📦"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Preview Table - CSV */}
        {previewMode && mode === "csv" && csvTransactions.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                    Preview ({csvTransactions.length} transactions)
                  </h2>
                  {csvTransactions.filter((t) => t.exists).length > 0 && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                      {csvTransactions.filter((t) => !t.exists).length} new,{" "}
                      {csvTransactions.filter((t) => t.exists).length} already exist
                    </p>
                  )}
                </div>
                <button
                  onClick={handleConfirmCSV}
                  disabled={saving || csvSelected.size === 0}
                  className="rounded-lg bg-green-600 px-6 py-2 text-white font-medium transition-colors hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Importing..." : `Import ${csvSelected.size} Selected Transaction${csvSelected.size !== 1 ? "s" : ""}`}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="w-12 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={csvTransactions.length > 0 && csvSelected.size === csvTransactions.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              // Select all
                              setCsvSelected(new Set(csvTransactions.map((_, i) => i)));
                            } else {
                              // Deselect all
                              setCsvSelected(new Set());
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Date
                      </th>
                      {csvTransactions[0]?.csvFormat === "bank" ? (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Type
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Description
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Amount (NOK)
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Category
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Project
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Archive Ref
                          </th>
                        </>
                      ) : (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Payment ID
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Amount
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Category
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Project
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Customer
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                    {csvTransactions.slice(csvPage * CSV_PAGE_SIZE, (csvPage + 1) * CSV_PAGE_SIZE).map((transaction, index) => {
                      const actualIndex = csvPage * CSV_PAGE_SIZE + index;
                      if (transaction.csvFormat === "bank") {
                        const isExpense = !!transaction.Ut;
                        const amountStr = isExpense ? transaction.Ut : transaction.Inn;
                        const amount = parseFloat(parseNorwegianNumber(amountStr || "0"));
                        
                        // Auto-detect salary category
                        const description = transaction["Forklarende tekst"] || "";
                        const descriptionLower = description.toLowerCase();
                        const autoDetectedSalary = descriptionLower.includes("rafid hoda") || 
                                                  descriptionLower.includes("rafid") ||
                                                  (transaction["Transaksjonstype"] === "Overføring innland" && descriptionLower.includes("rafid"));
                        const currentCategory = transaction.category || (autoDetectedSalary ? "salary" : undefined);
                        
                        return (
                          <tr 
                            key={index}
                            className={
                              transaction.exists
                                ? "bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500"
                                : ""
                            }
                          >
                            <td className="w-12 px-4 py-3">
                              <input
                                type="checkbox"
                                checked={csvSelected.has(actualIndex)}
                                onChange={(e) => {
                                  const newSelected = new Set(csvSelected);
                                  if (e.target.checked) {
                                    newSelected.add(actualIndex);
                                  } else {
                                    newSelected.delete(actualIndex);
                                  }
                                  setCsvSelected(newSelected);
                                }}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                              />
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-zinc-50">
                              <div className="flex items-center gap-2">
                                {transaction["Bokført dato"] || "-"}
                                {transaction.exists && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                                    Exists
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-zinc-50">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                isExpense 
                                  ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" 
                                  : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                              }`}>
                                {isExpense ? "Expense" : "Income"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-zinc-50 max-w-md" title={transaction["Forklarende tekst"] || ""}>
                              <div className="truncate">
                                {cleanDescription(transaction["Forklarende tekst"] || "") || "-"}
                              </div>
                            </td>
                            <td className={`whitespace-nowrap px-4 py-3 text-sm text-right font-medium ${
                              isExpense 
                                ? "text-red-600 dark:text-red-400" 
                                : "text-green-600 dark:text-green-400"
                            }`}>
                              {isExpense ? "-" : "+"} {amount.toLocaleString("no-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm">
                              <select
                                value={currentCategory || ""}
                                onChange={(e) => {
                                  const updated = [...csvTransactions];
                                  updated[actualIndex].category = e.target.value || undefined;
                                  setCsvTransactions(updated);
                                }}
                                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-zinc-50"
                              >
                                <option value="">—</option>
                                <option value="salary">Salary</option>
                                <option value="software">Software</option>
                                <option value="utilities">Utilities</option>
                                <option value="office">Office</option>
                                <option value="travel">Travel</option>
                                <option value="marketing">Marketing</option>
                                <option value="professional">Professional Services</option>
                                <option value="equipment">Equipment</option>
                                <option value="other">Other</option>
                              </select>
                            </td>
                            <td className="px-4 py-3 text-sm min-w-[180px]">
                              {isExpense ? (
                                <select
                                  value={transaction.project_id || ""}
                                  onChange={(e) => {
                                    const updated = [...csvTransactions];
                                    updated[actualIndex].project_id = e.target.value || undefined;
                                    setCsvTransactions(updated);
                                  }}
                                  className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-zinc-50"
                                >
                                  <option value="">—</option>
                                  {projects.map((project) => (
                                    <option key={project.id} value={project.id}>
                                      {project.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                              {transaction["Arkivref."] || transaction["Referanse"] || "-"}
                            </td>
                          </tr>
                        );
                      } else {
                        return (
                          <tr 
                            key={index}
                            className={
                              transaction.exists
                                ? "bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500"
                                : ""
                            }
                          >
                            <td className="w-12 px-4 py-3">
                              <input
                                type="checkbox"
                                checked={csvSelected.has(actualIndex)}
                                onChange={(e) => {
                                  const newSelected = new Set(csvSelected);
                                  if (e.target.checked) {
                                    newSelected.add(actualIndex);
                                  } else {
                                    newSelected.delete(actualIndex);
                                  }
                                  setCsvSelected(newSelected);
                                }}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                              />
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-zinc-50">
                              {formatDate(transaction["Created date (UTC)"] || "")}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-zinc-50">
                              <div className="flex items-center gap-2">
                                {transaction["PaymentIntent ID"] || "-"}
                                {transaction.exists && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                                    Exists
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-zinc-50">
                              {formatCsvAmount(transaction.Amount || "", transaction.Currency || "USD")}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm">
                              <select
                                value={transaction.category || ""}
                                onChange={(e) => {
                                  const updated = [...csvTransactions];
                                  updated[actualIndex].category = e.target.value || undefined;
                                  setCsvTransactions(updated);
                                }}
                                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-zinc-50"
                              >
                                <option value="">—</option>
                                <option value="salary">Salary</option>
                                <option value="software">Software</option>
                                <option value="utilities">Utilities</option>
                                <option value="office">Office</option>
                                <option value="travel">Travel</option>
                                <option value="marketing">Marketing</option>
                                <option value="professional">Professional Services</option>
                                <option value="equipment">Equipment</option>
                                <option value="other">Other</option>
                              </select>
                            </td>
                            <td className="px-4 py-3 text-sm min-w-[180px]">
                              <select
                                value={transaction.project_id || transaction["Project Name"] || ""}
                                onChange={(e) => {
                                  const updated = [...csvTransactions];
                                  // If it's a project ID (UUID format), use it directly
                                  // Otherwise, it's a project name that will be resolved server-side
                                  if (e.target.value && projects.find(p => p.id === e.target.value)) {
                                    updated[actualIndex].project_id = e.target.value;
                                    delete updated[actualIndex]["Project Name"];
                                  } else {
                                    updated[actualIndex]["Project Name"] = e.target.value;
                                    delete updated[actualIndex].project_id;
                                  }
                                  setCsvTransactions(updated);
                                }}
                                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-zinc-50"
                              >
                                <option value="">—</option>
                                {projects.map((project) => (
                                  <option key={project.id} value={project.id}>
                                    {project.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                              {transaction["Customer Email"] || "-"}
                            </td>
                          </tr>
                        );
                      }
                    })}
                  </tbody>
                </table>
                
                {/* Pagination Controls */}
                {csvTransactions.length > CSV_PAGE_SIZE && (
                  <div className="mt-4 flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-700">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Showing {csvPage * CSV_PAGE_SIZE + 1} to {Math.min((csvPage + 1) * CSV_PAGE_SIZE, csvTransactions.length)} of {csvTransactions.length} transactions
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCsvPage(Math.max(0, csvPage - 1))}
                        disabled={csvPage === 0}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        Previous
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.ceil(csvTransactions.length / CSV_PAGE_SIZE) }, (_, i) => {
                          const totalPages = Math.ceil(csvTransactions.length / CSV_PAGE_SIZE);
                          // Show first page, last page, current page, and pages around current
                          if (
                            i === 0 ||
                            i === totalPages - 1 ||
                            (i >= csvPage - 1 && i <= csvPage + 1)
                          ) {
                            return (
                              <button
                                key={i}
                                onClick={() => setCsvPage(i)}
                                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                                  csvPage === i
                                    ? "border-blue-600 bg-blue-600 text-white"
                                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                                }`}
                              >
                                {i + 1}
                              </button>
                            );
                          } else if (i === csvPage - 2 || i === csvPage + 2) {
                            return (
                              <span key={i} className="px-2 text-gray-500 dark:text-gray-400">
                                ...
                              </span>
                            );
                          }
                          return null;
                        })}
                      </div>
                      <button
                        onClick={() => setCsvPage(Math.min(Math.ceil(csvTransactions.length / CSV_PAGE_SIZE) - 1, csvPage + 1))}
                        disabled={csvPage >= Math.ceil(csvTransactions.length / CSV_PAGE_SIZE) - 1}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

