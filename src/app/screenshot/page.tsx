"use client";

import { useState } from "react";

interface Transaction {
  stripe_payment_id: string;
  amount: number;
  currency: string;
  date?: string;
  customer_email?: string;
  status?: string;
  exists?: boolean; // Flag to indicate if transaction already exists
}

export default function ScreenshotPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setTransactions([]);
      setError(null);
      setSuccess(false);
    }
  };

  const processScreenshot = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Convert image to base64
      const base64 = await fileToBase64(file);

      const response = await fetch("/api/process-screenshot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: base64,
          mimeType: file.type,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to process screenshot");
      }

      const extractedTransactions = data.transactions || [];

      // Check which transactions already exist in Supabase using API endpoint
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
            console.error("Check duplicates API error:", errorData);
            throw new Error(errorData.error || "Failed to check duplicates");
          }

          const checkData = await checkResponse.json();
          const matchedExtractedIds = checkData.matchedExtractedIds || [];
          const matchDetails = checkData.matchDetails || [];
          
          // Create a Set of matched extracted IDs (case-insensitive)
          const matchedIdsSet = new Set(
            matchedExtractedIds.map((id: string) => id.toLowerCase().trim())
          );
          
          console.log("Matched transactions:", matchedExtractedIds.length, "out of", extractedTransactions.length);
          if (matchDetails.length > 0) {
            console.log("Match details:", matchDetails);
          }

          // Mark transactions that already exist
          const transactionsWithFlags = extractedTransactions.map((t: Transaction) => {
            const normalizedId = t.stripe_payment_id.toLowerCase().trim();
            const exists = matchedIdsSet.has(normalizedId);
            
            if (exists) {
              const matchDetail = matchDetails.find(
                (detail: any) => detail.extractedId.toLowerCase().trim() === normalizedId
              );
              if (matchDetail) {
                console.log(
                  `✓ Matched: ${t.stripe_payment_id} → ${matchDetail.matchedId} (${matchDetail.matchType})`
                );
              }
            } else {
              console.log(`✗ NOT found in DB: ${t.stripe_payment_id} (${t.amount} ${t.currency})`);
            }
            
            return {
              ...t,
              exists,
            };
          });

          setTransactions(transactionsWithFlags);
        } catch (checkError) {
          console.error("Error checking duplicates:", checkError);
          // If check fails, still show transactions but without exists flags
          setTransactions(extractedTransactions);
        }
      } else {
        setTransactions(extractedTransactions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process screenshot");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    // Only save transactions that don't already exist
    const newTransactions = transactions.filter((t) => !t.exists);

    if (newTransactions.length === 0) {
      setError("All transactions already exist in the database");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/save-transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transactions: newTransactions }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save transactions");
      }

      setSuccess(true);
      setTransactions([]);
      setFile(null);
      setPreview(null);
      // Reset file input
      const fileInput = document.getElementById("file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save transactions");
    } finally {
      setSaving(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data:image/...;base64, prefix
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const formatAmount = (amount: number, currency: string) => {
    return `${currency.toUpperCase()} ${amount.toLocaleString()}`;
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-8 text-4xl font-bold tracking-tight text-black dark:text-zinc-50">
          Upload Transaction Screenshot
        </h1>

        {/* File Upload */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <label
            htmlFor="file-input"
            className="mb-4 block text-sm font-medium text-black dark:text-zinc-50"
          >
            Select Screenshot
          </label>
          <input
            id="file-input"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700 dark:text-gray-400"
          />

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

        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 dark:bg-red-900/20 dark:border-red-800">
            <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
            <p className="text-red-700 dark:text-red-300 mt-1">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="mb-6 rounded-lg bg-green-50 border border-green-200 p-4 dark:bg-green-900/20 dark:border-green-800">
            <p className="text-green-800 dark:text-green-200 font-medium">Success!</p>
            <p className="text-green-700 dark:text-green-300 mt-1">
              Transactions saved to database
            </p>
          </div>
        )}

        {/* Preview Table */}
        {transactions.length > 0 && (() => {
          const newTransactions = transactions.filter((t) => !t.exists);
          const existingCount = transactions.length - newTransactions.length;

          return (
            <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
              <div className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                      Preview ({transactions.length} transactions)
                    </h2>
                    {existingCount > 0 && (
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                        {newTransactions.length} new, {existingCount} already exist
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleConfirm}
                    disabled={saving || newTransactions.length === 0}
                    className="rounded-lg bg-green-600 px-6 py-2 text-white font-medium transition-colors hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? "Saving..." : `Save ${newTransactions.length} New`}
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
                      {transactions[0]?.customer_email && (
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Customer
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                    {transactions.map((transaction, index) => (
                      <tr
                        key={index}
                        className={transaction.exists ? "bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500" : ""}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-zinc-50">
                          <div className="flex items-center gap-2">
                            {transaction.stripe_payment_id}
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
                        {transaction.customer_email && (
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            {transaction.customer_email}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

