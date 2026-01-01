"use client";

import { useState } from "react";

export default function TestPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const testConnection = async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/test-openai", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to connect");
      }

      setResult(data.message || "Connection successful!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-8 text-4xl font-bold tracking-tight text-black dark:text-zinc-50">
          Claude API Connection Test
        </h1>

        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <button
            onClick={testConnection}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-6 py-3 text-white font-medium transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Testing..." : "Test Claude Connection"}
          </button>

          {result && (
            <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-4 dark:bg-green-900/20 dark:border-green-800">
              <p className="text-green-800 dark:text-green-200 font-medium">Success!</p>
              <p className="text-green-700 dark:text-green-300 mt-1">{result}</p>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-4 dark:bg-red-900/20 dark:border-red-800">
              <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
              <p className="text-red-700 dark:text-red-300 mt-1">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
