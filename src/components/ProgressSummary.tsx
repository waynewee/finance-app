import { useState } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { MONTHS } from "../data/defaultCategories";

interface Props {
  year: number;
  getMonthTotal: (year: number, monthIndex: number) => number;
}

type ComparisonMode = "current" | "previous";

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatPercent(value: number | null): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) {
    return "N/A";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatSignedCurrency(value: number): string {
  return `${value >= 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`;
}

function TrendIcon({ value }: { value: number }) {
  if (value > 0) {
    return <TrendingUp size={16} className="text-emerald-600" />;
  }

  if (value < 0) {
    return <TrendingDown size={16} className="text-rose-600" />;
  }

  return <Minus size={16} className="text-gray-400" />;
}

function trendTextColor(value: number): string {
  if (value > 0) {
    return "text-emerald-700";
  }

  if (value < 0) {
    return "text-rose-700";
  }

  return "text-gray-600";
}

export default function ProgressSummary({ year, getMonthTotal }: Props) {
  const [comparisonMode, setComparisonMode] =
    useState<ComparisonMode>("current");
  const monthlyTotals = MONTHS.map((_, monthIndex) =>
    getMonthTotal(year, monthIndex),
  );
  const populatedMonthIndexes = monthlyTotals.reduce<number[]>(
    (result, total, monthIndex) => {
      if (total !== 0) {
        result.push(monthIndex);
      }

      return result;
    },
    [],
  );

  if (populatedMonthIndexes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-5 text-sm text-gray-500 shadow-sm">
        Add at least two months of values to track your net worth growth.
      </div>
    );
  }

  const anchorMonthPosition =
    comparisonMode === "current"
      ? populatedMonthIndexes.length - 1
      : populatedMonthIndexes.length - 2;

  if (anchorMonthPosition < 0) {
    return (
      <section className="space-y-4">
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Summary basis</p>
            <p className="mt-1 text-xs text-gray-500">
              Choose whether the cards use the latest recorded month or the one
              before it.
            </p>
          </div>

          <div className="inline-flex rounded-xl bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setComparisonMode("current")}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                comparisonMode === "current"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-gray-500 hover:text-indigo-600"
              }`}
            >
              Current month
            </button>
            <button
              type="button"
              onClick={() => setComparisonMode("previous")}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                comparisonMode === "previous"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-gray-500 hover:text-indigo-600"
              }`}
            >
              Previous month
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-5 text-sm text-gray-500 shadow-sm">
          Add another recorded month before switching the summary to the
          previous month basis.
        </div>
      </section>
    );
  }

  const anchorMonthIndex = populatedMonthIndexes[anchorMonthPosition];
  const comparisonMonthIndex =
    populatedMonthIndexes[anchorMonthPosition - 1] ?? null;
  const firstMonthIndex = populatedMonthIndexes[0];
  const includedMonthIndexes = populatedMonthIndexes.slice(
    0,
    anchorMonthPosition + 1,
  );

  const anchorTotal = monthlyTotals[anchorMonthIndex];
  const comparisonTotal =
    comparisonMonthIndex == null ? null : monthlyTotals[comparisonMonthIndex];
  const firstTotal = monthlyTotals[firstMonthIndex];

  const monthOverMonthChange =
    comparisonTotal == null ? 0 : anchorTotal - comparisonTotal;
  const monthOverMonthRate =
    comparisonTotal == null || comparisonTotal === 0
      ? null
      : (monthOverMonthChange / Math.abs(comparisonTotal)) * 100;
  const yearToDateChange = anchorTotal - firstTotal;
  const yearToDateRate =
    firstTotal === 0 ? null : (yearToDateChange / Math.abs(firstTotal)) * 100;

  const averageMonthlyChange =
    includedMonthIndexes.length < 2
      ? 0
      : includedMonthIndexes.slice(1).reduce((sum, monthIndex, index) => {
          const priorMonthIndex = includedMonthIndexes[index];
          return (
            sum + (monthlyTotals[monthIndex] - monthlyTotals[priorMonthIndex])
          );
        }, 0) /
        (includedMonthIndexes.length - 1);

  const cards = [
    {
      label:
        comparisonMode === "current"
          ? "Latest Net Worth"
          : "Selected Month Net Worth",
      value: formatCurrency(anchorTotal),
      helper:
        comparisonMode === "current"
          ? `Recorded for ${MONTHS[anchorMonthIndex]}`
          : `Using ${MONTHS[anchorMonthIndex]} as the comparison month`,
      trendValue: anchorTotal,
    },
    {
      label: "Month-over-Month",
      value: formatSignedCurrency(monthOverMonthChange),
      helper:
        comparisonMonthIndex == null
          ? "Add another month to compare"
          : `${formatPercent(monthOverMonthRate)} vs ${MONTHS[comparisonMonthIndex]}`,
      trendValue: monthOverMonthChange,
    },
    {
      label: "Year-to-Date Growth",
      value: formatSignedCurrency(yearToDateChange),
      helper: `${formatPercent(yearToDateRate)} since ${MONTHS[firstMonthIndex]}`,
      trendValue: yearToDateChange,
    },
    {
      label: "Average Monthly Change",
      value: formatSignedCurrency(averageMonthlyChange),
      helper:
        includedMonthIndexes.length < 2
          ? "Need two months of data"
          : `Across ${includedMonthIndexes.length} recorded months`,
      trendValue: averageMonthlyChange,
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700">Summary basis</p>
          <p className="mt-1 text-xs text-gray-500">
            Current month uses the latest recorded month. Previous month ignores
            the newest month so you can compare the last fully closed month.
          </p>
        </div>

        <div className="inline-flex rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setComparisonMode("current")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              comparisonMode === "current"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-gray-500 hover:text-indigo-600"
            }`}
          >
            Current month
          </button>
          <button
            type="button"
            onClick={() => setComparisonMode("previous")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              comparisonMode === "previous"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-gray-500 hover:text-indigo-600"
            }`}
          >
            Previous month
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">{card.label}</p>
              <TrendIcon value={card.trendValue} />
            </div>
            <p
              className={`text-2xl font-semibold ${trendTextColor(card.trendValue)}`}
            >
              {card.value}
            </p>
            <p className="mt-2 text-xs text-gray-500">{card.helper}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
