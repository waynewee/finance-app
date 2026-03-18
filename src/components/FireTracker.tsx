import { Flame, Goal, Landmark, TrendingUp } from "lucide-react";
import { MONTHS } from "../data/defaultCategories";
import {
  calculateFireProjection,
  getCurrentAgeFromDateOfBirth,
} from "../lib/fire";
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
  latestSnapshot: LatestSnapshot | null;
  onOpenConfig: () => void;
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
  latestSnapshot,
  onOpenConfig,
}: Props) {
  if (!latestSnapshot) {
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

  const projection = calculateFireProjection(
    latestSnapshot.total,
    fireSettings,
  );
  const currentAge = getCurrentAgeFromDateOfBirth(fireSettings.dateOfBirth);
  const fundedPercent = Math.max(0, projection.fundedRatio * 100);
  const retirementProjection = projection.retirementProjection;
  const targetAgeSummary =
    projection.targetYearsAway == null
      ? "Add your date of birth and target FIRE age in settings."
      : projection.requiredMonthlyContribution == null
        ? "Target age requires a savings level outside the planner range."
        : projection.requiredMonthlyContribution <=
            fireSettings.monthlyContribution
          ? `On track for age ${fireSettings.targetFireAge}.`
          : `${formatCurrency(projection.requiredMonthlyContribution)} per month needed to reach age ${fireSettings.targetFireAge}.`;

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
      value: formatYears(projection.yearsToFire),
      helper: `${formatCurrency(projection.annualContribution)} added yearly to liquid savings at ${formatPercent(fireSettings.expectedAnnualReturn)} return`,
      icon: TrendingUp,
      accent: "from-emerald-500/15 to-teal-500/5 text-emerald-700",
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

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-gray-900">
            <Flame size={19} className="text-amber-500" />
            <h2 className="text-lg font-semibold">FIRE Tracker</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Based on your latest recorded net worth from{" "}
            {MONTHS[latestSnapshot.monthIndex]} {latestSnapshot.year}.
          </p>
        </div>
        <button
          onClick={onOpenConfig}
          className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700"
        >
          Edit FIRE Settings
        </button>
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
        Gross net worth is {formatCurrency(projection.grossNetWorth)}. FIRE
        progress uses {formatCurrency(projection.accessibleNetWorth)} that is
        actually liquid or available under the configured withdrawal rules.
      </div>

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
                        {formatCurrency(member.projectedBalance)} projected ·{" "}
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
                      <th className="px-4 py-3 font-medium">Projected</th>
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
            </section>
          </div>
        </div>
      ) : null}
    </section>
  );
}
