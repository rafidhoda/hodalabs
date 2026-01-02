"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { SignInButton } from "@/components/SignInButton";

interface DashboardData {
  year: number;
  summary: {
    totalIncomeNOK: number;
    totalExpensesNOK: number;
    totalProfitNOK: number;
    incomeByCurrency: Record<string, number>;
    expensesByCurrency: Record<string, number>;
    profitByCurrency: Record<string, number>;
    exchangeRate?: number;
  };
  projectBreakdown: Array<{
    project_id: string;
    project_name: string;
    currencies: Array<{
      currency: string;
      income: number;
      expenses: number;
      profit: number;
    }>;
  }>;
  monthlyBreakdown: Array<{
    month: string;
    currencies: Array<{
      currency: string;
      income: number;
      expenses: number;
      profit: number;
    }>;
  }>;
  transactionCount: number;
}

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase environment variables are missing");
      setLoading(false);
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Check auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/dashboard?year=${year}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch dashboard data");
        }

        setDashboardData(data);
      } catch (error) {
        console.error("Error fetching dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user, year]);

  const formatCurrency = (amount: number, currency: string = "NOK") => {
    return new Intl.NumberFormat("no-NO", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-col items-center gap-8 text-center">
          <h1 className="text-5xl font-bold tracking-tight text-black dark:text-zinc-50">
            Hoda Labs
          </h1>
          <SignInButton />
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <div className="text-zinc-600 dark:text-zinc-400">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-4xl font-bold tracking-tight text-black dark:text-zinc-50">
            Revenue Dashboard
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => setYear(2025)}
              className={`rounded-lg px-4 py-2 font-medium transition-colors ${
                year === 2025
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              }`}
            >
              2025
            </button>
            <button
              onClick={() => setYear(2026)}
              className={`rounded-lg px-4 py-2 font-medium transition-colors ${
                year === 2026
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              }`}
            >
              2026
            </button>
          </div>
        </div>

        {!dashboardData ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
            <p className="text-zinc-600 dark:text-zinc-400">No data available for {year}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards - Combined Total in NOK */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Total Income</p>
                <p className="mt-2 text-3xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(dashboardData.summary.totalIncomeNOK, "NOK")}
                </p>
                {Object.entries(dashboardData.summary.incomeByCurrency).map(([currency, amount]) => (
                  <p key={currency} className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {formatCurrency(amount, currency)}
                    {currency === "USD" && dashboardData.summary.exchangeRate && (
                      <span className="ml-1 text-xs">
                        (≈ {formatCurrency(amount * dashboardData.summary.exchangeRate, "NOK")})
                      </span>
                    )}
                  </p>
                ))}
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Total Expenses</p>
                <p className="mt-2 text-3xl font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(dashboardData.summary.totalExpensesNOK, "NOK")}
                </p>
                {Object.entries(dashboardData.summary.expensesByCurrency).map(([currency, amount]) => (
                  <p key={currency} className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {formatCurrency(amount, currency)}
                    {currency === "USD" && dashboardData.summary.exchangeRate && (
                      <span className="ml-1 text-xs">
                        (≈ {formatCurrency(amount * dashboardData.summary.exchangeRate, "NOK")})
                      </span>
                    )}
                  </p>
                ))}
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Profit</p>
                <p
                  className={`mt-2 text-3xl font-bold ${
                    dashboardData.summary.totalProfitNOK >= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {formatCurrency(dashboardData.summary.totalProfitNOK, "NOK")}
                </p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {dashboardData.transactionCount} transactions
                </p>
                {dashboardData.summary.exchangeRate && (
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                    USD rate: {dashboardData.summary.exchangeRate} NOK
                  </p>
                )}
              </div>
            </div>

            {/* Project Breakdown */}
            {dashboardData.projectBreakdown.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                <div className="p-6">
                  <h2 className="mb-4 text-xl font-semibold text-black dark:text-zinc-50">
                    Revenue by Project
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Project
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Currency
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Income
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Expenses
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Profit
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                        {dashboardData.projectBreakdown.map((project) =>
                          project.currencies.map((currencyData, idx) => (
                            <tr key={`${project.project_id}-${currencyData.currency}`}>
                              {idx === 0 && (
                                <td
                                  rowSpan={project.currencies.length}
                                  className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 dark:text-zinc-50"
                                >
                                  {project.project_name}
                                </td>
                              )}
                              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                {currencyData.currency}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-sm text-right text-gray-900 dark:text-zinc-50">
                                {formatCurrency(currencyData.income, currencyData.currency)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-sm text-right text-gray-900 dark:text-zinc-50">
                                {formatCurrency(currencyData.expenses, currencyData.currency)}
                              </td>
                              <td
                                className={`whitespace-nowrap px-4 py-3 text-sm text-right font-medium ${
                                  currencyData.profit >= 0
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-red-600 dark:text-red-400"
                                }`}
                              >
                                {formatCurrency(currencyData.profit, currencyData.currency)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Monthly Breakdown */}
            {dashboardData.monthlyBreakdown.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                <div className="p-6">
                  <h2 className="mb-4 text-xl font-semibold text-black dark:text-zinc-50">
                    Monthly Breakdown
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Month
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Currency
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Income
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Expenses
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Profit
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                        {dashboardData.monthlyBreakdown.map((month) =>
                          month.currencies.map((currencyData, idx) => (
                            <tr key={`${month.month}-${currencyData.currency}`}>
                              {idx === 0 && (
                                <td
                                  rowSpan={month.currencies.length}
                                  className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 dark:text-zinc-50"
                                >
                                  {formatMonth(month.month)}
                                </td>
                              )}
                              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                {currencyData.currency}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-sm text-right text-gray-900 dark:text-zinc-50">
                                {formatCurrency(currencyData.income, currencyData.currency)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-sm text-right text-gray-900 dark:text-zinc-50">
                                {formatCurrency(currencyData.expenses, currencyData.currency)}
                              </td>
                              <td
                                className={`whitespace-nowrap px-4 py-3 text-sm text-right font-medium ${
                                  currencyData.profit >= 0
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-red-600 dark:text-red-400"
                                }`}
                              >
                                {formatCurrency(currencyData.profit, currencyData.currency)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
