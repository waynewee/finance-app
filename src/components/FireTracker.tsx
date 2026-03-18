import { Flame, Goal, Landmark, TrendingUp } from "lucide-react";
import { MONTHS } from "../data/defaultCategories";
import {
  calculateFireProjection,
  getCurrentAgeFromDateOfBirth,
  type FireProjectionSnapshot,
} from "../lib/fire";
import {
  type FireSavingsAveragePreference,
  type FireSnapshotPreference,
} from "../lib/firePreferences";
import { type FireSettings } from "../lib/netWorthRepository";
import type {
  RetirementAccountClassification,
  RetirementMemberProjection,
} from "../lib/retirementSystem";

interface LatestSnapshot {
  year: number;
  monthIndex: number;
  total: number;
}

interface Props {
  fireSettings: FireSettings;
  snapshots: FireProjectionSnapshot[];
  selectedSnapshot: LatestSnapshot | null;
  previousSnapshot: LatestSnapshot | null;
  snapshotPreference: FireSnapshotPreference;
  savingsAveragePreference: FireSavingsAveragePreference;
  onSnapshotPreferenceChange: (preference: FireSnapshotPreference) => void;
  onSavingsAveragePreferenceChange: (
    preference: FireSavingsAveragePreference,
  ) => void;
  onOpenConfig: () => void;
}

