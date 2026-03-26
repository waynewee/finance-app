import {
  Calculator,
  FileText,
  Flame,
  LineChart,
  PiggyBank,
  type LucideIcon,
} from "lucide-react";

interface CalculationEntry {
  title: string;
  source: string;
  explanation: string;
  formulas: string[];
}

interface CalculationSection {
  title: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
  entries: CalculationEntry[];
}

const calculationSections: CalculationSection[] = [
  {
    title: "Net Worth Totals",
    description:
      "Core rollups that power the table, yearly totals, and snapshot selection.",
    icon: LineChart,
    iconClassName: "from-[#EEF9EA] to-white text-[#1E7A18]",
    entries: [
      {
        title: "Monthly and category totals",
        source: "useNetWorthData.ts + NetWorthTable.tsx",
        explanation:
          "The app builds every month total from saved subcategory values that are not marked reference-only, then rolls those totals up again for category rows and the table footer.",
        formulas: [
          "monthTotal(year, month) = sum(all non-reference-only subcategory values for that month)",
          "categoryMonthTotal(year, month, category) = sum(all non-reference-only subcategory values inside that category for that month)",
          "subcategoryRowTotal(year, subcategory) = sum(Jan..Dec values for that subcategory)",
          "categoryRowTotal(year, category) = sum(Jan..Dec categoryMonthTotal values)",
          "grandTotal(year) = sum(Jan..Dec monthTotal values)",
        ],
      },
      {
        title: "Snapshot totals",
        source: "useNetWorthData.ts",
        explanation:
          "Latest and previous snapshots are derived by summing every non-reference-only stored value inside a recorded month, then sorting months from newest to oldest.",
        formulas: [
          "snapshotTotal(year, month) = sum(all stored subcategory values for that month where isReferenceOnly = false)",
          "latestSnapshot = first snapshot after sorting by year desc, month desc",
          "previousSnapshot = second snapshot after sorting by year desc, month desc",
        ],
      },
    ],
  },
  {
    title: "Summary Metrics",
    description:
      "The four cards in the net worth summary view are simple deltas and rates built from recorded snapshots.",
    icon: PiggyBank,
    iconClassName: "from-sky-50 to-white text-sky-700",
    entries: [
      {
        title: "Month-over-month and recorded-period change",
        source: "ProgressSummary.tsx",
        explanation:
          "The summary compares the selected anchor month against the prior recorded month and against the first recorded month in the included range.",
        formulas: [
          "monthOverMonthChange = anchorTotal - comparisonTotal",
          "monthOverMonthRate = comparisonTotal === 0 ? null : (monthOverMonthChange / abs(comparisonTotal)) * 100",
          "recordedPeriodChange = anchorTotal - firstTotal",
          "recordedPeriodRate = firstTotal === 0 ? null : (recordedPeriodChange / abs(firstTotal)) * 100",
        ],
      },
      {
        title: "Average monthly change",
        source: "ProgressSummary.tsx",
        explanation:
          "Average monthly change is the mean of each recorded step between consecutive snapshots in the selected range.",
        formulas: [
          "averageMonthlyChange = sum(snapshot[i] - snapshot[i-1]) / (includedSnapshots.length - 1)",
          "If fewer than 2 snapshots are included, averageMonthlyChange = 0",
        ],
      },
      {
        title: "Chart range presets",
        source: "NetWorthChart.tsx",
        explanation:
          "Quick presets are index math over the built month timeline, not separate financial calculations.",
        formulas: [
          "3M start index = max(0, lastIndex - 2)",
          "6M start index = max(0, lastIndex - 5)",
          "YTD start index = first index whose year matches the latest point year",
        ],
      },
    ],
  },
  {
    title: "FIRE Math",
    description:
      "These formulas drive the FIRE tracker, time-to-FIRE estimate, target-age savings requirement, and job-loss scenario.",
    icon: Flame,
    iconClassName: "from-orange-50 to-white text-orange-700",
    entries: [
      {
        title: "FIRE number and progress",
        source: "fire.ts",
        explanation:
          "The tracker converts the annual spending target and withdrawal rate into a FIRE number, then measures current accessible assets against it.",
        formulas: [
          "fireNumber = annualSpendingGoal / (withdrawalRate / 100)",
          "accessibleNetWorth = retirementProjection ? retirementProjection.breakdown.accessibleNow : currentNetWorth",
          "grossNetWorth = retirementProjection ? retirementProjection.breakdown.total : currentNetWorth",
          "gapToGoal = max(fireNumber - accessibleNetWorth, 0)",
          "fundedRatio = fireNumber > 0 ? accessibleNetWorth / fireNumber : 0",
          "fundedPercent = max(0, fundedRatio * 100)",
        ],
      },
      {
        title: "Compounding and months to FIRE",
        source: "fire.ts",
        explanation:
          "Non-retirement FIRE projections iterate balance month by month using a monthly return converted from the annual return.",
        formulas: [
          "monthlyReturnRate = (1 + expectedAnnualReturn / 100)^(1 / 12) - 1",
          "projectedBalance[nextMonth] = projectedBalance[thisMonth] * (1 + monthlyReturnRate) + monthlyContribution",
          "monthsToFire = first month where projectedBalance >= fireNumber",
          "yearsToFire = monthsToFire / 12",
        ],
      },
      {
        title: "Trailing-12-month savings inference",
        source: "fire.ts",
        explanation:
          "The current monthly savings figure is inferred from net worth history by backing out market growth and solving for the contribution that explains the observed change.",
        formulas: [
          "monthsBetween = (currentYear - previousYear) * 12 + (currentMonthIndex - previousMonthIndex)",
          "baselineWithoutContributions = projectBalance(previousBalance, 0, monthlyReturnRate, monthsBetween)",
          "futureValueFactor = monthlyReturnRate === 0 ? monthsBetween : ((1 + monthlyReturnRate)^monthsBetween - 1) / monthlyReturnRate",
          "inferredContribution = (actualEndingBalance - modeledEndingBalance) / futureValueFactor",
          "ttmAverageContribution = sum(interval contributions) / interval count",
        ],
      },
      {
        title: "Bonus normalization and job-loss scenario",
        source: "fire.ts",
        explanation:
          "Recurring bonuses are normalized into a monthly equivalent, one-off amounts are removed from the trailing window, and the job-loss scenario reduces savings temporarily.",
        formulas: [
          "recurringMonthlyContribution = max(inferredMonthlyContribution - annualBonusAmount / 12, 0)",
          "oneOffMonthlyEquivalent = oneOffAmount / 12",
          "jobLossMonthlyContribution = max(currentMonthlyContribution - jobLossMonthlySavingsReduction, 0)",
          "jobLossDelayMonths = max(jobLossMonthsToFire - baselineMonthsToFire, 0) when both projections resolve",
          "jobLossLowerBoundDelay = max(projectionMonthLimit - baselineMonthsToFire, 0) when the reduced-savings path exceeds the horizon",
        ],
      },
      {
        title: "Target-age monthly savings requirement",
        source: "fire.ts",
        explanation:
          "To hit a target FIRE age, the app binary-searches for the smallest monthly contribution that reaches the goal within the target window.",
        formulas: [
          "targetYearsAway = targetFireAge > currentAge ? targetFireAge - currentAge : null",
          "targetMonths = round(targetYearsAway * 12)",
          "high bound doubles until the projection reaches the target or exceeds 1,000,000 per month",
          "binary search runs 50 iterations and returns ceil(high) once the smallest successful contribution is bracketed",
        ],
      },
      {
        title: "Projection horizon limit",
        source: "fire.ts",
        explanation:
          "If a predicted death age is configured, the projection is capped to the number of full months between the reference snapshot and that age; otherwise the default ceiling is 100 years.",
        formulas: [
          "projectionMonthLimit = min(100 * 12, months until predicted death age)",
          "If the predicted death date is already in the past relative to the reference date, projectionMonthLimit = 0",
        ],
      },
    ],
  },
  {
    title: "Retirement Projection Engine",
    description:
      "Retirement math extends the FIRE model with account classifications, age-gated access, monthly contributions, drawdown income, and projected spending.",
    icon: Calculator,
    iconClassName: "from-violet-50 to-white text-violet-700",
    entries: [
      {
        title: "Annual return to monthly return",
        source: "retirementSystem.ts",
        explanation:
          "Both liquid balances and retirement accounts use monthly compounding derived from each annual return setting.",
        formulas: [
          "monthlyReturnRate = (1 + annualReturnRate / 100)^(1 / 12) - 1",
          "If annualReturnRate <= -100%, monthlyReturnRate is clamped to -1",
        ],
      },
      {
        title: "Starting balance alignment and accessibility",
        source: "retirementSystem.ts",
        explanation:
          "If imported retirement balances exceed the current net worth snapshot, the engine scales them down proportionally. Accessibility then depends on classification and withdrawal age.",
        formulas: [
          "trackedRetirementBalance = sum(all starting retirement account balances)",
          "If trackedRetirementBalance > currentNetWorth, scale = currentNetWorth / trackedRetirementBalance",
          "scaledAccountBalance = accountBalance * scale",
          "accessibleNow includes liquid and semi-liquid balances immediately, locked balances only when currentAge >= minimumWithdrawalAge, and never includes restricted balances",
        ],
      },
      {
        title: "Monthly projection loop",
        source: "retirementSystem.ts",
        explanation:
          "Each simulated month compounds balances, applies liquid inflows and retirement contributions, then deducts projected spending based on the current phase.",
        formulas: [
          "liquidBalance = liquidBalance * (1 + liquidMonthlyReturnRate) + liquidInflow",
          "accountBalance = accountBalance * (1 + accountMonthlyReturnRate)",
          "retirementContribution = max(sum(accountBalances after contributions) - retirementTotalBeforeContributions, 0)",
          "investmentGrowth = totalAfter - totalBefore - liquidInflow - retirementContribution",
          "monthsToFire = first simulated month where accessibleBalance >= fireNumber",
        ],
      },
      {
        title: "Contribution rules and allocations",
        source: "retirementSystem.ts",
        explanation:
          "Member-level contribution rules use age bands, income caps, employer plus employee rates, annual caps, and either direct account weights or grouped allocations.",
        formulas: [
          "contributableIncome = min(member.monthlyIncome, monthlyIncomeCap)",
          "monthlyContributionRate = employeeRate + employerRate",
          "totalContribution = (contributableIncome * monthlyContributionRate) / 100",
          "annualCapAdjustedContribution = min(totalContribution, max(annualContributionCap - usedYearToDateContribution, 0))",
          "directAllocationAmount = totalContribution * accountAllocation",
          "groupAllocationPerAccount = (totalContribution * groupAllocation) / matchingAccounts.length",
        ],
      },
      {
        title: "Retirement income and drawdown",
        source: "retirementSystem.ts",
        explanation:
          "When payout begins, projected income comes from account withdrawal rules. Spending first uses projected income, then liquid cash, then accessible principal.",
        formulas: [
          "annuityIncomePerMonth = (balance * annuityConversionRate) / 100 / 12",
          "drawdownIncomePerMonth = (balance * annualDrawdownRate) / 100 / 12",
          "incomeWithdrawal = min(monthlyIncome, balance)",
          "drawdown spending order = projected income -> liquid balance -> accessible principal",
          "pre-FIRE spending order = liquid balance -> accessible principal",
        ],
      },
    ],
  },
  {
    title: "Investment Planner",
    description:
      "Planner math selects an allocation profile from years-to-FIRE, rolls up holding-level market values into each category, and generates buy-only or rebalance recommendations.",
    icon: FileText,
    iconClassName: "from-amber-50 to-white text-amber-700",
    entries: [
      {
        title: "Profile selection by FIRE horizon",
        source: "InvestmentPlannerPage.tsx",
        explanation:
          "The planner computes years remaining until the configured target FIRE age, then picks the first allocation profile whose year-band contains that value.",
        formulas: [
          "yearsUntilFire = max(targetFireAge - currentAge, 0) when both inputs are set",
          "profile matches when yearsUntilFire >= minYearsUntilFire and yearsUntilFire < maxYearsUntilFire",
          "If no profile matches or FIRE age inputs are missing, the first profile is used as a fallback",
          "normalizedTargetWeight = enteredCategoryPercentage / sum(all entered category percentages in the active profile)",
        ],
      },
      {
        title: "Target value and rebalance delta",
        source: "InvestmentPlannerPage.tsx",
        explanation:
          "For each category, the planner first combines manual value with holding-level market value, then computes the post-contribution target dollar value and the gap versus that current category total.",
        formulas: [
          "holdingMarketValue = sharesOwned * latestPrice",
          "currentHoldingValue = manualCategoryValue + sum(all holdingMarketValue values in the category)",
          "projectedPortfolioValue = currentPortfolioValue + monthlyInvestmentAmount",
          "targetValue = projectedPortfolioValue * normalizedTargetWeight",
          "rebalanceDelta = targetValue - currentHoldingValue",
          "rebalance recommendation = rebalanceDelta, where positive means buy and negative means sell",
        ],
      },
      {
        title: "Buy-only contribution routing",
        source: "InvestmentPlannerPage.tsx",
        explanation:
          "Buy-only mode never suggests sells. Instead, it distributes the new monthly contribution across categories in proportion to their positive deficits versus the post-contribution target.",
        formulas: [
          "positiveDeficit = max(rebalanceDelta, 0)",
          "sumPositiveDeficits = sum(all positiveDeficit values)",
          "buyOnlyRecommendation = monthlyInvestmentAmount * positiveDeficit / sumPositiveDeficits when sumPositiveDeficits > 0",
          "If all deficits are zero, buy-only mode falls back to normalized target weights",
        ],
      },
    ],
  },
];

