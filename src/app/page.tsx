"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { SignInButton } from "@/components/SignInButton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DashboardData {
  year: number;
  summary: {
    totalIncomeNOK: number;
    totalExpensesNOK: number;
    totalProfitNOK: number;
    totalSalaryNOK: number;
    salaryByCurrency: Record<string, number>;
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
  // Initialize year from localStorage or default to current year
  const [year, setYear] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const savedYear = localStorage.getItem("dashboardYear");
      if (savedYear) {
        const yearNum = parseInt(savedYear, 10);
        if (yearNum === 2025 || yearNum === 2026) {
          return yearNum;
        }
      }
    }
    return new Date().getFullYear();
  });
  // Initialize currency from localStorage or default to NOK
  const [displayCurrency, setDisplayCurrency] = useState<"NOK" | "USD">(() => {
    if (typeof window !== "undefined") {
      const savedCurrency = localStorage.getItem("dashboardCurrency");
      if (savedCurrency === "USD" || savedCurrency === "NOK") {
        return savedCurrency;
      }
    }
    return "NOK";
  });
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
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to fetch dashboard data");
        }

        const data = await response.json();
        
        // Only update dashboardData if we got valid data
        if (data && data.summary) {
          setDashboardData(data);
        } else {
          console.error("Invalid data received from API:", data);
          // Keep previous data if new data is invalid
        }
      } catch (error) {
        console.error("Error fetching dashboard:", error);
        // Don't clear dashboardData on error - keep showing previous data
        // This prevents the flash of 0s
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

  // Exchange rate: USD to NOK (same as API)
  const USD_TO_NOK_RATE = 10.5;

  // Convert amount to display currency
  const convertToDisplayCurrency = (amount: number, fromCurrency: string): number => {
    if (displayCurrency === fromCurrency.toUpperCase()) {
      return amount;
    }
    if (displayCurrency === "USD" && fromCurrency.toUpperCase() === "NOK") {
      return amount / USD_TO_NOK_RATE;
    }
    if (displayCurrency === "NOK" && fromCurrency.toUpperCase() === "USD") {
      return amount * USD_TO_NOK_RATE;
    }
    return amount;
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  // Prepare chart data: convert all currencies to display currency and aggregate by month
  const prepareChartData = () => {
    if (!dashboardData) return [];
    
    const monthMap: Record<string, { income: number; expenses: number; profit: number }> = {};

    dashboardData.monthlyBreakdown.forEach((month) => {
      if (!monthMap[month.month]) {
        monthMap[month.month] = { income: 0, expenses: 0, profit: 0 };
      }

      month.currencies.forEach((currencyData) => {
        // Convert to display currency
        const incomeConverted = convertToDisplayCurrency(currencyData.income, currencyData.currency);
        const expensesConverted = convertToDisplayCurrency(currencyData.expenses, currencyData.currency);
        const profitConverted = convertToDisplayCurrency(currencyData.profit, currencyData.currency);

        monthMap[month.month].income += incomeConverted;
        monthMap[month.month].expenses += expensesConverted;
        monthMap[month.month].profit += profitConverted;
      });
    });

    // Convert to array and sort by month
    return Object.entries(monthMap)
      .map(([month, data]) => ({
        month: formatMonth(month),
        monthKey: month, // For sorting
        income: Math.round(data.income * 100) / 100,
        expenses: Math.round(data.expenses * 100) / 100,
        profit: Math.round(data.profit * 100) / 100,
      }))
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  };

  if (!user) {
    const errorParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("error") : null;
    let errorMessage = null;
    
    if (errorParam === "unauthorized") {
      errorMessage = "Access denied. Your email is not authorized to access this application.";
    } else if (errorParam === "noemail") {
      errorMessage = "Unable to retrieve email from Google account.";
    } else if (errorParam === "auth") {
      errorMessage = "Authentication failed. Please try again.";
    }
    
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-col items-center gap-8 text-center">
          <h1 className="text-5xl font-bold tracking-tight text-black dark:text-zinc-50">
            Hoda Labs
          </h1>
          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-4 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
              {errorMessage}
            </div>
          )}
          <SignInButton />
        </main>
      </div>
    );
  }

  // Show full loading screen only on initial load (no dashboardData yet)
  if (loading && !dashboardData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <div className="text-zinc-600 dark:text-zinc-400">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black relative">
      {/* Loading overlay - shows on top of existing data when switching years */}
      {loading && dashboardData && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-10 flex items-center justify-center">
          <div className="rounded-lg bg-white dark:bg-gray-800 px-6 py-4 shadow-lg">
            <div className="text-zinc-600 dark:text-zinc-400">Loading...</div>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-4xl font-bold tracking-tight text-black dark:text-zinc-50">
            Revenue Dashboard
          </h1>
          <div className="flex gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setYear(2025);
                  if (typeof window !== "undefined") {
                    localStorage.setItem("dashboardYear", "2025");
                  }
                }}
                disabled={loading}
                className={`rounded-lg px-4 py-2 font-medium transition-colors ${
                  year === 2025
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                2025
              </button>
              <button
                onClick={() => {
                  setYear(2026);
                  if (typeof window !== "undefined") {
                    localStorage.setItem("dashboardYear", "2026");
                  }
                }}
                disabled={loading}
                className={`rounded-lg px-4 py-2 font-medium transition-colors ${
                  year === 2026
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                2026
              </button>
            </div>
            <div className="flex gap-2 border-l border-gray-300 dark:border-gray-700 pl-4">
              <button
                onClick={() => {
                  setDisplayCurrency("NOK");
                  if (typeof window !== "undefined") {
                    localStorage.setItem("dashboardCurrency", "NOK");
                  }
                }}
                disabled={loading}
                className={`rounded-lg px-4 py-2 font-medium transition-colors ${
                  displayCurrency === "NOK"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                NOK
              </button>
              <button
                onClick={() => {
                  setDisplayCurrency("USD");
                  if (typeof window !== "undefined") {
                    localStorage.setItem("dashboardCurrency", "USD");
                  }
                }}
                disabled={loading}
                className={`rounded-lg px-4 py-2 font-medium transition-colors ${
                  displayCurrency === "USD"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                USD
              </button>
            </div>
          </div>
        </div>

        {!dashboardData ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
            <p className="text-zinc-600 dark:text-zinc-400">No data available for {year}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards - Combined Total in Display Currency */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Total Income</p>
                <p className="mt-2 text-3xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(convertToDisplayCurrency(dashboardData.summary.totalIncomeNOK, "NOK"), displayCurrency)}
                </p>
                {Object.entries(dashboardData.summary.incomeByCurrency).map(([currency, amount]) => (
                  <p key={currency} className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {formatCurrency(convertToDisplayCurrency(amount, currency), displayCurrency)}
                  </p>
                ))}
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Total Expenses</p>
                <p className="mt-2 text-3xl font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(convertToDisplayCurrency(dashboardData.summary.totalExpensesNOK, "NOK"), displayCurrency)}
                </p>
                {Object.entries(dashboardData.summary.expensesByCurrency).map(([currency, amount]) => (
                  <p key={currency} className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {formatCurrency(convertToDisplayCurrency(amount, currency), displayCurrency)}
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
                  {formatCurrency(convertToDisplayCurrency(dashboardData.summary.totalProfitNOK, "NOK"), displayCurrency)}
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

            {/* Salary Expenses Card (for tax tracking) */}
            {dashboardData.summary.totalSalaryNOK > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Salary Expenses (Taxable)
                </p>
                <p className="mt-2 text-3xl font-bold text-amber-700 dark:text-amber-300">
                  {formatCurrency(convertToDisplayCurrency(dashboardData.summary.totalSalaryNOK, "NOK"), displayCurrency)}
                </p>
                {Object.entries(dashboardData.summary.salaryByCurrency).map(([currency, amount]) => (
                  <p key={currency} className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                    {formatCurrency(convertToDisplayCurrency(amount, currency), displayCurrency)}
                  </p>
                ))}
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Track this separately for tax reporting purposes
                </p>
              </div>
            )}

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
                                {formatCurrency(convertToDisplayCurrency(currencyData.income, currencyData.currency), displayCurrency)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-sm text-right text-gray-900 dark:text-zinc-50">
                                {formatCurrency(convertToDisplayCurrency(currencyData.expenses, currencyData.currency), displayCurrency)}
                              </td>
                              <td
                                className={`whitespace-nowrap px-4 py-3 text-sm text-right font-medium ${
                                  currencyData.profit >= 0
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-red-600 dark:text-red-400"
                                }`}
                              >
                                {formatCurrency(convertToDisplayCurrency(currencyData.profit, currencyData.currency), displayCurrency)}
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
                  
                  {/* Chart */}
                  <div className="mb-6 h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={prepareChartData()}>
                        <CartesianGrid 
                          strokeDasharray="3 3" 
                          stroke="currentColor" 
                          className="opacity-30"
                        />
                        <XAxis 
                          dataKey="month" 
                          tick={{ fill: 'currentColor', fontSize: 12 }}
                          className="text-gray-600 dark:text-gray-400"
                        />
                        <YAxis 
                          tick={{ fill: 'currentColor', fontSize: 12 }}
                          className="text-gray-600 dark:text-gray-400"
                          tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                        />
                        <Tooltip 
                          contentStyle={{
                            backgroundColor: 'var(--tooltip-bg, rgba(255, 255, 255, 0.95))',
                            border: '1px solid var(--tooltip-border, #e5e7eb)',
                            borderRadius: '8px',
                            color: 'var(--tooltip-text, #000)',
                          }}
                          formatter={(value: number | undefined) => 
                            value !== undefined ? formatCurrency(value, displayCurrency) : ""
                          }
                          labelStyle={{ color: 'currentColor' }}
                        />
                        <Legend 
                          wrapperStyle={{ color: 'currentColor' }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="income" 
                          stroke="#22c55e" 
                          strokeWidth={2}
                          dot={{ r: 4, fill: "#22c55e" }}
                          activeDot={{ r: 6 }}
                          name="Income"
                        />
                        <Line 
                          type="monotone" 
                          dataKey="expenses" 
                          stroke="#ef4444" 
                          strokeWidth={2}
                          dot={{ r: 4, fill: "#ef4444" }}
                          activeDot={{ r: 6 }}
                          name="Expenses"
                        />
                        <Line 
                          type="monotone" 
                          dataKey="profit" 
                          stroke="#3b82f6" 
                          strokeWidth={2}
                          dot={{ r: 4, fill: "#3b82f6" }}
                          activeDot={{ r: 6 }}
                          name="Profit"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Table */}
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
                                {formatCurrency(convertToDisplayCurrency(currencyData.income, currencyData.currency), displayCurrency)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-sm text-right text-gray-900 dark:text-zinc-50">
                                {formatCurrency(convertToDisplayCurrency(currencyData.expenses, currencyData.currency), displayCurrency)}
                              </td>
                              <td
                                className={`whitespace-nowrap px-4 py-3 text-sm text-right font-medium ${
                                  currencyData.profit >= 0
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-red-600 dark:text-red-400"
                                }`}
                              >
                                {formatCurrency(convertToDisplayCurrency(currencyData.profit, currencyData.currency), displayCurrency)}
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
