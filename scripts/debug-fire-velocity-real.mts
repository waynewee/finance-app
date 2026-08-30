import { readFileSync } from "node:fs";
import {
  calculateFireVelocity,
  type FireProjectionSnapshot,
} from "../src/lib/fire.ts";
import type { FireSettings } from "../src/lib/netWorthRepository.ts";
import type { RetirementSystemConfig } from "../src/lib/retirementSystem.ts";

// Raw dump of GET /api/net-worth, saved via:
//   Invoke-RestMethod http://localhost:5173/api/net-worth | ConvertTo-Json -Depth 10 > dump.json
const dump = JSON.parse(
  readFileSync(
    process.env.NETWORTH_DUMP_PATH ?? `${process.env.TEMP}/networth-dump.json`,
    "utf8",
  ),
);

interface CategoryRow {
  id: string;
  name: string;
  archived: boolean | null;
  sort_order: number;
}
interface SubcategoryRow {
  id: string;
  category_id: string;
  name: string;
  archived: boolean | null;
  is_reference_only: boolean | null;
  sort_order: number;
}
interface MonthlyValueRow {
  year: number;
  month: number;
  subcategory_id: string;
  value: number | string;
}
interface FireSettingsRow {
  annual_spending_goal: number | string;
  pre_fire_annual_spending?: number | string | null;
  withdrawal_rate: number | string;
  expected_annual_return: number | string;
  time_to_fire_algorithm?: string | null;
  annual_bonus_amount?: number | string | null;
  non_recurring_bonus_amount?: number | string | null;
  job_loss_monthly_savings_reduction?: number | string | null;
  job_loss_monthly_savings_reduction_months?: number | null;
  annual_bonus_month_added?: string | null;
  non_recurring_bonus_month_added?: string | null;
  retirement_system?: RetirementSystemConfig | null;
  current_age?: number | null;
  date_of_birth?: string | null;
  target_fire_age: number | null;
  predicted_death_age?: number | null;
  contribution_stop_age?: number | null;
}

const categoryRows: CategoryRow[] = dump.categoryRows;
const subcategoryRows: SubcategoryRow[] = dump.subcategoryRows;
const monthlyRows: MonthlyValueRow[] = dump.monthlyRows;
const fireSettingsRow: FireSettingsRow | null = dump.fireSettingsRow;

// --- replicate mapFireSettingsRow from src/lib/netWorthRepository.ts ---
function mapFireSettingsRow(row: FireSettingsRow | null): FireSettings {
  if (!row) throw new Error("no fire settings row");
  return {
    annualSpendingGoal: Number(row.annual_spending_goal),
    preFireAnnualSpending: Number(row.pre_fire_annual_spending ?? 0),
    withdrawalRate: Number(row.withdrawal_rate),
    expectedAnnualReturn: Number(row.expected_annual_return),
    timeToFireAlgorithm: "ttm",
    annualBonusAmount: Number(row.annual_bonus_amount ?? 0),
    nonRecurringBonusAmount: Number(row.non_recurring_bonus_amount ?? 0),
    jobLossMonthlySavingsReduction: Number(
      row.job_loss_monthly_savings_reduction ?? 0,
    ),
    jobLossMonthlySavingsReductionMonths:
      row.job_loss_monthly_savings_reduction_months == null
        ? null
        : Math.max(
            1,
            Math.round(row.job_loss_monthly_savings_reduction_months),
          ),
    annualBonusMonthAdded: row.annual_bonus_month_added
      ? row.annual_bonus_month_added.slice(0, 7)
      : null,
    nonRecurringBonusMonthAdded: row.non_recurring_bonus_month_added
      ? row.non_recurring_bonus_month_added.slice(0, 7)
      : null,
    dateOfBirth: row.date_of_birth ?? null,
    targetFireAge: row.target_fire_age,
    predictedDeathAge: row.predicted_death_age ?? null,
    retirementContributionStopAge:
      row.contribution_stop_age ?? row.target_fire_age,
    retirementSystem: row.retirement_system ?? null,
  };
}

// --- replicate getIncludedSubcategoryIds + getSortedSnapshots from src/hooks/useNetWorthData.ts ---
const includedSubcategoryIds = new Set(
  subcategoryRows.filter((s) => !s.is_reference_only).map((s) => s.id),
);

const monthlyData: Record<string, Record<number, Record<string, number>>> = {};
for (const row of monthlyRows) {
  const yearKey = String(row.year);
  monthlyData[yearKey] ??= {};
  monthlyData[yearKey][row.month] ??= {};
  monthlyData[yearKey][row.month][row.subcategory_id] = Number(row.value);
}

interface Snapshot extends FireProjectionSnapshot {}
const snapshots: Snapshot[] = [];
const yearKeys = Object.keys(monthlyData)
  .map(Number)
  .sort((a, b) => b - a);
for (const year of yearKeys) {
  const months = monthlyData[String(year)];
  const monthIndexes = Object.keys(months)
    .map(Number)
    .sort((a, b) => b - a);
  for (const monthIndex of monthIndexes) {
    const values = months[monthIndex];
    let total = 0;
    for (const [subId, value] of Object.entries(values)) {
      if (!includedSubcategoryIds.has(subId) || !Number.isFinite(value))
        continue;
      total += value;
    }
    snapshots.push({ year, monthIndex, total });
  }
}

console.log("All sorted snapshots (newest first):");
snapshots.forEach((s, i) =>
  console.log(
    `  [${i}] ${s.year}-${String(s.monthIndex + 1).padStart(2, "0")} = ${s.total}`,
  ),
);

const realSettings = mapFireSettingsRow(fireSettingsRow);
console.log("\nReal fire settings:", {
  ...realSettings,
  retirementSystem: realSettings.retirementSystem ? "<present>" : null,
});

// App uses getPreviousSnapshot() = snapshots[1] (second-newest) as the FIRE Progress anchor.
const anchorIndex = 1;
console.log(
  `\nAnchor snapshot [index ${anchorIndex}]:`,
  snapshots[anchorIndex],
);

const result = calculateFireVelocity(snapshots, anchorIndex, realSettings);

console.log("\nAll 12 window points (monthIndex 11=newest .. 0=oldest):");
result.points.forEach((p) =>
  console.log(`  monthIndex=${p.monthIndex}  monthsToFire=${p.monthsToFire}`),
);

console.log("\nValid point count:", result.validPointCount);
console.log("Slope:", result.slope);
console.log("Velocity (-slope):", result.velocity);
