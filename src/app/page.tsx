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

  // Prepare chart data: convert all currencies to NOK and aggregate by month
  const prepareChartData = () => {
    if (!dashboardData) return [];
    
    const exchangeRate = dashboardData.summary.exchangeRate || 10.5;
    const monthMap: Record<string, { income: number; expenses: number; profit: number }> = {};

    dashboardData.monthlyBreakdown.forEach((month) => {
      if (!monthMap[month.month]) {
        monthMap[month.month] = { income: 0, expenses: 0, profit: 0 };
      }

      month.currencies.forEach((currencyData) => {
        // Convert to NOK
        const incomeNOK = currencyData.currency === "USD" 
          ? currencyData.income * exchangeRate 
          : currencyData.income;
        const expensesNOK = currencyData.currency === "USD"
          ? currencyData.expenses * exchangeRate
          : currencyData.expenses;
        const profitNOK = currencyData.currency === "USD"
          ? currencyData.profit * exchangeRate
          : currencyData.profit;

        monthMap[month.month].income += incomeNOK;
        monthMap[month.month].expenses += expensesNOK;
        monthMap[month.month].profit += profitNOK;
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

            {/* Salary Expenses Card (for tax tracking) */}
            {dashboardData.summary.totalSalaryNOK > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Salary Expenses (Taxable)
                </p>
                <p className="mt-2 text-3xl font-bold text-amber-700 dark:text-amber-300">
                  {formatCurrency(dashboardData.summary.totalSalaryNOK, "NOK")}
                </p>
                {Object.entries(dashboardData.summary.salaryByCurrency).map(([currency, amount]) => (
                  <p key={currency} className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                    {formatCurrency(amount, currency)}
                    {currency === "USD" && dashboardData.summary.exchangeRate && (
                      <span className="ml-1 text-xs">
                        (≈ {formatCurrency(amount * dashboardData.summary.exchangeRate, "NOK")})
                      </span>
                    )}
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
                            value !== undefined ? formatCurrency(value, "NOK") : ""
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
