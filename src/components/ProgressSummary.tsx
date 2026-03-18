import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { MONTHS } from "../data/defaultCategories";

interface Props {
  year: number;
  getMonthTotal: (year: number, monthIndex: number) => number;
}

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

  const latestMonthIndex =
    populatedMonthIndexes[populatedMonthIndexes.length - 1];
  const previousMonthIndex =
    populatedMonthIndexes[populatedMonthIndexes.length - 2] ?? null;
  const firstMonthIndex = populatedMonthIndexes[0];

  const latestTotal = monthlyTotals[latestMonthIndex];
  const previousTotal =
    previousMonthIndex == null ? null : monthlyTotals[previousMonthIndex];
  const firstTotal = monthlyTotals[firstMonthIndex];

  const monthOverMonthChange =
    previousTotal == null ? 0 : latestTotal - previousTotal;
  const monthOverMonthRate =
    previousTotal == null || previousTotal === 0
      ? null
      : (monthOverMonthChange / Math.abs(previousTotal)) * 100;
  const yearToDateChange = latestTotal - firstTotal;
  const yearToDateRate =
    firstTotal === 0 ? null : (yearToDateChange / Math.abs(firstTotal)) * 100;

  const averageMonthlyChange =
    populatedMonthIndexes.length < 2
      ? 0
      : populatedMonthIndexes.slice(1).reduce((sum, monthIndex, index) => {
          const priorMonthIndex = populatedMonthIndexes[index];
          return (
            sum + (monthlyTotals[monthIndex] - monthlyTotals[priorMonthIndex])
          );
        }, 0) /
        (populatedMonthIndexes.length - 1);

  const cards = [
    {
      label: "Latest Net Worth",
      value: formatCurrency(latestTotal),
      helper: `Recorded for ${MONTHS[latestMonthIndex]}`,
      trendValue: latestTotal,
    },
    {
      label: "Month-over-Month",
      value: formatSignedCurrency(monthOverMonthChange),
      helper:
        previousMonthIndex == null
          ? "Add another month to compare"
          : `${formatPercent(monthOverMonthRate)} vs ${MONTHS[previousMonthIndex]}`,
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
        populatedMonthIndexes.length < 2
          ? "Need two months of data"
          : `Across ${populatedMonthIndexes.length} recorded months`,
      trendValue: averageMonthlyChange,
    },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
    </section>
  );
}
