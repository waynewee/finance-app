import { useEffect, useMemo, useState } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { MONTHS } from "../data/defaultCategories";
import {
  maskDisplayValue,
  maskInlineNumbers,
} from "../lib/valueMasking";

interface Snapshot {
  year: number;
  monthIndex: number;
  total: number;
}

interface Props {
  hideValues: boolean;
  snapshots: Snapshot[];
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

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${monthIndex}`;
}

function monthsBetween(
  start: { year: number; monthIndex: number },
  end: { year: number; monthIndex: number },
): number {
  return (end.year - start.year) * 12 + (end.monthIndex - start.monthIndex);
}

function addMonths(
  point: { year: number; monthIndex: number },
  delta: number,
): { year: number; monthIndex: number } {
  const total = point.year * 12 + point.monthIndex + delta;
  return { year: Math.floor(total / 12), monthIndex: ((total % 12) + 12) % 12 };
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

export default function ProgressSummary({ hideValues, snapshots }: Props) {
  const availableSnapshots = useMemo(
    () =>
      snapshots
        .filter((snapshot) => snapshot.total !== 0)
        .sort(
          (left, right) =>
            left.year - right.year || left.monthIndex - right.monthIndex,
        ),
    [snapshots],
  );

  const [startKey, setStartKey] = useState<string | null>(null);
  const [endKey, setEndKey] = useState<string | null>(null);

  useEffect(() => {
    if (availableSnapshots.length === 0) {
      setStartKey(null);
      setEndKey(null);
      return;
    }

    const keys = new Set(
      availableSnapshots.map((snapshot) =>
        monthKey(snapshot.year, snapshot.monthIndex),
      ),
    );
    const earliest = availableSnapshots[0];
    const latest = availableSnapshots[availableSnapshots.length - 1];

    const today = new Date();
    const previousMonthDate = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      1,
    );
    const previousMonthYear = previousMonthDate.getFullYear();
    const previousMonthIndex = previousMonthDate.getMonth();
    const defaultEnd =
      availableSnapshots
        .filter(
          (snapshot) =>
            snapshot.year < previousMonthYear ||
            (snapshot.year === previousMonthYear &&
              snapshot.monthIndex <= previousMonthIndex),
        )
        .at(-1) ?? latest;

    setStartKey((current) =>
      current && keys.has(current)
        ? current
        : monthKey(earliest.year, earliest.monthIndex),
    );
    setEndKey((current) =>
      current && keys.has(current)
        ? current
        : monthKey(defaultEnd.year, defaultEnd.monthIndex),
    );
  }, [availableSnapshots]);

  if (availableSnapshots.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-5 text-sm text-gray-500 shadow-sm">
        Add at least one recorded month to track net worth growth.
      </div>
    );
  }

  if (availableSnapshots.length < 2 || !startKey || !endKey) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-5 text-sm text-gray-500 shadow-sm">
        Add another recorded month before growth between dates can be shown.
      </div>
    );
  }

  const snapshotByKey = new Map(
    availableSnapshots.map((snapshot) => [
      monthKey(snapshot.year, snapshot.monthIndex),
      snapshot,
    ]),
  );

  const rawStart = snapshotByKey.get(startKey) ?? availableSnapshots[0];
  const rawEnd =
    snapshotByKey.get(endKey) ??
    availableSnapshots[availableSnapshots.length - 1];

  const [startSnapshot, endSnapshot] =
    monthsBetween(rawStart, rawEnd) <= 0 ? [rawEnd, rawStart] : [rawStart, rawEnd];

  const elapsedMonths = Math.max(monthsBetween(startSnapshot, endSnapshot), 0);
  const growth = endSnapshot.total - startSnapshot.total;
  const growthRate =
    startSnapshot.total === 0
      ? null
      : (growth / Math.abs(startSnapshot.total)) * 100;
  const averageMonthlyChange = elapsedMonths > 0 ? growth / elapsedMonths : 0;

  const priorMonthPoint = addMonths(endSnapshot, -1);
  const priorMonthSnapshot = snapshotByKey.get(
    monthKey(priorMonthPoint.year, priorMonthPoint.monthIndex),
  );
  const momChange =
    priorMonthSnapshot != null ? endSnapshot.total - priorMonthSnapshot.total : null;
  const momRate =
    priorMonthSnapshot != null && priorMonthSnapshot.total !== 0
      ? (momChange! / Math.abs(priorMonthSnapshot.total)) * 100
      : null;

  const priorYearPoint = addMonths(endSnapshot, -12);
  const priorYearSnapshot = snapshotByKey.get(
    monthKey(priorYearPoint.year, priorYearPoint.monthIndex),
  );
  const yoyChange =
    priorYearSnapshot != null ? endSnapshot.total - priorYearSnapshot.total : null;
  const yoyRate =
    priorYearSnapshot != null && priorYearSnapshot.total !== 0
      ? (yoyChange! / Math.abs(priorYearSnapshot.total)) * 100
      : null;

  const cards = [
    {
      label: "Net Worth at Start",
      value: formatCurrency(startSnapshot.total),
      helper: formatMonthPeriod(startSnapshot.year, startSnapshot.monthIndex),
      trendValue: startSnapshot.total,
    },
    {
      label: "Net Worth at End",
      value: formatCurrency(endSnapshot.total),
      helper: formatMonthPeriod(endSnapshot.year, endSnapshot.monthIndex),
      trendValue: endSnapshot.total,
    },
    {
      label: "Growth",
      value: formatSignedCurrency(growth),
      helper: `${formatPercent(growthRate)} from ${formatMonthPeriod(startSnapshot.year, startSnapshot.monthIndex)} to ${formatMonthPeriod(endSnapshot.year, endSnapshot.monthIndex)}`,
      trendValue: growth,
    },
    {
      label: "Average Monthly Change",
      value: formatSignedCurrency(averageMonthlyChange),
      helper:
        elapsedMonths > 0
          ? `Across ${elapsedMonths} month${elapsedMonths === 1 ? "" : "s"}`
          : "Select a wider date range",
      trendValue: averageMonthlyChange,
    },
    {
      label: "Month-over-Month Change",
      value: momChange == null ? "N/A" : formatSignedCurrency(momChange),
      helper:
        momChange == null
          ? "No snapshot for the prior month"
          : `${formatPercent(momRate)} vs ${formatMonthPeriod(priorMonthPoint.year, priorMonthPoint.monthIndex)}`,
      trendValue: momChange ?? 0,
    },
    {
      label: "Year-over-Year Change",
      value: yoyChange == null ? "N/A" : formatSignedCurrency(yoyChange),
      helper:
        yoyChange == null
          ? "No snapshot 12 months prior"
          : `${formatPercent(yoyRate)} vs ${formatMonthPeriod(priorYearPoint.year, priorYearPoint.monthIndex)}`,
      trendValue: yoyChange ?? 0,
    },
  ].map((card) => ({
    ...card,
    value: maskDisplayValue(card.value, hideValues),
    helper: maskInlineNumbers(card.helper, hideValues),
  }));

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:gap-6">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <span className="font-medium text-gray-700">From</span>
          <select
            value={startKey}
            onChange={(event) => setStartKey(event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#9FD792] focus:ring-2 focus:ring-[#EEF9EA]"
          >
            {availableSnapshots.map((snapshot) => {
              const key = monthKey(snapshot.year, snapshot.monthIndex);
              return (
                <option key={key} value={key}>
                  {formatMonthPeriod(snapshot.year, snapshot.monthIndex)}
                </option>
              );
            })}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <span className="font-medium text-gray-700">To</span>
          <select
            value={endKey}
            onChange={(event) => setEndKey(event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#9FD792] focus:ring-2 focus:ring-[#EEF9EA]"
          >
            {availableSnapshots.map((snapshot) => {
              const key = monthKey(snapshot.year, snapshot.monthIndex);
              return (
                <option key={key} value={key}>
                  {formatMonthPeriod(snapshot.year, snapshot.monthIndex)}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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