const SAVINGS_AVERAGE_OPTIONS: FireSavingsAveragePreference[] = [3, 6];

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
  fireSettings,
  snapshots,
  selectedSnapshot,
  previousSnapshot,
  snapshotPreference,
  savingsAveragePreference,
  onSnapshotPreferenceChange,
  onSavingsAveragePreferenceChange,
  onOpenConfig,
}: Props) {
  if (!selectedSnapshot) {
    return (
      <section className="rounded-3xl border border-dashed border-amber-300 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              FIRE Tracker
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Add at least one month of net worth data to estimate your path to
              financial independence.
            </p>
          </div>
          <button
            onClick={onOpenConfig}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Configure FIRE
          </button>
        </div>
      </section>
    );
  }

  const selectedSnapshotIndex = snapshots.findIndex(
    (snapshot) =>
      snapshot.year === selectedSnapshot.year &&
      snapshot.monthIndex === selectedSnapshot.monthIndex,
  );
  const priorSnapshotsForAverage =
    selectedSnapshotIndex >= 0
      ? snapshots.slice(
          selectedSnapshotIndex + 1,
          selectedSnapshotIndex + 1 + savingsAveragePreference,
        )
      : [];
  const hasEnoughSavingsHistory =
    priorSnapshotsForAverage.length === savingsAveragePreference;
  const savingsInferenceSnapshots = hasEnoughSavingsHistory
    ? priorSnapshotsForAverage
    : [];
  const projection = calculateFireProjection(
    selectedSnapshot.total,
    fireSettings,
    {
      currentSnapshot: selectedSnapshot,
      previousSnapshots: savingsInferenceSnapshots,
    },
  );
  const currentAge = getCurrentAgeFromDateOfBirth(fireSettings.dateOfBirth);
  const fundedPercent = Math.max(0, projection.fundedRatio * 100);
  const retirementProjection = projection.retirementProjection;
  const isShowingPreviousMonth =
    snapshotPreference === "previous" && previousSnapshot != null;
  const selectedMonthLabel = formatMonthPeriod(
    selectedSnapshot.year,
    selectedSnapshot.monthIndex,
  );
  const oldestSavingsSnapshot =
    savingsInferenceSnapshots[savingsInferenceSnapshots.length - 1] ?? null;
  const missingSavingsHistoryCount = Math.max(
    savingsAveragePreference - priorSnapshotsForAverage.length,
    0,
  );
  const targetAgeSummary =
    projection.targetYearsAway == null
      ? "Add your date of birth and target FIRE age in settings."
      : projection.requiredMonthlyContribution == null
        ? "Target age requires a savings level outside the planner range."
        : projection.requiredMonthlyContribution <=
            (projection.currentMonthlyContribution ?? 0)
          ? `On track for age ${fireSettings.targetFireAge}.`
          : `${formatCurrency(projection.requiredMonthlyContribution)} per month needed to reach age ${fireSettings.targetFireAge}.`;
  const contributionSummary =
    !hasEnoughSavingsHistory || projection.currentMonthlyContribution == null
      ? `Add ${missingSavingsHistoryCount} earlier net worth ${missingSavingsHistoryCount === 1 ? "month" : "months"} to infer your ${savingsAveragePreference}-month average liquid savings rate.`
      : `${formatCurrency(projection.currentMonthlyContribution)} per month averaged across ${savingsAveragePreference} months from ${formatMonthPeriod(oldestSavingsSnapshot.year, oldestSavingsSnapshot.monthIndex)} to ${selectedMonthLabel}.`;
  const timeToFireValue =
    hasEnoughSavingsHistory && projection.currentMonthlyContribution != null
      ? formatYears(projection.yearsToFire)
      : "- years";

  const cards = [
    {
      label: "FIRE Number",
      value: formatCurrency(projection.fireNumber),
      helper: `${formatCurrency(fireSettings.annualSpendingGoal)} spending at ${formatPercent(fireSettings.withdrawalRate)}`,
      icon: Flame,
      accent: "from-amber-500/15 to-orange-500/5 text-amber-700",
    },
    {
      label: "Current Progress",
      value: formatPercent(fundedPercent),
      helper: `${formatCurrency(projection.gapToGoal)} still to go from ${formatCurrency(projection.accessibleNetWorth)} accessible today`,
      icon: Landmark,
      accent: "from-indigo-500/15 to-sky-500/5 text-indigo-700",
    },
    {
      label: "Time To FIRE",
      value: timeToFireValue,
      helper: `${contributionSummary} ${formatPercent(fireSettings.expectedAnnualReturn)} expected annual return.`,
      icon: TrendingUp,
      accent: "from-emerald-500/15 to-teal-500/5 text-emerald-700",
      hasSavingsAverageToggle: true,
    },
    {
      label: "Target Age Plan",
      value:
        projection.requiredMonthlyContribution == null
          ? "Set age target"
          : formatCurrency(projection.requiredMonthlyContribution),
      helper:
        currentAge == null
          ? targetAgeSummary
          : `${targetAgeSummary} Current age: ${currentAge}.`,
      icon: Goal,
      accent: "from-rose-500/15 to-fuchsia-500/5 text-rose-700",
    },
  ];
  const liquidityCards = retirementProjection
    ? [
        {
          label: "Liquid",
          value: formatCurrency(retirementProjection.breakdown.liquid),
        },
        {
          label: "Semi-liquid",
          value: formatCurrency(retirementProjection.breakdown.semiLiquid),
        },
        {
          label: "Locked",
          value: formatCurrency(retirementProjection.breakdown.locked),
        },
        {
          label: "Restricted",
          value: formatCurrency(retirementProjection.breakdown.restricted),
        },
      ]
    : [];
  const projectionHighlights =
    retirementProjection?.projection.slice(0, 6) ?? [];
  const latestRetirementBalancePeriod = retirementProjection?.balancePeriod;
  const projectionStartTotal =
    retirementProjection?.projection[0]?.totalBalance ?? 0;

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-gray-900">
            <Flame size={19} className="text-amber-500" />
            <h2 className="text-lg font-semibold">FIRE Tracker</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Based on your
            {isShowingPreviousMonth ? " previous " : " current "}
            recorded net worth from {selectedMonthLabel}.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => onSnapshotPreferenceChange("current")}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                snapshotPreference === "current"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-gray-500 hover:text-indigo-600"
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
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-gray-500 hover:text-indigo-600"
              } ${!previousSnapshot ? "cursor-not-allowed opacity-50 hover:text-gray-500" : ""}`}
            >
              Previous month
            </button>
          </div>
          <button
            onClick={onOpenConfig}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700"
          >
            Edit FIRE Settings
          </button>
        </div>
      </div>

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
                  {card.hasSavingsAverageToggle ? (
                    <div className="mt-3 flex items-center gap-1 rounded-xl bg-gray-100 p-1">
                      {SAVINGS_AVERAGE_OPTIONS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() =>
                            onSavingsAveragePreferenceChange(option)
                          }
                          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            savingsAveragePreference === option
                              ? "bg-white text-indigo-700 shadow-sm"
                              : "text-gray-500 hover:text-indigo-600"
                          }`}
                        >
                          {option}-month avg
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div
                  className={`rounded-2xl bg-gradient-to-br p-3 ${card.accent}`}
                >
                  <Icon size={18} />
                </div>
              </div>
              <p className="text-sm leading-6 text-gray-500">{card.helper}</p>
            </article>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        Gross net worth is {formatCurrency(projection.grossNetWorth)} from your
        selected recorded net worth. FIRE progress uses{" "}
        {formatCurrency(projection.accessibleNetWorth)} after excluding
        retirement balances that are not yet available under the configured
        withdrawal rules.
      </div>

      {snapshotPreference === "previous" && !previousSnapshot ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Previous-month FIRE view is saved as your preference, but there is no
          earlier recorded month yet, so the tracker is using{" "}
          {selectedMonthLabel}.
        </div>
      ) : null}

      {!hasEnoughSavingsHistory ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {missingSavingsHistoryCount > 0
            ? `Your ${savingsAveragePreference}-month savings average is saved as the FIRE inference preference, but there is not enough earlier history yet. Add ${missingSavingsHistoryCount} more recorded ${missingSavingsHistoryCount === 1 ? "month" : "months"} to use it.`
            : "Not enough history is available to infer the selected savings average."}
        </div>
      ) : null}

      {retirementProjection ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  Retirement System
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  {fireSettings.retirementSystem?.name ?? "Configured system"}
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
              <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Est. income
                </p>
                <p className="text-sm font-semibold text-emerald-700">
                  {formatCurrency(
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
                  className="rounded-2xl border border-emerald-100 bg-white px-4 py-3"
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

            <div className="mt-4 rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm text-gray-600">
              Payout phase starts at age{" "}
              {retirementProjection.payoutStartAge ?? "n/a"}. Restricted
              balances stay excluded from usable FIRE assets.
              {fireSettings.retirementContributionStopAge != null
                ? ` Retirement contributions stop at age ${fireSettings.retirementContributionStopAge}.`
                : ""}
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
                    Individual retirement balances are tracked separately and
                    then rolled up into household FIRE progress.
                  </p>
                </div>
                <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                  {retirementProjection.memberProjections.map((member) => (
                    <article
                      key={member.id}
                      className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-900">
                            {member.name}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">
                            Age {formatAge(member.currentAge)} · Income{" "}
                            {formatMemberIncome(member)}/mo
                          </p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-right">
                          <p className="text-xs uppercase tracking-wide text-gray-400">
                            Income
                          </p>
                          <p className="text-sm font-semibold text-gray-900">
                            {formatMemberIncome(member)}/mo
                          </p>
                        </div>
                      </div>
                      <p className="mt-4 text-lg font-semibold text-gray-900">
                        {formatCurrency(member.currentBalance)}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        Current retirement balance
                      </p>
                      <p className="mt-3 text-sm text-gray-600">
                        {formatCurrency(member.projectedBalance)} at end of
                        timeline ·{" "}
                        {formatCurrency(member.estimatedMonthlyIncome)}/mo
                        income
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-4 py-3">
                <h3 className="text-base font-semibold text-gray-900">
                  Account Balances
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Current balances, payout-eligible balances, and long-range
                  projections by configured account.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Member</th>
                      <th className="px-4 py-3 font-medium">Account</th>
                      <th className="px-4 py-3 font-medium">Class</th>
                      <th className="px-4 py-3 font-medium">Current</th>
                      <th className="px-4 py-3 font-medium">At Payout</th>
                      <th className="px-4 py-3 font-medium">End Timeline</th>
                      <th className="px-4 py-3 font-medium">Income</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {retirementProjection.accountProjections.map((account) => (
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
                              {formatPercent(account.annualReturnRate)} return
                              {account.minimumWithdrawalAge != null
                                ? ` · age ${account.minimumWithdrawalAge}+`
                                : ""}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {formatClassification(account.classification)}
                        </td>
                        <td className="px-4 py-3 text-gray-900">
                          {formatCurrency(account.currentBalance)}
                        </td>
                        <td className="px-4 py-3 text-gray-900">
                          {account.projectedBalanceAtPayout == null
                            ? "n/a"
                            : formatCurrency(account.projectedBalanceAtPayout)}
                        </td>
                        <td className="px-4 py-3 text-gray-900">
                          {formatCurrency(account.projectedBalance)}
                        </td>
                        <td className="px-4 py-3 text-emerald-700">
                          {account.estimatedMonthlyIncome > 0
                            ? `${formatCurrency(account.estimatedMonthlyIncome)}/mo`
                            : "n/a"}
                        </td>
                      </tr>
                    ))}
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
                  Yearly checkpoints for total wealth, usable FIRE assets, and
                  retirement income.
                </p>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                {projectionHighlights.map((point) => (
                  <article
                    key={point.month}
                    className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-900">
                        Year {point.yearOffset.toFixed(0)}
                      </p>
                      <p className="text-xs uppercase tracking-wide text-gray-400">
                        {point.age == null
                          ? "Age n/a"
                          : `Age ${point.age.toFixed(0)}`}
                      </p>
                    </div>
                    <p className="mt-3 text-lg font-semibold text-gray-900">
                      {formatCurrency(point.totalBalance)}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      {formatCurrency(point.accessibleBalance)} usable for FIRE
                    </p>
                    <p className="mt-1 text-sm text-emerald-700">
                      {formatCurrency(point.estimatedMonthlyIncome)}/mo
                      retirement income
                    </p>
                  </article>
                ))}
              </div>
              <details className="border-t border-gray-200 px-4 py-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-gray-900">
                  Show projection math
                </summary>
                <p className="mt-3 text-sm text-gray-600">
                  Each checkpoint starts from{" "}
                  {formatCurrency(projectionStartTotal)} and adds inferred
                  liquid savings, modeled retirement contributions, and
                  cumulative investment growth.
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                      <tr>
                        <th className="px-4 py-3 font-medium">Year</th>
                        <th className="px-4 py-3 font-medium">Age</th>
                        <th className="px-4 py-3 font-medium">Liquid Added</th>
                        <th className="px-4 py-3 font-medium">
                          Retirement Added
                        </th>
                        <th className="px-4 py-3 font-medium">Growth</th>
                        <th className="px-4 py-3 font-medium">Total</th>
                        <th className="px-4 py-3 font-medium">FIRE Usable</th>
                        <th className="px-4 py-3 font-medium">Income</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {retirementProjection.projection.map((point) => (
                        <tr key={`detail-${point.month}`}>
                          <td className="px-4 py-3 text-gray-900">
                            {point.yearOffset.toFixed(0)}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {point.age == null ? "n/a" : point.age.toFixed(0)}
                          </td>
                          <td className="px-4 py-3 text-gray-900">
                            {formatCurrency(
                              point.cumulativeLiquidContributions,
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-900">
                            {formatCurrency(
                              point.cumulativeRetirementContributions,
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-900">
                            {formatCurrency(point.cumulativeInvestmentGrowth)}
                          </td>
                          <td className="px-4 py-3 text-gray-900">
                            {formatCurrency(point.totalBalance)}
                          </td>
                          <td className="px-4 py-3 text-gray-900">
                            {formatCurrency(point.accessibleBalance)}
                          </td>
                          <td className="px-4 py-3 text-emerald-700">
                            {formatCurrency(point.estimatedMonthlyIncome)}/mo
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
          </div>
        </div>
      ) : null}
    </section>
  );
}
