import {
  DEFAULT_CATEGORIES,
  normalizeCategories,
  type Category,
} from "../data/defaultCategories";
import type { RetirementSystemConfig } from "./retirementSystem";
import { apiGet, apiPatch } from "./apiClient";

export type FireTimeToFireAlgorithm = "ttm";

export interface FireSettings {
  annualSpendingGoal: number;
  preFireAnnualSpending: number;
  withdrawalRate: number;
  expectedAnnualReturn: number;
  timeToFireAlgorithm: FireTimeToFireAlgorithm;
  annualBonusAmount: number;
  nonRecurringBonusAmount: number;
  jobLossMonthlySavingsReduction: number;
  jobLossMonthlySavingsReductionMonths: number | null;
  annualBonusMonthAdded: string | null;
  nonRecurringBonusMonthAdded: string | null;
  dateOfBirth: string | null;
  targetFireAge: number | null;
  predictedDeathAge: number | null;
  retirementContributionStopAge: number | null;
  retirementSystem: RetirementSystemConfig | null;
}

export const DEFAULT_FIRE_SETTINGS: FireSettings = {
  annualSpendingGoal: 60_000,
  preFireAnnualSpending: 0,
  withdrawalRate: 4,
  expectedAnnualReturn: 7,
  timeToFireAlgorithm: "ttm",
  annualBonusAmount: 0,
  nonRecurringBonusAmount: 0,
  jobLossMonthlySavingsReduction: 0,
  jobLossMonthlySavingsReductionMonths: null,
  annualBonusMonthAdded: null,
  nonRecurringBonusMonthAdded: null,
  dateOfBirth: null,
  targetFireAge: null,
  predictedDeathAge: null,
  retirementContributionStopAge: null,
  retirementSystem: null,
};

export type MonthlyData = Record<
  string,
  Record<number, Record<string, number>>
>;

export interface NetWorthState {
  categories: Category[];
  monthlyData: MonthlyData;
  fireSettings: FireSettings;
}

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

const NET_WORTH_STATE_CACHE_KEY = "finance_app_net_worth_state";
const NET_WORTH_STATE_CACHE_VERSION = 3;

interface CachedNetWorthState {
  version: number;
  savedAt: string;
  state: NetWorthState;
}

let inMemoryNetWorthStateCache: CachedNetWorthState | null = null;

function inferDateOfBirthFromCurrentAge(
  currentAge: number | null | undefined,
): string | null {
  if (currentAge == null || currentAge <= 0) {
    return null;
  }

  const currentYear = new Date().getFullYear();
  return `${currentYear - currentAge}-01-01`;
}

function mapFireSettingsRow(row?: FireSettingsRow | null): FireSettings {
  if (!row) {
    return DEFAULT_FIRE_SETTINGS;
  }

  const timeToFireAlgorithm =
    row.time_to_fire_algorithm === "ttm" ? "ttm" : "ttm";

  return {
    annualSpendingGoal: Number(row.annual_spending_goal),
    preFireAnnualSpending: Number(row.pre_fire_annual_spending ?? 0),
    withdrawalRate: Number(row.withdrawal_rate),
    expectedAnnualReturn: Number(row.expected_annual_return),
    timeToFireAlgorithm,
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
    dateOfBirth:
      row.date_of_birth ?? inferDateOfBirthFromCurrentAge(row.current_age),
    targetFireAge: row.target_fire_age,
    predictedDeathAge: row.predicted_death_age ?? null,
    retirementContributionStopAge:
      row.contribution_stop_age ?? row.target_fire_age,
    retirementSystem: row.retirement_system ?? null,
  };
}

function buildCategories(
  categoryRows: CategoryRow[],
  subcategoryRows: SubcategoryRow[],
): Category[] {
  return normalizeCategories(
    categoryRows.map((categoryRow) => ({
      id: categoryRow.id,
      name: categoryRow.name,
      archived: categoryRow.archived ?? false,
      subcategories: subcategoryRows
        .filter(
          (subcategoryRow) => subcategoryRow.category_id === categoryRow.id,
        )
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((subcategoryRow) => ({
          id: subcategoryRow.id,
          name: subcategoryRow.name,
          archived: subcategoryRow.archived ?? false,
          isReferenceOnly: subcategoryRow.is_reference_only ?? false,
        })),
    })),
  );
}

function buildMonthlyData(rows: MonthlyValueRow[]): MonthlyData {
  return rows.reduce<MonthlyData>((result, row) => {
    const yearKey = String(row.year);
    result[yearKey] ??= {};
    result[yearKey][row.month] ??= {};
    result[yearKey][row.month][row.subcategory_id] = Number(row.value);
    return result;
  }, {});
}

export async function loadNetWorthState(): Promise<{
  categories: Category[];
  monthlyData: MonthlyData;
  fireSettings: FireSettings;
}> {
  const response = await apiGet<{
    categoryRows: CategoryRow[];
    subcategoryRows: SubcategoryRow[];
    monthlyRows: MonthlyValueRow[];
    fireSettingsRow: FireSettingsRow | null;
  }>("/api/net-worth");

  if (response.categoryRows.length === 0) {
    await replaceCategories(DEFAULT_CATEGORIES);
    return {
      categories: DEFAULT_CATEGORIES,
      monthlyData: {},
      fireSettings: DEFAULT_FIRE_SETTINGS,
    };
  }

  return {
    categories: buildCategories(
      response.categoryRows,
      response.subcategoryRows,
    ),
    monthlyData: buildMonthlyData(response.monthlyRows),
    fireSettings: mapFireSettingsRow(response.fireSettingsRow),
  };
}

export function getCachedNetWorthState(): NetWorthState | null {
  if (inMemoryNetWorthStateCache?.version === NET_WORTH_STATE_CACHE_VERSION) {
    return inMemoryNetWorthStateCache.state;
  }

  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(NET_WORTH_STATE_CACHE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as CachedNetWorthState;
    if (parsed.version !== NET_WORTH_STATE_CACHE_VERSION || !parsed.state) {
      return null;
    }

    inMemoryNetWorthStateCache = parsed;
    return parsed.state;
  } catch {
    return null;
  }
}

export function cacheNetWorthState(state: NetWorthState): void {
  const cachedState: CachedNetWorthState = {
    version: NET_WORTH_STATE_CACHE_VERSION,
    savedAt: new Date().toISOString(),
    state,
  };

  inMemoryNetWorthStateCache = cachedState;

  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }

  window.localStorage.setItem(
    NET_WORTH_STATE_CACHE_KEY,
    JSON.stringify(cachedState),
  );
}

export async function saveMonthlyValue(
  year: number,
  month: number,
  subcategoryId: string,
  value: number,
): Promise<void> {
  await apiPatch("/api/net-worth", {
    type: "monthly-value",
    payload: { year, month, subcategoryId, value },
  });
}

export async function replaceYearMonthlyValues(
  year: number,
  valuesBySubcategory: Record<string, number[]>,
): Promise<void> {
  await apiPatch("/api/net-worth", {
    type: "year",
    payload: { year, valuesBySubcategory },
  });
}

export async function replaceCategories(categories: Category[]): Promise<void> {
  await apiPatch("/api/net-worth", {
    type: "categories",
    payload: categories,
  });
}

export async function saveFireSettings(settings: FireSettings): Promise<void> {
  await apiPatch("/api/net-worth", {
    type: "fire-settings",
    payload: settings,
  });
}
