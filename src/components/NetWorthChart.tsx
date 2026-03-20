import { useEffect, useState } from "react";
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
  type TooltipItem,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { type Category, MONTHS } from "../data/defaultCategories";
import { type MonthlyData } from "../lib/netWorthRepository";
import { HIDDEN_VALUE } from "../lib/valueMasking";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
);

interface Props {
  hideValues: boolean;
  categories: Category[];
  monthlyData: MonthlyData;
  getCategoryMonthTotal: (
    year: number,
    monthIndex: number,
    categoryId: string,
  ) => number;
  getMonthTotal: (year: number, monthIndex: number) => number;
}

interface TimelinePoint {
  year: number;
  monthIndex: number;
  label: string;
  value: string;
}

type QuickRangePreset = "3M" | "6M" | "YTD";

const CATEGORY_COLORS = [
  "#2ca01c", // QuickBooks green
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
];

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000)
    return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function withOpacity(hexColor: string, alpha: string): string {
  return `${hexColor}${alpha}`;
}

function formatMonthLabel(year: number, monthIndex: number): string {
  return `${MONTHS[monthIndex]} ${year}`;
}

function formatMonthValue(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function buildTimeline(monthlyData: MonthlyData): TimelinePoint[] {
  const entries = Object.entries(monthlyData)
    .flatMap(([year, months]) =>
      Object.keys(months ?? {}).map((monthIndex) => ({
        year: Number(year),
        monthIndex: Number(monthIndex),
      })),
    )
    .filter(
      (entry) =>
        Number.isInteger(entry.year) &&
        Number.isInteger(entry.monthIndex) &&
        entry.monthIndex >= 0 &&
        entry.monthIndex <= 11,
    )
    .sort(
      (left, right) =>
        left.year - right.year || left.monthIndex - right.monthIndex,
    );

  if (entries.length === 0) {
    return [];
  }

  const firstEntry = entries[0];
  const lastEntry = entries[entries.length - 1];
  const timeline: TimelinePoint[] = [];
  let year = firstEntry.year;
  let monthIndex = firstEntry.monthIndex;

  while (
    year < lastEntry.year ||
    (year === lastEntry.year && monthIndex <= lastEntry.monthIndex)
  ) {
    timeline.push({
      year,
      monthIndex,
      label: formatMonthLabel(year, monthIndex),
      value: formatMonthValue(year, monthIndex),
    });

    monthIndex += 1;
    if (monthIndex > 11) {
      monthIndex = 0;
      year += 1;
    }
  }

  return timeline;
}

export default function NetWorthChart({
  hideValues,
  categories,
  monthlyData,
  getCategoryMonthTotal,
  getMonthTotal,
}: Props) {
  const timeline = buildTimeline(monthlyData);
  const latestPoint = timeline[timeline.length - 1] ?? null;
  const defaultEndValue = latestPoint?.value ?? "";
  const defaultStartValue = latestPoint
    ? timeline[Math.max(0, timeline.length - 6)].value
    : "";
  const [startMonth, setStartMonth] = useState(defaultStartValue);
  const [endMonth, setEndMonth] = useState(defaultEndValue);
  const [selectedPreset, setSelectedPreset] = useState<QuickRangePreset | null>(
    null,
  );

  useEffect(() => {
    if (timeline.length === 0) {
      if (startMonth !== "") {
        setStartMonth("");
      }
      if (endMonth !== "") {
        setEndMonth("");
      }
      return;
    }

    const hasStart = timeline.some((point) => point.value === startMonth);
    const hasEnd = timeline.some((point) => point.value === endMonth);
    let nextStart = hasStart ? startMonth : defaultStartValue;
    let nextEnd = hasEnd ? endMonth : defaultEndValue;
    const nextStartIndex = timeline.findIndex(
      (point) => point.value === nextStart,
    );
    const nextEndIndex = timeline.findIndex((point) => point.value === nextEnd);

    if (nextStartIndex > nextEndIndex) {
      nextStart = nextEnd;
    }

    if (nextStart !== startMonth) {
      setStartMonth(nextStart);
    }
    if (nextEnd !== endMonth) {
      setEndMonth(nextEnd);
    }
  }, [defaultEndValue, defaultStartValue, endMonth, startMonth, timeline]);

  const startIndex = timeline.findIndex((point) => point.value === startMonth);
  const endIndex = timeline.findIndex((point) => point.value === endMonth);
  const selectedTimeline =
    startIndex >= 0 && endIndex >= startIndex
      ? timeline.slice(startIndex, endIndex + 1)
      : [];
  const hasAnyData = selectedTimeline.some(
    (point) => getMonthTotal(point.year, point.monthIndex) !== 0,
  );

  const applyTrailingRange = (months: number) => {
    if (!latestPoint) {
      return;
    }

    const nextEndIndex = timeline.length - 1;
    const nextStartIndex = Math.max(0, nextEndIndex - (months - 1));
    setStartMonth(timeline[nextStartIndex].value);
    setEndMonth(timeline[nextEndIndex].value);
    setSelectedPreset(months === 3 ? "3M" : "6M");
  };

  const applyYearToDateRange = () => {
    if (!latestPoint) {
      return;
    }

    const nextEndIndex = timeline.length - 1;
    const nextStartIndex = timeline.findIndex(
      (point) => point.year === latestPoint.year,
    );

    setStartMonth(timeline[Math.max(0, nextStartIndex)].value);
    setEndMonth(timeline[nextEndIndex].value);
    setSelectedPreset("YTD");
  };

  const handleStartMonthChange = (value: string) => {
    const nextStartIndex = timeline.findIndex((point) => point.value === value);
    const currentEndIndex = timeline.findIndex(
      (point) => point.value === endMonth,
    );
    setStartMonth(value);
    setSelectedPreset(null);

    if (nextStartIndex > currentEndIndex) {
      setEndMonth(value);
    }
  };

  const handleEndMonthChange = (value: string) => {
    const currentStartIndex = timeline.findIndex(
      (point) => point.value === startMonth,
    );
    const nextEndIndex = timeline.findIndex((point) => point.value === value);
    setEndMonth(value);
    setSelectedPreset(null);

    if (nextEndIndex < currentStartIndex) {
      setStartMonth(value);
    }
  };
  const activePreset = selectedPreset;

  if (!hasAnyData) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-700">
              Net Worth Trend
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Choose a custom month range or use the quick presets.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Range
              </span>
              <div className="inline-flex h-[42px] rounded-xl bg-gray-100 p-1">
                <button
                  type="button"
                  onClick={() => applyTrailingRange(3)}
                  className={`flex h-full items-center rounded-lg px-3 text-sm font-medium transition-all ${
                    activePreset === "3M"
                      ? "bg-white text-[#1E7A18] shadow-sm"
                      : "text-gray-500 hover:text-[#1E7A18]"
                  }`}
                >
                  3M
                </button>
                <button
                  type="button"
                  onClick={() => applyTrailingRange(6)}
                  className={`flex h-full items-center rounded-lg px-3 text-sm font-medium transition-all ${
                    activePreset === "6M"
                      ? "bg-white text-[#1E7A18] shadow-sm"
                      : "text-gray-500 hover:text-[#1E7A18]"
                  }`}
                >
                  6M
                </button>
                <button
                  type="button"
                  onClick={applyYearToDateRange}
                  className={`flex h-full items-center rounded-lg px-3 text-sm font-medium transition-all ${
                    activePreset === "YTD"
                      ? "bg-white text-[#1E7A18] shadow-sm"
                      : "text-gray-500 hover:text-[#1E7A18]"
                  }`}
                >
                  YTD
                </button>
              </div>
            </div>

            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-gray-400">
              <span>Start</span>
              <select
                value={startMonth}
                onChange={(event) => handleStartMonthChange(event.target.value)}
                className="block rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 outline-none transition-colors focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
              >
                {timeline.map((point) => (
                  <option key={`start-${point.value}`} value={point.value}>
                    {point.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-gray-400">
              <span>End</span>
              <select
                value={endMonth}
                onChange={(event) => handleEndMonthChange(event.target.value)}
                className="block rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 outline-none transition-colors focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
              >
                {timeline.map((point) => (
                  <option key={`end-${point.value}`} value={point.value}>
                    {point.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-center h-48 rounded-xl border border-dashed border-gray-300 text-gray-400 text-sm mt-4">
          Enter values in the selected range to see the chart
        </div>
      </div>
    );
  }

  const data: ChartData<"line"> = {
    labels: selectedTimeline.map((point) => point.label),
    datasets: categories.map((cat, idx) => {
      const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
      return {
        label: cat.name,
        data: selectedTimeline.map((point) =>
          getCategoryMonthTotal(point.year, point.monthIndex, cat.id),
        ),
        borderColor: color,
        backgroundColor: withOpacity(color, "22"),
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
      };
    }),
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false,
    },
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          color: "#4b5563",
          font: {
            size: 12,
          },
        },
      },
      tooltip: {
        callbacks: {
          label(context: TooltipItem<"line">) {
            const value = context.parsed.y ?? 0;
            return `${context.dataset.label}: ${hideValues ? HIDDEN_VALUE : formatCurrency(value)}`;
          },
          footer(items) {
            const total = items.reduce(
              (sum, item) => sum + (item.parsed.y ?? 0),
              0,
            );
            return `Total: ${hideValues ? HIDDEN_VALUE : formatCurrency(total)}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: "#6b7280",
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: "#6b7280",
          callback(value) {
            return hideValues ? HIDDEN_VALUE : formatCurrency(Number(value));
          },
        },
        grid: {
          color: "#f0f0f0",
        },
      },
    },
  };

  return (
    <div className="rounded-xl border border-gray-200 shadow-sm bg-white p-4">
      <div className="mb-4 flex flex-col gap-4 border-b border-gray-100 pb-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-700">
            Net Worth Trend
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {selectedTimeline[0]?.label} to{" "}
            {selectedTimeline[selectedTimeline.length - 1]?.label}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Range
            </span>
            <div className="inline-flex h-[42px] rounded-xl bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => applyTrailingRange(3)}
                className={`flex h-full items-center rounded-lg px-3 text-sm font-medium transition-all ${
                  activePreset === "3M"
                    ? "bg-white text-[#1E7A18] shadow-sm"
                    : "text-gray-500 hover:text-[#1E7A18]"
                }`}
              >
                3M
              </button>
              <button
                type="button"
                onClick={() => applyTrailingRange(6)}
                className={`flex h-full items-center rounded-lg px-3 text-sm font-medium transition-all ${
                  activePreset === "6M"
                    ? "bg-white text-[#1E7A18] shadow-sm"
                    : "text-gray-500 hover:text-[#1E7A18]"
                }`}
              >
                6M
              </button>
              <button
                type="button"
                onClick={applyYearToDateRange}
                className={`flex h-full items-center rounded-lg px-3 text-sm font-medium transition-all ${
                  activePreset === "YTD"
                    ? "bg-white text-[#1E7A18] shadow-sm"
                    : "text-gray-500 hover:text-[#1E7A18]"
                }`}
              >
                YTD
              </button>
            </div>
          </div>

          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-gray-400">
            <span>Start</span>
            <select
              value={startMonth}
              onChange={(event) => handleStartMonthChange(event.target.value)}
              className="block rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 outline-none transition-colors focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
            >
              {timeline.map((point) => (
                <option key={`start-${point.value}`} value={point.value}>
                  {point.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-gray-400">
            <span>End</span>
            <select
              value={endMonth}
              onChange={(event) => handleEndMonthChange(event.target.value)}
              className="block rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 outline-none transition-colors focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
            >
              {timeline.map((point) => (
                <option key={`end-${point.value}`} value={point.value}>
                  {point.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="h-80">
        <Line data={data} options={options} />
      </div>
    </div>
  );
}
