"use client";

import { useState } from "react";

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

export default function CSVUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [transactions, setTransactions] = useState<CSVTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [preview, setPreview] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setTransactions([]);
      setError(null);
      setSuccess(false);
      setPreview(false);
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

          // Parse header
          const headers = lines[0].split(",").map((h) => h.trim());
          
          // Find required columns
          const paymentIntentIdx = headers.findIndex(
            (h) => h === "PaymentIntent ID" || h === "PaymentIntent ID"
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

          // Parse rows
          const parsed: CSVTransaction[] = [];
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Handle CSV with quoted fields
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

            // Only include paid/succeeded transactions
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
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const parsed = await parseCSV(file);
      setTransactions(parsed);
      setPreview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse CSV");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (transactions.length === 0) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/import-stripe-csv", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transactions }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to import transactions");
      }

      setSuccess(true);
      setTransactions([]);
      setFile(null);
      setPreview(false);
      // Reset file input
      const fileInput = document.getElementById("csv-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import transactions");
    } finally {
      setSaving(false);
    }
  };

  const formatAmount = (amountStr: string, currency: string) => {
    // Convert from "3999,00" or "600,00" format to number
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

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-8 text-4xl font-bold tracking-tight text-black dark:text-zinc-50">
          Import Stripe CSV
        </h1>

        {/* File Upload */}
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
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700 dark:text-gray-400"
          />

          {file && (
            <button
              onClick={processCSV}
              disabled={loading}
              className="mt-4 rounded-lg bg-blue-600 px-6 py-3 text-white font-medium transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Processing..." : "Parse CSV"}
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
              {transactions.length} transactions imported successfully
            </p>
          </div>
        )}

        {/* Preview Table */}
        {preview && transactions.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                  Preview ({transactions.length} transactions)
                </h2>
                <button
                  onClick={handleConfirm}
                  disabled={saving}
                  className="rounded-lg bg-green-600 px-6 py-2 text-white font-medium transition-colors hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Importing..." : `Import ${transactions.length} Transactions`}
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
                    {transactions.slice(0, 20).map((transaction, index) => (
                      <tr key={index}>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-zinc-50">
                          {formatDate(transaction["Created date (UTC)"])}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-zinc-50">
                          {transaction["PaymentIntent ID"]}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-zinc-50">
                          {formatAmount(transaction.Amount, transaction.Currency)}
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
                {transactions.length > 20 && (
                  <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 px-4">
                    Showing first 20 of {transactions.length} transactions
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


