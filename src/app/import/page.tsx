"use client";

import { useState } from "react";

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
  "PaymentIntent ID": string;
  "Created date (UTC)": string;
  Amount: string;
  Currency: string;
  "Project Name"?: string;
  "Customer Email"?: string;
  Description?: string;
  Status?: string;
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
  
  // Shared state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // ========== Screenshot Functions ==========
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setTransactions([]);
      setError(null);
      setSuccess(false);
      setPreviewMode(false);
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
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const base64 = await fileToBase64(file);

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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to process screenshot");
      }

      const extractedTransactions = data.transactions || [];

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
      setError(err instanceof Error ? err.message : "Failed to process screenshot");
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
      setError(null);
      setSuccess(false);
      setPreviewMode(false);
    }
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

          const headers = lines[0].split(",").map((h) => h.trim());
          const paymentIntentIdx = headers.findIndex(
            (h) => h === "PaymentIntent ID"
          );
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

          const parsed: CSVTransaction[] = [];
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values: string[] = [];
            let current = "";
            let inQuotes = false;

            for (let j = 0; j < line.length; j++) {
              const char = line[j];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === "," && !inQuotes) {
                values.push(current.trim());
                current = "";
              } else {
                current += char;
              }
            }
            values.push(current.trim());

            if (values.length < headers.length) continue;

            const transaction: CSVTransaction = {
              "PaymentIntent ID": values[paymentIntentIdx] || "",
              "Created date (UTC)": values[dateIdx] || "",
              Amount: values[amountIdx] || "",
              Currency: values[currencyIdx] || "",
              "Project Name": values[headers.findIndex((h) => h === "Project Name")] || "",
              "Customer Email": values[headers.findIndex((h) => h === "Customer Email")] || "",
              Description: values[headers.findIndex((h) => h === "Description")] || "",
              Status: values[headers.findIndex((h) => h === "Status")] || "",
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
      setCsvTransactions(parsed);
      setPreviewMode(true);
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

    setSaving(true);
    setError(null);
    setImportResult(null);

    try {
      const response = await fetch("/api/import-stripe-csv", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transactions: csvTransactions }),
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
      <div className="mx-auto max-w-6xl px-4 py-8">
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
                onClick={processScreenshot}
                disabled={loading}
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
                <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                  Preview ({csvTransactions.length} transactions)
                </h2>
                <button
                  onClick={handleConfirmCSV}
                  disabled={saving}
                  className="rounded-lg bg-green-600 px-6 py-2 text-white font-medium transition-colors hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Importing..." : `Import ${csvTransactions.length} Transactions`}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Payment ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Project
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Customer
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                    {csvTransactions.slice(0, 20).map((transaction, index) => (
                      <tr key={index}>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-zinc-50">
                          {formatDate(transaction["Created date (UTC)"])}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-zinc-50">
                          {transaction["PaymentIntent ID"]}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-zinc-50">
                          {formatCsvAmount(transaction.Amount, transaction.Currency)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {transaction["Project Name"] || "(No project)"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {transaction["Customer Email"] || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvTransactions.length > 20 && (
                  <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 px-4">
                    Showing first 20 of {csvTransactions.length} transactions
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