export default function CalculationsPage() {
  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 text-gray-900">
              <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-3 text-white shadow-sm">
                <Calculator size={20} />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Calculations</h2>
                <p className="mt-1 text-sm text-gray-500">
                  This mode documents the formulas that drive the app's net
                  worth rollups, summary cards, FIRE estimates, retirement
                  projection engine, and investment planner.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
              Documentation scope: calculations that materially affect app
              outputs are included here. Formatting helpers, input parsing, and
              purely visual thresholds are only listed when they change a user-
              visible result.
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:w-[360px] lg:grid-cols-1 xl:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Covered areas
              </p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {calculationSections.length}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Documented groups
              </p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {calculationSections.reduce(
                  (sum, section) => sum + section.entries.length,
                  0,
                )}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Source of truth
              </p>
              <p className="mt-2 text-sm font-semibold text-gray-900">
                Repository code
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        {calculationSections.map((section) => {
          const Icon = section.icon;

          return (
            <section
              key={section.title}
              className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <div className="flex items-center gap-3 text-gray-900">
                    <div
                      className={`rounded-2xl bg-gradient-to-br p-3 ${section.iconClassName}`}
                    >
                      <Icon size={19} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{section.title}</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {section.description}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  {section.entries.length} documented calculation
                  {section.entries.length === 1 ? "" : "s"}
                </div>
              </div>

              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                {section.entries.map((entry) => (
                  <article
                    key={entry.title}
                    className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h4 className="text-base font-semibold text-gray-900">
                        {entry.title}
                      </h4>
                      <span className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                        {entry.source}
                      </span>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-gray-600">
                      {entry.explanation}
                    </p>

                    <div className="mt-4 rounded-2xl bg-slate-950 px-4 py-4 font-mono text-xs leading-6 text-emerald-200 shadow-inner">
                      {entry.formulas.map((formula) => (
                        <div key={formula}>{formula}</div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
