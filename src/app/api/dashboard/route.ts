import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabaseClient";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const year = searchParams.get("year") || new Date().getFullYear().toString();

    const supabase = getSupabaseClient();

    // Use the transaction_summary view for efficient aggregation
    // The year field is a timestamp, so we filter by year start
    const yearStart = `${year}-01-01`;
    const { data: summaryData, error: summaryError } = await supabase
      .from("transaction_summary")
      .select("*")
      .gte("year", yearStart)
      .lt("year", `${parseInt(year) + 1}-01-01`);

    if (summaryError) {
      console.error("Error fetching summary:", summaryError);
      return NextResponse.json(
        { error: summaryError.message },
        { status: 500 }
      );
    }

    console.log(`Dashboard query for year ${year}: Found ${summaryData?.length || 0} summary rows`);
    if (summaryData && summaryData.length > 0) {
      console.log("Sample row:", summaryData[0]);
      const totalInMinorUnits = summaryData
        .filter((r: any) => r.type === "income" && r.currency === "nok")
        .reduce((sum: number, r: any) => sum + Number(r.total_amount), 0);
      console.log(`Total NOK income in minor units: ${totalInMinorUnits}, in major units: ${totalInMinorUnits / 100}`);
    }

    // Get total transaction count for the year
    const { count: transactionCount, error: countError } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .gte("transaction_date", `${year}-01-01`)
      .lte("transaction_date", `${year}-12-31`);

    if (countError) {
      console.error("Error counting transactions:", countError);
    }

    // Exchange rate: USD to NOK (approximate, can be made configurable)
    // Using ~10.5 NOK per USD as a reasonable default for 2025
    const USD_TO_NOK_RATE = 10.5;

    // Process summary data - convert everything to NOK for totals
    const incomeByCurrency: Record<string, number> = {};
    const expensesByCurrency: Record<string, number> = {};
    let totalIncomeNOK = 0;
    let totalExpensesNOK = 0;
    const projectTotals: Record<string, Record<string, { income: number; expenses: number; name: string }>> = {};
    const monthlyTotals: Record<string, Record<string, { income: number; expenses: number }>> = {};

    (summaryData || []).forEach((row: any) => {
      const amount = Number(row.total_amount) / 100; // Convert from minor units to major units
      const currency = row.currency.toUpperCase();
      const month = row.month.substring(0, 7); // YYYY-MM format

      // Convert to NOK for combined totals
      const amountInNOK = currency === "USD" ? amount * USD_TO_NOK_RATE : amount;

      if (row.type === "income") {
        incomeByCurrency[currency] = (incomeByCurrency[currency] || 0) + amount;
        totalIncomeNOK += amountInNOK;

        // Monthly totals by currency
        if (!monthlyTotals[month]) {
          monthlyTotals[month] = {};
        }
        if (!monthlyTotals[month][currency]) {
          monthlyTotals[month][currency] = { income: 0, expenses: 0 };
        }
        monthlyTotals[month][currency].income += amount;

        // Project totals by currency
        if (row.project_id) {
          const projectId = row.project_id;
          if (!projectTotals[projectId]) {
            projectTotals[projectId] = {};
          }
          if (!projectTotals[projectId][currency]) {
            projectTotals[projectId][currency] = {
              income: 0,
              expenses: 0,
              name: row.project_name || "No Project",
            };
          }
          projectTotals[projectId][currency].income += amount;
        }
      } else {
        expensesByCurrency[currency] = (expensesByCurrency[currency] || 0) + amount;
        totalExpensesNOK += amountInNOK;

        // Monthly totals by currency
        if (!monthlyTotals[month]) {
          monthlyTotals[month] = {};
        }
        if (!monthlyTotals[month][currency]) {
          monthlyTotals[month][currency] = { income: 0, expenses: 0 };
        }
        monthlyTotals[month][currency].expenses += amount;

        // Project totals by currency
        if (row.project_id) {
          const projectId = row.project_id;
          if (!projectTotals[projectId]) {
            projectTotals[projectId] = {};
          }
          if (!projectTotals[projectId][currency]) {
            projectTotals[projectId][currency] = {
              income: 0,
              expenses: 0,
              name: row.project_name || "No Project",
            };
          }
          projectTotals[projectId][currency].expenses += amount;
        }
      }
    });

    // Convert project totals to array - group by project, show all currencies
    const projectBreakdown: Array<{
      project_id: string;
      project_name: string;
      currencies: Array<{
        currency: string;
        income: number;
        expenses: number;
        profit: number;
      }>;
    }> = [];

    Object.entries(projectTotals).forEach(([projectId, currencies]) => {
      const projectName = Object.values(currencies)[0]?.name || "No Project";
      const currencyBreakdown = Object.entries(currencies).map(([currency, data]) => ({
        currency,
        income: Math.round(data.income * 100) / 100,
        expenses: Math.round(data.expenses * 100) / 100,
        profit: Math.round((data.income - data.expenses) * 100) / 100,
      }));

      projectBreakdown.push({
        project_id: projectId,
        project_name: projectName,
        currencies: currencyBreakdown,
      });
    });

    // Sort by total income (sum across all currencies)
    projectBreakdown.sort((a, b) => {
      const aTotal = a.currencies.reduce((sum, c) => sum + c.income, 0);
      const bTotal = b.currencies.reduce((sum, c) => sum + c.income, 0);
      return bTotal - aTotal;
    });

    // Convert monthly totals to array - group by month, show all currencies
    const monthlyBreakdown: Array<{
      month: string;
      currencies: Array<{
        currency: string;
        income: number;
        expenses: number;
        profit: number;
      }>;
    }> = [];

    Object.entries(monthlyTotals).forEach(([month, currencies]) => {
      const currencyBreakdown = Object.entries(currencies).map(([currency, data]) => ({
        currency,
        income: Math.round(data.income * 100) / 100,
        expenses: Math.round(data.expenses * 100) / 100,
        profit: Math.round((data.income - data.expenses) * 100) / 100,
      }));

      monthlyBreakdown.push({
        month,
        currencies: currencyBreakdown,
      });
    });

    monthlyBreakdown.sort((a, b) => a.month.localeCompare(b.month));

    return NextResponse.json({
      year: parseInt(year),
      summary: {
        // Combined totals in NOK (USD converted)
        totalIncomeNOK: Math.round(totalIncomeNOK * 100) / 100,
        totalExpensesNOK: Math.round(totalExpensesNOK * 100) / 100,
        totalProfitNOK: Math.round((totalIncomeNOK - totalExpensesNOK) * 100) / 100,
        // Per-currency breakdowns
        incomeByCurrency,
        expensesByCurrency,
        profitByCurrency: Object.keys({ ...incomeByCurrency, ...expensesByCurrency }).reduce(
          (acc, currency) => {
            acc[currency] =
              Math.round(
                ((incomeByCurrency[currency] || 0) - (expensesByCurrency[currency] || 0)) * 100
              ) / 100;
            return acc;
          },
          {} as Record<string, number>
        ),
        exchangeRate: USD_TO_NOK_RATE, // For reference
      },
      projectBreakdown,
      monthlyBreakdown,
      transactionCount: transactionCount || 0,
    });
  } catch (error: any) {
    console.error("Error fetching dashboard data:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to fetch dashboard data",
      },
      { status: 500 }
    );
  }
}

