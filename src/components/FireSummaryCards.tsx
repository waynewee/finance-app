import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Flame,
  Landmark,
  Settings,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { MONTHS } from "../data/defaultCategories";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import {
  calculateFireProjection,
  getFireCalculationLookbackMonths,
  type FireProjectionSnapshot,
} from "../lib/fire";
import { type FireSettings } from "../lib/netWorthRepository";
import {
  maskDisplayValue,
  maskInlineNumbers,
} from "../lib/valueMasking";

interface LatestSnapshot {
  year: number;
  monthIndex: number;
  total: number;
}

interface Props {
  hideValues: boolean;
  fireSettings: FireSettings;
  snapshots: FireProjectionSnapshot[];
  latestSnapshot: LatestSnapshot | null;
  onUpdateFireSettings: (settings: FireSettings) => void;
}

interface ProgressBarConfig {
  fillPercent: number;
  fillClassName: string;
  label: string;
  labelClassName: string;
}

interface SummaryCard {
  label: string;
  value: string;
  subtitle?: string;
  helper: string;
  icon: LucideIcon;
  accent: string;
  progressBar?: ProgressBarConfig;
}

function parseNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalDate(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatYears(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "More than 100 years";
  }

  if (value <= 0) {
    return "Reached";
  }

  return `${value.toFixed(1)} years`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatMonthlyEquivalentFromOneOff(value: number): string {
  return formatCurrency(value / 12);
}

function formatMonthPeriod(year: number, monthIndex: number): string {
  return `${MONTHS[monthIndex]} ${year}`;
}

function formatFireDate(
  latestSnapshot: LatestSnapshot | null,
  yearsToFire: number | null,
): string | null {
  if (
    !latestSnapshot ||
    yearsToFire == null ||
    !Number.isFinite(yearsToFire) ||
    yearsToFire <= 0
  ) {
    return null;
  }

  const totalMonths =
    latestSnapshot.year * 12 +
    latestSnapshot.monthIndex +
    Math.round(yearsToFire * 12);
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12;

  return formatMonthPeriod(targetYear, targetMonthIndex);
}

function compareSnapshotsDesc(
  left: LatestSnapshot,
  right: LatestSnapshot,
): number {
  return right.year - left.year || right.monthIndex - left.monthIndex;
}

function getProgressBarConfig(fundedPercent: number): ProgressBarConfig {
  const fillPercent = Math.min(Math.max(fundedPercent, 0), 100);

  if (fundedPercent >= 100) {
    return {
      fillPercent,
      fillClassName: "from-emerald-500 via-green-500 to-lime-400",
      label: "Goal reached",
      labelClassName: "text-emerald-700",
    };
  }

  if (fundedPercent >= 75) {
    return {
      fillPercent,
      fillClassName: "from-lime-500 via-green-500 to-emerald-500",
      label: "Closing in",
      labelClassName: "text-green-700",
    };
  }

  if (fundedPercent >= 40) {
    return {
      fillPercent,
      fillClassName: "from-amber-400 via-orange-400 to-orange-500",
      label: "Building momentum",
      labelClassName: "text-orange-700",
    };
  }

  return {
    fillPercent,
    fillClassName: "from-red-500 via-orange-500 to-amber-400",
    label: "Early progress",
    labelClassName: "text-red-700",
  };
}

type FireSettingsDraft = Pick<
  FireSettings,
  | "annualSpendingGoal"
  | "withdrawalRate"
  | "expectedAnnualReturn"
  | "dateOfBirth"
  | "targetFireAge"
  | "predictedDeathAge"
  | "annualBonusAmount"
  | "annualBonusMonthAdded"
  | "nonRecurringBonusAmount"
  | "nonRecurringBonusMonthAdded"
>;

function getFireSettingsDraft(fireSettings: FireSettings): FireSettingsDraft {
  return {
    annualSpendingGoal: fireSettings.annualSpendingGoal,
    withdrawalRate: fireSettings.withdrawalRate,
    expectedAnnualReturn: fireSettings.expectedAnnualReturn,
    dateOfBirth: fireSettings.dateOfBirth,
    targetFireAge: fireSettings.targetFireAge,
    predictedDeathAge: fireSettings.predictedDeathAge,
    annualBonusAmount: fireSettings.annualBonusAmount,
    annualBonusMonthAdded: fireSettings.annualBonusMonthAdded,
    nonRecurringBonusAmount: fireSettings.nonRecurringBonusAmount,
    nonRecurringBonusMonthAdded: fireSettings.nonRecurringBonusMonthAdded,
  };
}

function FireSettingsModal({
  fireSettings,
  onClose,
  onSave,
}: {
  fireSettings: FireSettings;
  onClose: () => void;
  onSave: (draft: FireSettingsDraft) => void;
}) {
  const [draft, setDraft] = useState<FireSettingsDraft>(() =>
    getFireSettingsDraft(fireSettings),
  );

  useBodyScrollLock(true);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 px-4 py-4 backdrop-blur-sm sm:items-center">
      <div className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              FIRE Settings
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Tune FIRE assumptions and the trailing-12-month savings
              inference.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-gray-600"
            aria-label="Close FIRE settings"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto overscroll-contain px-6 py-5">
          <div className="space-y-3">
            <label className="block rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="text-xs uppercase tracking-wide text-gray-400">
                Spending goal
              </span>
              <input
                type="number"
                min="0"
                step="1000"
                value={draft.annualSpendingGoal}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    annualSpendingGoal: parseNumber(event.target.value),
                  }))
                }
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
            </label>
            <label className="block rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="text-xs uppercase tracking-wide text-gray-400">
                Withdrawal rate (%)
              </span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={draft.withdrawalRate}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    withdrawalRate: parseNumber(event.target.value),
                  }))
                }
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
            </label>
            <label className="block rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="text-xs uppercase tracking-wide text-gray-400">
                Expected annual return (%)
              </span>
              <input
                type="number"
                step="0.1"
                value={draft.expectedAnnualReturn}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    expectedAnnualReturn: parseNumber(event.target.value),
                  }))
                }
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
            </label>
            <label className="block rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="text-xs uppercase tracking-wide text-gray-400">
                Date of birth
              </span>
              <input
                type="date"
                value={draft.dateOfBirth ?? ""}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    dateOfBirth: parseOptionalDate(event.target.value),
                  }))
                }
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
            </label>
            <label className="block rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="text-xs uppercase tracking-wide text-gray-400">
                Target FIRE age
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={draft.targetFireAge ?? ""}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    targetFireAge: parseOptionalNumber(event.target.value),
                  }))
                }
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
            </label>
            <label className="block rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="text-xs uppercase tracking-wide text-gray-400">
                Predicted death age
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={draft.predictedDeathAge ?? ""}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    predictedDeathAge: parseOptionalNumber(event.target.value),
                  }))
                }
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
            <span className="text-xs uppercase tracking-wide text-gray-400">
              <b>Recurring</b> annual bonus or large amount
            </span>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              Removes this amount from the trailing 12-month window and adds
              back a normalized monthly equivalent.
            </p>
            <input
              type="number"
              min="0"
              step="1000"
              value={draft.annualBonusAmount}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  annualBonusAmount: parseNumber(event.target.value),
                }))
              }
              className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
            />
            <div className="mt-3">
              <label className="block text-xs text-gray-500">
                Month received
              </label>
              <input
                type="month"
                value={draft.annualBonusMonthAdded ?? ""}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    annualBonusMonthAdded: event.target.value || null,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
            <span className="text-xs uppercase tracking-wide text-gray-400">
              <b>Non-recurring</b> bonus or large amount
            </span>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              Fully removes this one-time amount from the trailing window
              without adding anything back.
            </p>
            <input
              type="number"
              min="0"
              step="1000"
              value={draft.nonRecurringBonusAmount}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  nonRecurringBonusAmount: parseNumber(event.target.value),
                }))
              }
              className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
            />
            <div className="mt-3">
              <label className="block text-xs text-gray-500">
                Month received
              </label>
              <input
                type="month"
                value={draft.nonRecurringBonusMonthAdded ?? ""}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    nonRecurringBonusMonthAdded: event.target.value || null,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="rounded-xl bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:from-orange-600 hover:to-red-600"
          >
            Save FIRE Settings
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FireSummaryCards({
  hideValues,
  fireSettings,
  snapshots,
  latestSnapshot,
  onUpdateFireSettings,
}: Props) {
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const savingsLookbackMonths = getFireCalculationLookbackMonths();

  const orderedSnapshots = useMemo(
    () => [...snapshots].sort(compareSnapshotsDesc),
    [snapshots],
  );

  const {
    hasEnoughSavingsHistory,
    projection,
    missingSavingsHistoryCount,
    ttmRangeLabel,
    oldestSavingsSnapshot,
    selectedMonthLabel,
  } = useMemo(() => {
    const selectedSnapshotIndex = orderedSnapshots.findIndex(
      (snapshot) =>
        snapshot.year === latestSnapshot?.year &&
        snapshot.monthIndex === latestSnapshot?.monthIndex,
    );
    const priorSnapshots =
      latestSnapshot != null && selectedSnapshotIndex >= 0
        ? orderedSnapshots.slice(
            selectedSnapshotIndex + 1,
            selectedSnapshotIndex + 1 + savingsLookbackMonths,
          )
        : [];
    const nextHasEnoughSavingsHistory =
      priorSnapshots.length === savingsLookbackMonths;
    const savingsInferenceSnapshots = nextHasEnoughSavingsHistory
      ? priorSnapshots
      : [];
    const nextProjection = latestSnapshot
      ? calculateFireProjection(latestSnapshot.total, fireSettings, {
          currentSnapshot: latestSnapshot,
          previousSnapshots: savingsInferenceSnapshots,
        })
      : null;
    const nextSelectedMonthLabel = latestSnapshot
      ? formatMonthPeriod(latestSnapshot.year, latestSnapshot.monthIndex)
      : "No snapshot yet";
    const nextOldestSavingsSnapshot =
      savingsInferenceSnapshots[savingsInferenceSnapshots.length - 1] ?? null;
    const nextMissingSavingsHistoryCount = Math.max(
      savingsLookbackMonths - priorSnapshots.length,
      0,
    );
    const nextTtmRangeLabel =
      nextOldestSavingsSnapshot && latestSnapshot
        ? `${formatMonthPeriod(
            nextOldestSavingsSnapshot.year,
            nextOldestSavingsSnapshot.monthIndex,
          )} to ${nextSelectedMonthLabel}`
        : "the trailing 12 months";

    return {
      hasEnoughSavingsHistory: nextHasEnoughSavingsHistory,
      projection: nextProjection,
      missingSavingsHistoryCount: nextMissingSavingsHistoryCount,
      ttmRangeLabel: nextTtmRangeLabel,
      oldestSavingsSnapshot: nextOldestSavingsSnapshot,
      selectedMonthLabel: nextSelectedMonthLabel,
    };
  }, [orderedSnapshots, latestSnapshot, fireSettings, savingsLookbackMonths]);

  const handleSaveSettings = (draft: FireSettingsDraft) => {
    onUpdateFireSettings({ ...fireSettings, ...draft });
    setShowSettingsModal(false);
  };

  const displayCurrency = (value: number): string =>
    maskDisplayValue(formatCurrency(value), hideValues);
  const displayPercent = (value: number): string =>
    maskDisplayValue(formatPercent(value), hideValues);
  const displayInlineText = (text: string): string =>
    maskInlineNumbers(text, hideValues);

  if (!latestSnapshot || !projection) {
    return (
      <section className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 px-6 py-5">
        <div className="flex items-center gap-2 text-amber-800">
          <Flame size={18} />
          <h3 className="text-base font-semibold text-gray-900">
            No FIRE snapshot yet
          </h3>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          Add at least one month of net worth data to see your FIRE Number,
          Current Progress, and Time to FIRE.
        </p>
      </section>
    );
  }

  const fundedPercent = Math.max(0, (projection.fundedRatio ?? 0) * 100);
  const progressBar = getProgressBarConfig(fundedPercent);
  const contributionSummary =
    !hasEnoughSavingsHistory || projection.currentMonthlyContribution == null
      ? `Add ${missingSavingsHistoryCount} earlier net worth ${missingSavingsHistoryCount === 1 ? "month" : "months"} to calculate your trailing 12-month savings rate.`
      : fireSettings.annualBonusAmount > 0 ||
          fireSettings.nonRecurringBonusAmount > 0
        ? (() => {
            const parts: string[] = [];
            if (fireSettings.annualBonusAmount > 0) {
              parts.push(
                `removing ${formatCurrency(fireSettings.annualBonusAmount)} recurring annual inflow (normalized to ${formatMonthlyEquivalentFromOneOff(fireSettings.annualBonusAmount)}/mo)`,
              );
            }
            if (fireSettings.nonRecurringBonusAmount > 0) {
              parts.push(
                `removing ${formatCurrency(fireSettings.nonRecurringBonusAmount)} non-recurring amount entirely`,
              );
            }
            return `${formatCurrency(projection.currentMonthlyContribution)} per month from TTM (${ttmRangeLabel}) after ${parts.join(" and ")}.`;
          })()
        : `${formatCurrency(projection.currentMonthlyContribution)} per month averaged across trailing 12 months from ${oldestSavingsSnapshot ? formatMonthPeriod(oldestSavingsSnapshot.year, oldestSavingsSnapshot.monthIndex) : "n/a"} to ${selectedMonthLabel}.`;
  const timeToFireEligible =
    hasEnoughSavingsHistory && projection.currentMonthlyContribution != null;
  const timeToFireDate = timeToFireEligible
    ? formatFireDate(latestSnapshot, projection.yearsToFire)
    : null;
  const timeToFireValue = timeToFireEligible
    ? projection.yearsToFire == null && fireSettings.predictedDeathAge != null
      ? `Not by age ${fireSettings.predictedDeathAge}`
      : (timeToFireDate ?? formatYears(projection.yearsToFire))
    : "- years";
  const timeToFireSubtitle = timeToFireDate
    ? formatYears(projection.yearsToFire)
    : undefined;

  const cards: SummaryCard[] = [
    {
      label: "FIRE Number",
      value: displayCurrency(projection.fireNumber ?? 0),
      helper: displayInlineText(
        `${formatCurrency(fireSettings.annualSpendingGoal)} spending at ${formatPercent(fireSettings.withdrawalRate)}`,
      ),
      icon: Flame,
      accent: "from-amber-500/20 to-red-500/10 text-orange-700",
    },
    {
      label: "Current Progress",
      value: displayPercent(fundedPercent),
      helper: displayInlineText(
        `${formatCurrency(projection.gapToGoal ?? 0)} still to go from ${formatCurrency(projection.accessibleNetWorth ?? 0)} net worth today`,
      ),
      icon: Landmark,
      accent: "from-orange-500/15 to-red-500/10 text-red-700",
      progressBar,
    },
    {
      label: "Time To FIRE",
      value: maskDisplayValue(timeToFireValue, hideValues),
      subtitle: timeToFireSubtitle
        ? maskDisplayValue(timeToFireSubtitle, hideValues)
        : undefined,
      helper: displayInlineText(
        `${contributionSummary} ${formatPercent(fireSettings.expectedAnnualReturn)} expected annual return.`,
      ),
      icon: TrendingUp,
      accent: "from-orange-400/20 to-amber-500/10 text-orange-700",
    },
  ];

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-gradient-to-br from-orange-500 via-amber-500 to-red-500 p-2 shadow-sm">
            <Flame size={16} className="text-white" />
          </div>
          <h2 className="text-base font-semibold text-gray-900">
            FIRE Progress
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setShowSettingsModal(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
        >
          <Settings size={15} />
          FIRE Settings
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.label}
              className="rounded-2xl border border-gray-200 bg-white p-4"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-500">
                    {card.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">
                    {card.value}
                  </p>
                  {card.subtitle ? (
                    <p className="mt-0.5 text-xs font-medium text-gray-400">
                      {card.subtitle}
                    </p>
                  ) : null}
                </div>
                <div
                  className={`rounded-2xl bg-gradient-to-br p-3 ${card.accent}`}
                >
                  <Icon size={18} />
                </div>
              </div>
              <p className="text-sm leading-6 text-gray-500">{card.helper}</p>
              {card.progressBar ? (
                <div className="mt-4">
                  <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${card.progressBar.fillClassName}`}
                      style={{ width: `${card.progressBar.fillPercent}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                    <span className={card.progressBar.labelClassName}>
                      {card.progressBar.label}
                    </span>
                    <span>{formatPercent(card.progressBar.fillPercent)}</span>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {!hasEnoughSavingsHistory ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={14} className="mr-1.5 inline-block" />
          {missingSavingsHistoryCount > 0
            ? `The time-to-FIRE estimate uses a trailing 12-month calculation, but there is not enough earlier history yet. Add ${missingSavingsHistoryCount} more recorded ${missingSavingsHistoryCount === 1 ? "month" : "months"} to use it.`
            : "Not enough history is available to calculate the trailing 12-month savings rate."}
        </div>
      ) : null}

      {showSettingsModal ? (
        <FireSettingsModal
          fireSettings={fireSettings}
          onClose={() => setShowSettingsModal(false)}
          onSave={handleSaveSettings}
        />
      ) : null}
    </section>
  );
}
