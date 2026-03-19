import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { MONTHS } from "../data/defaultCategories";
import { type FireSnapshotPreference } from "../lib/firePreferences";

interface Props {
  year: number;
  snapshots: Array<{
    year: number;
    monthIndex: number;
    total: number;
  }>;
  comparisonMode: FireSnapshotPreference;
  onComparisonModeChange: (mode: FireSnapshotPreference) => void;
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

function formatMonthPeriod(year: number, monthIndex: number): string {
  return `${MONTHS[monthIndex]} ${year}`;
}

function compareSnapshotsDesc(
  left: { year: number; monthIndex: number },
  right: { year: number; monthIndex: number },
): number {
  return right.year - left.year || right.monthIndex - left.monthIndex;
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

export default function ProgressSummary({
  year,
  snapshots,
  comparisonMode,
  onComparisonModeChange,
}: Props) {
  const availableSnapshots = snapshots
    .filter((snapshot) => snapshot.total !== 0 && snapshot.year <= year)
    .sort(compareSnapshotsDesc);
  const hasSelectedYearData = availableSnapshots.some(
    (snapshot) => snapshot.year === year,
  );

  if (!hasSelectedYearData) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-5 text-sm text-gray-500 shadow-sm">
        Add at least one recorded month in {year} to track summary changes.
      </div>
    );
  }

  const anchorMonthPosition = comparisonMode === "current" ? 0 : 1;

  if (availableSnapshots.length <= anchorMonthPosition) {
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
              onClick={() => onComparisonModeChange("current")}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                comparisonMode === "current"
                  ? "bg-white text-[#1E7A18] shadow-sm"
                  : "text-gray-500 hover:text-[#1E7A18]"
              }`}
            >
              Current month
            </button>
            <button
              type="button"
              onClick={() => onComparisonModeChange("previous")}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                comparisonMode === "previous"
                  ? "bg-white text-[#1E7A18] shadow-sm"
                  : "text-gray-500 hover:text-[#1E7A18]"
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

  const anchorSnapshot = availableSnapshots[anchorMonthPosition];
  const comparisonSnapshot =
    availableSnapshots[anchorMonthPosition + 1] ?? null;
  const includedSnapshots = availableSnapshots
    .slice(anchorMonthPosition)
    .reverse();
  const firstSnapshot = includedSnapshots[0];

  const anchorTotal = anchorSnapshot.total;
  const comparisonTotal = comparisonSnapshot?.total ?? null;
  const firstTotal = firstSnapshot.total;

  const monthOverMonthChange =
    comparisonTotal == null ? 0 : anchorTotal - comparisonTotal;
  const monthOverMonthRate =
    comparisonTotal == null || comparisonTotal === 0
      ? null
      : (monthOverMonthChange / Math.abs(comparisonTotal)) * 100;
  const recordedPeriodChange = anchorTotal - firstTotal;
  const recordedPeriodRate =
    firstTotal === 0
      ? null
      : (recordedPeriodChange / Math.abs(firstTotal)) * 100;

  const averageMonthlyChange =
    includedSnapshots.length < 2
      ? 0
      : includedSnapshots.slice(1).reduce((sum, snapshot, index) => {
          const priorSnapshot = includedSnapshots[index];
          return sum + (snapshot.total - priorSnapshot.total);
        }, 0) /
        (includedSnapshots.length - 1);

  const cards = [
    {
      label:
        comparisonMode === "current"
          ? "Latest Net Worth"
          : "Selected Month Net Worth",
      value: formatCurrency(anchorTotal),
      helper:
        comparisonMode === "current"
          ? `Recorded for ${formatMonthPeriod(anchorSnapshot.year, anchorSnapshot.monthIndex)}`
          : `Using ${formatMonthPeriod(anchorSnapshot.year, anchorSnapshot.monthIndex)} as the comparison month`,
      trendValue: anchorTotal,
    },
    {
      label: "Month-over-Month",
      value: formatSignedCurrency(monthOverMonthChange),
      helper:
        comparisonSnapshot == null
          ? "Add another month to compare"
          : `${formatPercent(monthOverMonthRate)} vs ${formatMonthPeriod(comparisonSnapshot.year, comparisonSnapshot.monthIndex)}`,
      trendValue: monthOverMonthChange,
    },
    {
      label: "Recorded-Period Growth",
      value: formatSignedCurrency(recordedPeriodChange),
      helper: `${formatPercent(recordedPeriodRate)} since ${formatMonthPeriod(firstSnapshot.year, firstSnapshot.monthIndex)}`,
      trendValue: recordedPeriodChange,
    },
    {
      label: "Average Monthly Change",
      value: formatSignedCurrency(averageMonthlyChange),
      helper:
        includedSnapshots.length < 2
          ? "Need two months of data"
          : `Across ${includedSnapshots.length} recorded months through ${formatMonthPeriod(anchorSnapshot.year, anchorSnapshot.monthIndex)}`,
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
            onClick={() => onComparisonModeChange("current")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              comparisonMode === "current"
                ? "bg-white text-[#1E7A18] shadow-sm"
                : "text-gray-500 hover:text-[#1E7A18]"
            }`}
          >
            Current month
          </button>
          <button
            type="button"
            onClick={() => onComparisonModeChange("previous")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              comparisonMode === "previous"
                ? "bg-white text-[#1E7A18] shadow-sm"
                : "text-gray-500 hover:text-[#1E7A18]"
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
