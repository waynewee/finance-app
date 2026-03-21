import { useEffect, useState } from "react";
import {
  Flame,
  Goal,
  Landmark,
  X,
  Settings,
  Settings2,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { MONTHS } from "../data/defaultCategories";
import {
  calculateFireProjection,
  getFireCalculationLookbackMonths,
  getCurrentAgeFromDateOfBirth,
  sanitizeFireSettings,
  type FireProjectionSnapshot,
} from "../lib/fire";
import { type FireSnapshotPreference } from "../lib/firePreferences";
import { type FireSettings } from "../lib/netWorthRepository";
import type {
  RetirementAccountClassification,
  RetirementMemberProjection,
} from "../lib/retirementSystem";
import { getLatestRetirementBalancePeriod } from "../lib/retirementSystem";
import {
  HIDDEN_VALUE,
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
  selectedSnapshot: LatestSnapshot | null;
  previousSnapshot: LatestSnapshot | null;
  snapshotPreference: FireSnapshotPreference;
  onSnapshotPreferenceChange: (preference: FireSnapshotPreference) => void;
  onUpdateFireSettings: (settings: FireSettings) => void;
  onOpenRetirementConfig: () => void;
}

type FireTrackerView = "display" | "settings";

interface ProgressBarConfig {
  fillPercent: number;
  fillClassName: string;
  label: string;
  labelClassName: string;
}

interface SummaryCard {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  accent: string;
  hasSettingsButton?: boolean;
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

function formatNegativeCurrency(value: number): string {
  if (value <= 0) {
    return formatCurrency(0);
  }

  return `-${formatCurrency(value)}`;
}

function formatSignedCurrency(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return formatCurrency(0);
  }

  return value > 0
    ? `+${formatCurrency(value)}`
    : `-${formatCurrency(Math.abs(value))}`;
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

function formatClassification(
  classification: RetirementAccountClassification,
): string {
  if (classification === "semi-liquid") {
    return "Semi-liquid";
  }

  return classification.charAt(0).toUpperCase() + classification.slice(1);
}

function formatMonthPeriod(year: number, monthIndex: number): string {
  return `${MONTHS[monthIndex]} ${year}`;
}

function getDrawdownStartMonth(
  currentAge: number | null,
  targetFireAge: number | null,
  monthsToFire: number | null,
): number | null {
  if (
    currentAge != null &&
    targetFireAge != null &&
    Number.isFinite(currentAge) &&
    Number.isFinite(targetFireAge)
  ) {
    return Math.max(0, Math.ceil((targetFireAge - currentAge) * 12));
  }

  if (monthsToFire == null) {
    return null;
  }

  return monthsToFire + 1;
}

function getProjectionCalendarYear(
  snapshot: LatestSnapshot,
  projectionMonth: number,
): number {
  return (
    snapshot.year + Math.floor((snapshot.monthIndex + projectionMonth) / 12)
  );
}

function compareSnapshotsDesc(
  left: LatestSnapshot,
  right: LatestSnapshot,
): number {
  return right.year - left.year || right.monthIndex - left.monthIndex;
}

function formatAge(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "n/a";
  }

  return value.toFixed(0);
}

function formatMemberIncome(member: RetirementMemberProjection): string {
  return formatCurrency(member.monthlyIncome);
}

export default function FireTracker({
  hideValues,
  fireSettings,
  snapshots,
  selectedSnapshot,
  previousSnapshot,
  snapshotPreference,
  onSnapshotPreferenceChange,
  onUpdateFireSettings,
  onOpenRetirementConfig,
}: Props) {
  const [activeView, setActiveView] = useState<FireTrackerView>("display");
  const [showTimeToFireSettingsModal, setShowTimeToFireSettingsModal] =
    useState(false);
  const [draftFireSettings, setDraftFireSettings] =
    useState<FireSettings>(fireSettings);
  const [draftTimeToFireSettings, setDraftTimeToFireSettings] = useState<
    Pick<FireSettings, "timeToFireAlgorithm" | "annualBonusAmount">
  >({
    timeToFireAlgorithm: fireSettings.timeToFireAlgorithm,
    annualBonusAmount: fireSettings.annualBonusAmount,
  });

  useEffect(() => {
    setDraftFireSettings(fireSettings);
    setDraftTimeToFireSettings({
      timeToFireAlgorithm: fireSettings.timeToFireAlgorithm,
      annualBonusAmount: fireSettings.annualBonusAmount,
    });
  }, [fireSettings]);
  const savingsLookbackMonths = getFireCalculationLookbackMonths();
  const orderedSnapshots = [...snapshots].sort(compareSnapshotsDesc);
  const selectedSnapshotIndex = orderedSnapshots.findIndex(
    (snapshot) =>
      snapshot.year === selectedSnapshot?.year &&
      snapshot.monthIndex === selectedSnapshot?.monthIndex,
  );
  const priorSnapshotsForAverage =
    selectedSnapshot != null && selectedSnapshotIndex >= 0
      ? orderedSnapshots.slice(
          selectedSnapshotIndex + 1,
          selectedSnapshotIndex + 1 + savingsLookbackMonths,
        )
      : [];
  const hasEnoughSavingsHistory =
    priorSnapshotsForAverage.length === savingsLookbackMonths;
  const savingsInferenceSnapshots = hasEnoughSavingsHistory
    ? priorSnapshotsForAverage
    : [];
  const projection = selectedSnapshot
    ? calculateFireProjection(selectedSnapshot.total, fireSettings, {
        currentSnapshot: selectedSnapshot,
        previousSnapshots: savingsInferenceSnapshots,
      })
    : null;
  const currentAge = getCurrentAgeFromDateOfBirth(fireSettings.dateOfBirth);
  const fundedPercent = Math.max(0, (projection?.fundedRatio ?? 0) * 100);
  const progressBar = getProgressBarConfig(fundedPercent);
  const retirementProjection = projection?.retirementProjection ?? null;
  const projectionDeadlineAge = fireSettings.predictedDeathAge;
  const isShowingPreviousMonth =
    snapshotPreference === "previous" && previousSnapshot != null;
  const selectedMonthLabel = selectedSnapshot
    ? formatMonthPeriod(selectedSnapshot.year, selectedSnapshot.monthIndex)
    : "No snapshot yet";
  const oldestSavingsSnapshot =
    savingsInferenceSnapshots[savingsInferenceSnapshots.length - 1] ?? null;
  const missingSavingsHistoryCount = Math.max(
    savingsLookbackMonths - priorSnapshotsForAverage.length,
    0,
  );
  const targetAgeSummary =
    projection?.targetYearsAway == null
      ? "Add your date of birth and target FIRE age in settings."
      : projection.requiredMonthlyContribution == null
        ? "Target age requires a savings level outside the planner range."
        : projection.requiredMonthlyContribution <=
            (projection.currentMonthlyContribution ?? 0)
          ? `On track for age ${fireSettings.targetFireAge}.`
          : `${formatCurrency(projection.requiredMonthlyContribution)} per month needed to reach age ${fireSettings.targetFireAge}.`;
  const targetAgeMathSummary =
    projection?.requiredMonthlyContribution == null
      ? null
      : `This estimate includes growth on today's balances and monthly savings${retirementProjection ? ", plus retirement balances that become usable by your target age" : ""}.`;
  const contributionSummary =
    !selectedSnapshot ||
    !hasEnoughSavingsHistory ||
    projection?.currentMonthlyContribution == null
      ? `Add ${missingSavingsHistoryCount} earlier net worth ${missingSavingsHistoryCount === 1 ? "month" : "months"} to calculate your trailing 12-month liquid savings rate.`
      : projection.bonusMonthlyContribution > 0
        ? `${formatCurrency(projection.currentMonthlyContribution)} per month from trailing 12-month savings plus ${formatCurrency(fireSettings.annualBonusAmount)} in yearly bonus or lumpy contributions.`
        : `${formatCurrency(projection.currentMonthlyContribution)} per month averaged across trailing 12 months from ${formatMonthPeriod(oldestSavingsSnapshot.year, oldestSavingsSnapshot.monthIndex)} to ${selectedMonthLabel}.`;
  const timeToFireValue =
    selectedSnapshot &&
    hasEnoughSavingsHistory &&
    projection?.currentMonthlyContribution != null
      ? projection.yearsToFire == null && projectionDeadlineAge != null
        ? `Not by age ${projectionDeadlineAge}`
        : formatYears(projection.yearsToFire)
      : "- years";
  const configuredRetirementSystem = fireSettings.retirementSystem;
  const latestConfiguredBalancePeriod = getLatestRetirementBalancePeriod(
    configuredRetirementSystem,
  );
  const configuredMemberCount = new Set(
    (configuredRetirementSystem?.members ?? [])
      .map((member) => member.id)
      .concat(
        (configuredRetirementSystem?.accounts ?? [])
          .map((account) => account.memberId)
          .filter((memberId): memberId is string => Boolean(memberId)),
      ),
  ).size;
  const configuredAccountCount =
    configuredRetirementSystem?.accounts.length ?? 0;
  const displayCurrency = (value: number): string =>
    maskDisplayValue(formatCurrency(value), hideValues);
  const displayNegativeCurrency = (value: number): string =>
    maskDisplayValue(formatNegativeCurrency(value), hideValues);
  const displaySignedCurrency = (value: number): string =>
    maskDisplayValue(formatSignedCurrency(value), hideValues);
  const displayPercent = (value: number): string =>
    maskDisplayValue(formatPercent(value), hideValues);
  const displayAge = (value: number | null): string =>
    maskDisplayValue(formatAge(value), hideValues);
  const displayMemberIncome = (member: RetirementMemberProjection): string =>
    hideValues ? HIDDEN_VALUE : formatMemberIncome(member);
  const displayInlineText = (text: string): string =>
    maskInlineNumbers(text, hideValues);
  const displayCalendarYear = (year: number): string =>
    hideValues ? HIDDEN_VALUE : String(year);

  const cards: SummaryCard[] = [
    {
      label: "FIRE Number",
      value: displayCurrency(projection?.fireNumber ?? 0),
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
        `${formatCurrency(projection?.gapToGoal ?? 0)} still to go from ${formatCurrency(projection?.accessibleNetWorth ?? 0)} accessible today`,
      ),
      icon: Landmark,
      accent: "from-orange-500/15 to-red-500/10 text-red-700",
      progressBar,
    },
    {
      label: "Time To FIRE",
      value: maskDisplayValue(timeToFireValue, hideValues),
      helper: displayInlineText(
        `${contributionSummary} ${formatPercent(fireSettings.expectedAnnualReturn)} expected annual return.`,
      ),
      icon: TrendingUp,
      accent: "from-orange-400/20 to-amber-500/10 text-orange-700",
      hasSettingsButton: true,
    },
    {
      label: `Monthly Savings to retire by ${fireSettings.targetFireAge}`,
      value:
        projection?.requiredMonthlyContribution == null
          ? "Set age target"
          : displayCurrency(projection.requiredMonthlyContribution),
      helper: displayInlineText(
        currentAge == null
          ? [targetAgeSummary, targetAgeMathSummary].filter(Boolean).join(" ")
          : [
              targetAgeSummary,
              `Current age: ${currentAge}.`,
              targetAgeMathSummary,
            ]
              .filter(Boolean)
              .join(" "),
      ),
      icon: Goal,
      accent: "from-red-500/20 to-orange-500/10 text-red-700",
    },
  ];
  const liquidityCards = retirementProjection
    ? [
        {
          label: "Liquid",
          value: displayCurrency(retirementProjection.breakdown.liquid),
        },
        {
          label: "Semi-liquid",
          value: displayCurrency(retirementProjection.breakdown.semiLiquid),
        },
        {
          label: "Locked",
          value: displayCurrency(retirementProjection.breakdown.locked),
        },
        {
          label: "Restricted",
          value: displayCurrency(retirementProjection.breakdown.restricted),
        },
      ]
    : [];
  const fireProjectionStartMonth = getDrawdownStartMonth(
    currentAge,
    fireSettings.targetFireAge,
    retirementProjection?.monthsToFire ?? null,
  );
  const visibleProjection =
    retirementProjection == null || fireProjectionStartMonth == null
      ? []
      : retirementProjection.projection.filter(
          (point) => point.month >= fireProjectionStartMonth,
        );
  const projectionMathRows = visibleProjection.map((point, index) => {
    const previousPoint = visibleProjection[index - 1];

    return {
      point,
      liquidChange:
        previousPoint == null
          ? 0
          : point.cumulativeLiquidContributions -
            previousPoint.cumulativeLiquidContributions,
      retirementChange:
        previousPoint == null
          ? 0
          : point.cumulativeRetirementContributions -
            previousPoint.cumulativeRetirementContributions,
      growthChange:
        previousPoint == null
          ? 0
          : point.cumulativeInvestmentGrowth -
            previousPoint.cumulativeInvestmentGrowth,
      expenseChange:
        previousPoint == null
          ? 0
          : point.cumulativeProjectedSpending -
            previousPoint.cumulativeProjectedSpending,
    };
  });
  const projectionHighlights = visibleProjection.slice(0, 6);
  const latestRetirementBalancePeriod = retirementProjection?.balancePeriod;
  const projectionStartTotal = projectionHighlights[0]?.totalBalance ?? 0;
  const showProjectionView = activeView === "display";

  const handleSaveFireSettings = () => {
    onUpdateFireSettings(sanitizeFireSettings(draftFireSettings));
  };

  const handleOpenTimeToFireSettings = () => {
    setDraftTimeToFireSettings({
      timeToFireAlgorithm: fireSettings.timeToFireAlgorithm,
      annualBonusAmount: fireSettings.annualBonusAmount,
    });
    setShowTimeToFireSettingsModal(true);
  };

  const handleSaveTimeToFireSettings = () => {
    onUpdateFireSettings(
      sanitizeFireSettings({
        ...fireSettings,
        timeToFireAlgorithm: draftTimeToFireSettings.timeToFireAlgorithm,
        annualBonusAmount: draftTimeToFireSettings.annualBonusAmount,
      }),
    );
    setShowTimeToFireSettingsModal(false);
  };

  return (
    <>
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-gray-900">
              <Flame size={19} className="text-orange-500" />
              <h2 className="text-lg font-semibold">FIRE Tracker</h2>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {showProjectionView
                ? selectedSnapshot
                  ? `Based on your${isShowingPreviousMonth ? " previous" : " current"} recorded net worth from ${selectedMonthLabel}.`
                  : "Add at least one month of net worth data to estimate your path to financial independence."
                : "Switch between FIRE assumptions, tracker preferences, and the retirement module without leaving this card."}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => setActiveView("display")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeView === "display"
                    ? "bg-white text-orange-700 shadow-sm"
                    : "text-gray-500 hover:text-orange-700"
                }`}
              >
                Projection
              </button>
              <button
                type="button"
                onClick={() => setActiveView("settings")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeView === "settings"
                    ? "bg-white text-orange-700 shadow-sm"
                    : "text-gray-500 hover:text-orange-700"
                }`}
              >
                <Settings />
              </button>
            </div>
          </div>
        </div>

        {!showProjectionView ? (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            <section className="rounded-2xl border border-orange-200 bg-orange-50/70 p-4">
              <div className="mb-4 flex items-center gap-2 text-orange-800">
                <Settings2 size={18} />
                <h3 className="font-semibold">FIRE Assumptions</h3>
              </div>
              <div className="space-y-3">
                <label className="block rounded-2xl border border-orange-200 bg-white px-4 py-3">
                  <span className="text-xs uppercase tracking-wide text-gray-400">
                    Spending goal
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={draftFireSettings.annualSpendingGoal}
                    onChange={(event) =>
                      setDraftFireSettings((prev) => ({
                        ...prev,
                        annualSpendingGoal: parseNumber(event.target.value),
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </label>
                <label className="block rounded-2xl border border-orange-200 bg-white px-4 py-3">
                  <span className="text-xs uppercase tracking-wide text-gray-400">
                    Pre-FIRE spending
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={draftFireSettings.preFireAnnualSpending}
                    onChange={(event) =>
                      setDraftFireSettings((prev) => ({
                        ...prev,
                        preFireAnnualSpending: parseNumber(event.target.value),
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </label>
                <label className="block rounded-2xl border border-orange-200 bg-white px-4 py-3">
                  <span className="text-xs uppercase tracking-wide text-gray-400">
                    Withdrawal rate
                  </span>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={draftFireSettings.withdrawalRate}
                    onChange={(event) =>
                      setDraftFireSettings((prev) => ({
                        ...prev,
                        withdrawalRate: parseNumber(event.target.value),
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </label>
                <label className="block rounded-2xl border border-orange-200 bg-white px-4 py-3">
                  <span className="text-xs uppercase tracking-wide text-gray-400">
                    Return assumption
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    value={draftFireSettings.expectedAnnualReturn}
                    onChange={(event) =>
                      setDraftFireSettings((prev) => ({
                        ...prev,
                        expectedAnnualReturn: parseNumber(event.target.value),
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </label>
                <label className="block rounded-2xl border border-orange-200 bg-white px-4 py-3">
                  <span className="text-xs uppercase tracking-wide text-gray-400">
                    Date of birth
                  </span>
                  <input
                    type="date"
                    value={draftFireSettings.dateOfBirth ?? ""}
                    onChange={(event) =>
                      setDraftFireSettings((prev) => ({
                        ...prev,
                        dateOfBirth: parseOptionalDate(event.target.value),
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </label>
                <label className="block rounded-2xl border border-orange-200 bg-white px-4 py-3">
                  <span className="text-xs uppercase tracking-wide text-gray-400">
                    Target FIRE age
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={draftFireSettings.targetFireAge ?? ""}
                    onChange={(event) =>
                      setDraftFireSettings((prev) => ({
                        ...prev,
                        targetFireAge: parseOptionalNumber(event.target.value),
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </label>
                <label className="block rounded-2xl border border-orange-200 bg-white px-4 py-3">
                  <span className="text-xs uppercase tracking-wide text-gray-400">
                    Predicted death age
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={draftFireSettings.predictedDeathAge ?? ""}
                    onChange={(event) =>
                      setDraftFireSettings((prev) => ({
                        ...prev,
                        predictedDeathAge: parseOptionalNumber(
                          event.target.value,
                        ),
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </label>
                <label className="block rounded-2xl border border-orange-200 bg-white px-4 py-3">
                  <span className="text-xs uppercase tracking-wide text-gray-400">
                    Contribution stop age
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={
                      draftFireSettings.retirementContributionStopAge ?? ""
                    }
                    onChange={(event) =>
                      setDraftFireSettings((prev) => ({
                        ...prev,
                        retirementContributionStopAge: parseOptionalNumber(
                          event.target.value,
                        ),
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                  />
                </label>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setDraftFireSettings(fireSettings)}
                    className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveFireSettings}
                    className="rounded-xl bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:from-orange-600 hover:to-red-600"
                  >
                    Save FIRE Assumptions
                  </button>
                </div>
              </div>
            </section>

            <div className="space-y-4">
              <section className="rounded-2xl border border-gray-200 bg-white p-4">
                <h3 className="font-semibold text-gray-900">
                  Tracker Preferences
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Device-level preferences for the snapshot used in the FIRE
                  card and the savings-rate inference window.
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-sm font-medium text-gray-700">
                      FIRE tracker month
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Choose the latest recorded month or the month before it.
                    </p>
                    <div className="mt-3 flex items-center gap-1 rounded-xl bg-white p-1">
                      <button
                        type="button"
                        onClick={() => onSnapshotPreferenceChange("current")}
                        className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          snapshotPreference === "current"
                            ? "bg-orange-50 text-orange-700 shadow-sm"
                            : "text-gray-500 hover:text-orange-700"
                        }`}
                      >
                        Current month
                      </button>
                      <button
                        type="button"
                        onClick={() => onSnapshotPreferenceChange("previous")}
                        disabled={!previousSnapshot}
                        className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          snapshotPreference === "previous"
                            ? "bg-orange-50 text-orange-700 shadow-sm"
                            : "text-gray-500 hover:text-orange-700"
                        } ${!previousSnapshot ? "cursor-not-allowed opacity-50 hover:text-gray-500" : ""}`}
                      >
                        Previous month
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-sm font-medium text-gray-700">
                      Time to FIRE calculation
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Configure the time-to-FIRE algorithm and any yearly bonus
                      or lumpy savings amount.
                    </p>
                    <div className="mt-3 rounded-xl bg-white px-4 py-3">
                      <p className="text-sm font-medium text-gray-700">
                        Twelve trailing months (TTM)
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Bonus setting:{" "}
                        {hideValues
                          ? HIDDEN_VALUE
                          : formatCurrency(fireSettings.annualBonusAmount)}{" "}
                        per year.
                      </p>
                      <button
                        type="button"
                        onClick={handleOpenTimeToFireSettings}
                        className="mt-3 rounded-lg border border-orange-200 px-3 py-2 text-sm font-medium text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-red-700"
                      >
                        Open Time to FIRE Settings
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      Retirement Module
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      A separate workspace for members, accounts, contribution
                      rules, and monthly balance history.
                    </p>
                  </div>
                  <button
                    onClick={onOpenRetirementConfig}
                    className="rounded-xl border border-orange-200 px-4 py-2 text-sm font-medium text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-red-700"
                  >
                    {configuredRetirementSystem
                      ? "Open Retirement Module"
                      : "Set Up Retirement Module"}
                  </button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-gray-400">
                      System
                    </p>
                    <p className="mt-2 text-lg font-semibold text-gray-900">
                      {configuredRetirementSystem?.name ?? "Disabled"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-gray-400">
                      Members / Accounts
                    </p>
                    <p className="mt-2 text-lg font-semibold text-gray-900">
                      {configuredMemberCount} / {configuredAccountCount}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-gray-400">
                      Latest balance
                    </p>
                    <p className="mt-2 text-lg font-semibold text-gray-900">
                      {latestConfiguredBalancePeriod
                        ? formatMonthPeriod(
                            latestConfiguredBalancePeriod.year,
                            latestConfiguredBalancePeriod.monthIndex,
                          )
                        : "No balances"}
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : !selectedSnapshot || !projection ? (
          <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  No FIRE snapshot yet
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  Add at least one month of net worth data, then use the
                  settings tab here to tune FIRE assumptions and the retirement
                  module.
                </p>
              </div>
              <button
                onClick={() => setActiveView("settings")}
                className="rounded-xl bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:from-orange-600 hover:to-red-600"
              >
                Open FIRE Settings
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                        {card.hasSettingsButton ? (
                          <button
                            type="button"
                            onClick={handleOpenTimeToFireSettings}
                            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
                          >
                            <Settings size={15} />
                            Settings
                          </button>
                        ) : null}
                      </div>
                      <div
                        className={`rounded-2xl bg-gradient-to-br p-3 ${card.accent}`}
                      >
                        <Icon size={18} />
                      </div>
                    </div>
                    <p className="text-sm leading-6 text-gray-500">
                      {card.helper}
                    </p>
                    {card.progressBar ? (
                      <div className="mt-4">
                        <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${card.progressBar.fillClassName}`}
                            style={{
                              width: `${card.progressBar.fillPercent}%`,
                            }}
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                          <span className={card.progressBar.labelClassName}>
                            {card.progressBar.label}
                          </span>
                          <span>
                            {formatPercent(card.progressBar.fillPercent)}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              Gross net worth is {displayCurrency(projection.grossNetWorth)}{" "}
              from your selected recorded net worth. FIRE progress uses{" "}
              {displayCurrency(projection.accessibleNetWorth)} after excluding
              retirement balances that are not yet available under the
              configured withdrawal rules.
            </div>

            {snapshotPreference === "previous" && !previousSnapshot ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Previous-month FIRE view is saved as your preference, but there
                is no earlier recorded month yet, so the tracker is using{" "}
                {hideValues ? HIDDEN_VALUE : selectedMonthLabel}.
              </div>
            ) : null}

            {!hasEnoughSavingsHistory ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {missingSavingsHistoryCount > 0
                  ? `The time-to-FIRE widget uses a trailing 12-month calculation, but there is not enough earlier history yet. Add ${missingSavingsHistoryCount} more recorded ${missingSavingsHistoryCount === 1 ? "month" : "months"} to use it.`
                  : "Not enough history is available to calculate the trailing 12-month savings rate."}
              </div>
            ) : null}

            {retirementProjection ? (
              <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
                <section className="rounded-2xl border border-orange-200 bg-orange-50/70 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">
                        Retirement System
                      </h3>
                      <p className="mt-1 text-sm text-gray-600">
                        {fireSettings.retirementSystem?.name ??
                          "Configured system"}
                      </p>
                      {latestRetirementBalancePeriod ? (
                        <p className="mt-1 text-xs text-gray-500">
                          Latest balances from{" "}
                          {formatMonthPeriod(
                            latestRetirementBalancePeriod.year,
                            latestRetirementBalancePeriod.monthIndex,
                          )}
                        </p>
                      ) : null}
                    </div>
                    <div className="w-full rounded-2xl bg-white px-3 py-2 text-left shadow-sm sm:w-auto sm:text-right">
                      <p className="text-xs uppercase tracking-wide text-gray-400">
                        Est. income
                      </p>
                      <p className="text-sm font-semibold text-green-700">
                        {displayCurrency(
                          retirementProjection.estimatedMonthlyRetirementIncome,
                        )}
                        /mo
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    {liquidityCards.map((card) => (
                      <div
                        key={card.label}
                        className="rounded-2xl border border-orange-100 bg-white px-4 py-3"
                      >
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                          {card.label}
                        </p>
                        <p className="mt-2 text-lg font-semibold text-gray-900">
                          {card.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm text-gray-600">
                    Payout phase starts at age{" "}
                    {hideValues
                      ? HIDDEN_VALUE
                      : (retirementProjection.payoutStartAge ?? "n/a")}
                    . Restricted balances stay excluded from usable FIRE assets.
                    {displayInlineText(
                      `${fireSettings.preFireAnnualSpending > 0 ? ` Pre-FIRE spending is estimated at ${formatCurrency(fireSettings.preFireAnnualSpending)} per year.` : ""}${fireSettings.annualSpendingGoal > 0 ? ` Projected spending of ${formatCurrency(fireSettings.annualSpendingGoal)} per year is deducted during drawdown.` : ""}${fireSettings.retirementContributionStopAge != null ? ` Retirement contributions stop at age ${fireSettings.retirementContributionStopAge}.` : ""}${projectionDeadlineAge != null ? ` Projection horizon ends at age ${projectionDeadlineAge}.` : ""}`,
                    )}
                  </div>
                </section>

                <div className="space-y-6">
                  {retirementProjection.memberProjections.length > 0 ? (
                    <section className="rounded-2xl border border-gray-200 bg-white">
                      <div className="border-b border-gray-200 px-4 py-3">
                        <h3 className="text-base font-semibold text-gray-900">
                          Member CPF Summary
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Individual retirement balances are tracked separately
                          and then rolled up into household FIRE progress.
                        </p>
                      </div>
                      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                        {retirementProjection.memberProjections.map(
                          (member) => (
                            <article
                              key={member.id}
                              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="font-semibold text-gray-900">
                                    {member.name}
                                  </p>
                                  <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">
                                    Age {displayAge(member.currentAge)} · Income{" "}
                                    {displayMemberIncome(member)}/mo
                                  </p>
                                </div>
                                <div className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-left sm:w-auto sm:text-right">
                                  <p className="text-xs uppercase tracking-wide text-gray-400">
                                    Income
                                  </p>
                                  <p className="text-sm font-semibold text-gray-900">
                                    {displayMemberIncome(member)}/mo
                                  </p>
                                </div>
                              </div>
                              <p className="mt-4 text-lg font-semibold text-gray-900">
                                {displayCurrency(member.currentBalance)}
                              </p>
                              <p className="mt-1 text-sm text-gray-600">
                                Current retirement balance
                              </p>
                              <p className="mt-3 text-sm text-gray-600">
                                {displayInlineText(
                                  `${formatCurrency(member.projectedBalance)} at end of timeline · ${formatCurrency(member.estimatedMonthlyIncome)}/mo income`,
                                )}
                              </p>
                            </article>
                          ),
                        )}
                      </div>
                    </section>
                  ) : null}

                  <section className="rounded-2xl border border-gray-200 bg-white">
                    <div className="border-b border-gray-200 px-4 py-3">
                      <h3 className="text-base font-semibold text-gray-900">
                        Account Balances
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Current balances, payout-eligible balances, and
                        long-range projections by configured account.
                      </p>
                    </div>
                    <div className="space-y-3 p-4 md:hidden">
                      {retirementProjection.accountProjections.map(
                        (account) => (
                          <article
                            key={account.id}
                            className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
                          >
                            <div className="flex flex-col gap-3">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">
                                  {account.name}
                                </p>
                                <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">
                                  {account.memberName ?? "Household"} ·{" "}
                                  {formatClassification(account.classification)}
                                </p>
                                <p className="mt-2 text-xs text-gray-500">
                                  {displayInlineText(
                                    `${formatPercent(account.annualReturnRate)} return${account.minimumWithdrawalAge != null ? ` · age ${account.minimumWithdrawalAge}+` : ""}`,
                                  )}
                                </p>
                              </div>
                              <dl className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <dt className="text-xs uppercase tracking-wide text-gray-400">
                                    Current
                                  </dt>
                                  <dd className="mt-1 font-semibold text-gray-900">
                                    {displayCurrency(account.currentBalance)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-xs uppercase tracking-wide text-gray-400">
                                    At payout
                                  </dt>
                                  <dd className="mt-1 font-semibold text-gray-900">
                                    {account.projectedBalanceAtPayout == null
                                      ? "n/a"
                                      : displayCurrency(
                                          account.projectedBalanceAtPayout,
                                        )}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-xs uppercase tracking-wide text-gray-400">
                                    End timeline
                                  </dt>
                                  <dd className="mt-1 font-semibold text-gray-900">
                                    {displayCurrency(account.projectedBalance)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-xs uppercase tracking-wide text-gray-400">
                                    Income
                                  </dt>
                                  <dd className="mt-1 font-semibold text-green-700">
                                    {account.estimatedMonthlyIncome > 0
                                      ? `${displayCurrency(account.estimatedMonthlyIncome)}/mo`
                                      : "n/a"}
                                  </dd>
                                </div>
                              </dl>
                            </div>
                          </article>
                        ),
                      )}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                          <tr>
                            <th className="px-4 py-3 font-medium">Member</th>
                            <th className="px-4 py-3 font-medium">Account</th>
                            <th className="px-4 py-3 font-medium">Class</th>
                            <th className="px-4 py-3 font-medium">Current</th>
                            <th className="px-4 py-3 font-medium">At Payout</th>
                            <th className="px-4 py-3 font-medium">
                              End Timeline
                            </th>
                            <th className="px-4 py-3 font-medium">Income</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {retirementProjection.accountProjections.map(
                            (account) => (
                              <tr key={account.id}>
                                <td className="px-4 py-3 text-gray-600">
                                  {account.memberName ?? "Household"}
                                </td>
                                <td className="px-4 py-3">
                                  <div>
                                    <p className="font-medium text-gray-900">
                                      {account.name}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {displayInlineText(
                                        `${formatPercent(account.annualReturnRate)} return${account.minimumWithdrawalAge != null ? ` · age ${account.minimumWithdrawalAge}+` : ""}`,
                                      )}
                                    </p>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-gray-600">
                                  {formatClassification(account.classification)}
                                </td>
                                <td className="px-4 py-3 text-gray-900">
                                  {displayCurrency(account.currentBalance)}
                                </td>
                                <td className="px-4 py-3 text-gray-900">
                                  {account.projectedBalanceAtPayout == null
                                    ? "n/a"
                                    : displayCurrency(
                                        account.projectedBalanceAtPayout,
                                      )}
                                </td>
                                <td className="px-4 py-3 text-gray-900">
                                  {displayCurrency(account.projectedBalance)}
                                </td>
                                <td className="px-4 py-3 text-green-700">
                                  {account.estimatedMonthlyIncome > 0
                                    ? `${displayCurrency(account.estimatedMonthlyIncome)}/mo`
                                    : "n/a"}
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-gray-200 bg-white">
                    <div className="border-b border-gray-200 px-4 py-3">
                      <h3 className="text-base font-semibold text-gray-900">
                        Projection Timeline
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {projectionDeadlineAge != null
                          ? displayInlineText(
                              `Retirement-phase checkpoints from the FIRE year through age ${projectionDeadlineAge}.`,
                            )
                          : "Retirement-phase checkpoints starting from the FIRE year."}
                      </p>
                    </div>
                    {projectionHighlights.length > 0 && selectedSnapshot ? (
                      <>
                        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                          {projectionHighlights.map((point, index) => (
                            <article
                              key={point.month}
                              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">
                                    {index === 0
                                      ? "FIRE year"
                                      : hideValues
                                        ? HIDDEN_VALUE
                                        : `+${point.yearOffset - projectionHighlights[0].yearOffset} yr`}
                                  </p>
                                  <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">
                                    {displayCalendarYear(
                                      getProjectionCalendarYear(
                                        selectedSnapshot,
                                        point.month,
                                      ),
                                    )}
                                  </p>
                                </div>
                                <p className="text-xs uppercase tracking-wide text-gray-400">
                                  {point.age == null
                                    ? "Age n/a"
                                    : hideValues
                                      ? `Age ${HIDDEN_VALUE}`
                                      : `Age ${point.age.toFixed(0)}`}
                                </p>
                              </div>
                              <p className="mt-3 text-lg font-semibold text-gray-900">
                                {displayCurrency(point.totalBalance)}
                              </p>
                              <p className="mt-1 text-sm text-gray-600">
                                {displayCurrency(point.accessibleBalance)}{" "}
                                usable for FIRE
                              </p>
                              <p className="mt-1 text-sm text-green-700">
                                {displayCurrency(point.estimatedMonthlyIncome)}
                                /mo retirement income
                              </p>
                            </article>
                          ))}
                        </div>
                        <details className="border-t border-gray-200 px-4 py-4">
                          <summary className="cursor-pointer list-none text-sm font-semibold text-gray-900">
                            Show projection math
                          </summary>
                          <p className="mt-3 text-sm text-gray-600">
                            {displayInlineText(
                              `Each row starts from the first drawdown checkpoint balance of ${formatCurrency(projectionStartTotal)}. The contribution, growth, and expense columns show change since the prior displayed checkpoint, while total, usable FIRE assets, and income remain absolute balances at that checkpoint. This table only shows the drawdown phase, when projected spending is actually being deducted.`,
                            )}
                          </p>
                          <div className="mt-4 space-y-3 lg:hidden">
                            {projectionMathRows.map((row) => (
                              <article
                                key={`detail-mobile-${row.point.month}`}
                                className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-gray-900">
                                      {row.point.age == null
                                        ? "Age n/a"
                                        : hideValues
                                          ? `Age ${HIDDEN_VALUE}`
                                          : `Age ${row.point.age.toFixed(0)}`}
                                    </p>
                                    <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">
                                      {displayCurrency(row.point.totalBalance)}{" "}
                                      total
                                    </p>
                                  </div>
                                  <p className="text-sm font-semibold text-orange-700">
                                    {displayCurrency(
                                      row.point.estimatedMonthlyIncome,
                                    )}
                                    /mo
                                  </p>
                                </div>
                                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <dt className="text-xs uppercase tracking-wide text-gray-400">
                                      Liquid added
                                    </dt>
                                    <dd className="mt-1 font-medium text-gray-900">
                                      {displaySignedCurrency(row.liquidChange)}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs uppercase tracking-wide text-gray-400">
                                      Retirement added
                                    </dt>
                                    <dd className="mt-1 font-medium text-gray-900">
                                      {displaySignedCurrency(
                                        row.retirementChange,
                                      )}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs uppercase tracking-wide text-gray-400">
                                      Growth
                                    </dt>
                                    <dd className="mt-1 font-medium text-gray-900">
                                      {displaySignedCurrency(row.growthChange)}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs uppercase tracking-wide text-gray-400">
                                      Expenses
                                    </dt>
                                    <dd className="mt-1 font-medium text-gray-900">
                                      {displayNegativeCurrency(
                                        row.expenseChange,
                                      )}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs uppercase tracking-wide text-gray-400">
                                      FIRE usable
                                    </dt>
                                    <dd className="mt-1 font-medium text-gray-900">
                                      {displayCurrency(
                                        row.point.accessibleBalance,
                                      )}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs uppercase tracking-wide text-gray-400">
                                      Calendar year
                                    </dt>
                                    <dd className="mt-1 font-medium text-gray-900">
                                      {displayCalendarYear(
                                        getProjectionCalendarYear(
                                          selectedSnapshot,
                                          row.point.month,
                                        ),
                                      )}
                                    </dd>
                                  </div>
                                </dl>
                              </article>
                            ))}
                          </div>
                          <div className="mt-4 hidden max-h-[800px] overflow-auto rounded-xl border border-gray-200 lg:block">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                                <tr>
                                  <th className="sticky left-0 top-0 z-20 bg-gray-50 px-4 py-3 font-medium">
                                    Age
                                  </th>
                                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 font-medium">
                                    Liquid Added
                                  </th>
                                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 font-medium">
                                    Retirement Added
                                  </th>
                                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 font-medium">
                                    Growth
                                  </th>
                                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 font-medium">
                                    Expenses
                                  </th>
                                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 font-medium">
                                    Total
                                  </th>
                                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 font-medium">
                                    FIRE Usable
                                  </th>
                                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 font-medium">
                                    Income
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 bg-white">
                                {projectionMathRows.map((row) => (
                                  <tr key={`detail-${row.point.month}`}>
                                    <td className="sticky left-0 z-10 bg-white px-4 py-3 text-gray-600">
                                      {row.point.age == null
                                        ? "n/a"
                                        : hideValues
                                          ? HIDDEN_VALUE
                                          : row.point.age.toFixed(0)}
                                    </td>
                                    <td className="px-4 py-3 text-gray-900">
                                      {displaySignedCurrency(row.liquidChange)}
                                    </td>
                                    <td className="px-4 py-3 text-gray-900">
                                      {displaySignedCurrency(
                                        row.retirementChange,
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-gray-900">
                                      {displaySignedCurrency(row.growthChange)}
                                    </td>
                                    <td className="px-4 py-3 text-gray-900">
                                      {displayNegativeCurrency(
                                        row.expenseChange,
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-gray-900">
                                      {displayCurrency(row.point.totalBalance)}
                                    </td>
                                    <td className="px-4 py-3 text-gray-900">
                                      {displayCurrency(
                                        row.point.accessibleBalance,
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-orange-700">
                                      {displayCurrency(
                                        row.point.estimatedMonthlyIncome,
                                      )}
                                      /mo
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      </>
                    ) : (
                      <div className="p-4 text-sm text-gray-600">
                        {projectionDeadlineAge != null
                          ? displayInlineText(
                              `FIRE is not reached before age ${projectionDeadlineAge}, so there are no retirement-phase checkpoints to show.`,
                            )
                          : "FIRE is not reached within the current projection horizon, so there are no retirement-phase checkpoints to show."}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      {showTimeToFireSettingsModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Time to FIRE Settings
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Choose how the widget infers savings and include annual bonus
                  or one-off monthly amounts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTimeToFireSettingsModal(false)}
                className="text-gray-400 transition-colors hover:text-gray-600"
                aria-label="Close Time to FIRE settings"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-900">
                  Calculation algorithm
                </p>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  TTM averages inferred savings across the last 12 recorded
                  months before the selected snapshot.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setDraftTimeToFireSettings((prev) => ({
                      ...prev,
                      timeToFireAlgorithm: "ttm",
                    }))
                  }
                  className="mt-3 w-full rounded-2xl border border-orange-300 bg-orange-50 px-4 py-4 text-left shadow-sm"
                >
                  <span className="block text-sm font-semibold text-orange-800">
                    Twelve trailing months (TTM)
                  </span>
                  <span className="mt-1 block text-xs text-orange-700/80">
                    Uses the trailing 12 months of net worth history for the
                    Time to FIRE calculation.
                  </span>
                </button>
              </div>

              <label className="block rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <span className="text-xs uppercase tracking-wide text-gray-400">
                  Yearly bonus or large one-month amount
                </span>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={draftTimeToFireSettings.annualBonusAmount}
                  onChange={(event) =>
                    setDraftTimeToFireSettings((prev) => ({
                      ...prev,
                      annualBonusAmount: parseNumber(event.target.value),
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                />
                <p className="mt-2 text-xs leading-5 text-gray-500">
                  This amount is spread across the year and added to the monthly
                  savings rate used by the projection.
                </p>
              </label>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowTimeToFireSettingsModal(false)}
                  className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveTimeToFireSettings}
                  className="rounded-xl bg-gradient-to-r from-orange-500 to-red-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:from-orange-600 hover:to-red-600"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
