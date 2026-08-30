import {
  getDefaultInvestmentPlannerData,
  sanitizeInvestmentPlannerData,
  type AllocationProfile,
  type InvestmentCategory,
  type InvestmentHolding,
  type InvestmentPlanSettings,
  type InvestmentPlannerData,
  type InvestmentRecommendationMode,
} from "./investmentPlanner";
import { apiGet, apiPut } from "./apiClient";

interface InvestmentPlanSettingsRow {
  monthly_investment_amount: number | string;
  rebalance_mode: string;
}

interface InvestmentCategoryRow {
  id: string;
  name: string;
  current_value: number | string;
  sort_order: number;
}

interface InvestmentHoldingRow {
  id: string;
  category_id: string | null;
  symbol: string;
  name: string;
  current_price: number | string;
  shares_owned: number | string;
  quote_updated_at: string | null;
  manual_price: number | string | null;
  manual_price_updated_at: string | null;
  sort_order: number;
}

interface AllocationProfileRow {
  id: string;
  name: string;
  min_years_until_fire: number | string | null;
  max_years_until_fire: number | string | null;
  sort_order: number;
}

interface AllocationTargetRow {
  profile_id: string;
  category_id: string;
  target_percentage: number | string;
}

function mapSettingsRowToSettings(
  row: InvestmentPlanSettingsRow | null | undefined,
): InvestmentPlanSettings {
  return {
    monthlyInvestmentAmount: Number(row?.monthly_investment_amount ?? 0),
    rebalanceMode:
      row?.rebalance_mode === "rebalance" ? "rebalance" : "buy-only",
  };
}

function mapHoldingRowToHolding(row: InvestmentHoldingRow): InvestmentHolding {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    sharesOwned: Number(row.shares_owned ?? 0),
    currentPrice: Number(row.current_price ?? 0),
    quoteUpdatedAt: row.quote_updated_at,
    manualPrice:
      row.manual_price == null ? null : Number(row.manual_price ?? 0),
    manualPriceUpdatedAt: row.manual_price_updated_at,
    sortOrder: row.sort_order,
  };
}

function mapCategoryRowToCategory(
  row: InvestmentCategoryRow,
  holdingRows: InvestmentHoldingRow[],
): InvestmentCategory {
  return {
    id: row.id,
    name: row.name,
    currentValue: Number(row.current_value),
    holdings: holdingRows
      .filter((holding) => holding.category_id === row.id)
      .map(mapHoldingRowToHolding),
    sortOrder: row.sort_order,
  };
}

function mapProfileRowToProfile(
  row: AllocationProfileRow,
  targets: AllocationTargetRow[],
): AllocationProfile {
  return {
    id: row.id,
    name: row.name,
    minYearsUntilFire:
      row.min_years_until_fire == null
        ? null
        : Number(row.min_years_until_fire),
    maxYearsUntilFire:
      row.max_years_until_fire == null
        ? null
        : Number(row.max_years_until_fire),
    sortOrder: row.sort_order,
    allocations: targets
      .filter((target) => target.profile_id === row.id)
      .reduce<Record<string, number>>((result, target) => {
        result[target.category_id] = Number(target.target_percentage);
        return result;
      }, {}),
  };
}

export async function loadInvestmentPlannerData(): Promise<InvestmentPlannerData> {
  const response = await apiGet<{
    settingsRow: InvestmentPlanSettingsRow | null;
    categoryRows: InvestmentCategoryRow[];
    holdingRows: InvestmentHoldingRow[];
    profileRows: AllocationProfileRow[];
    allocationRows: AllocationTargetRow[];
  }>("/api/investment-planner");

  const defaultData = getDefaultInvestmentPlannerData();
  const hasStoredData =
    response.categoryRows.length > 0 ||
    response.profileRows.length > 0 ||
    response.settingsRow != null ||
    response.holdingRows.length > 0;

  if (!hasStoredData) {
    return defaultData;
  }

  return sanitizeInvestmentPlannerData({
    categories: response.categoryRows.map((row) =>
      mapCategoryRowToCategory(row, response.holdingRows),
    ),
    profiles: response.profileRows.map((row) =>
      mapProfileRowToProfile(row, response.allocationRows),
    ),
    settings: mapSettingsRowToSettings(response.settingsRow),
  });
}

export async function replaceInvestmentPlannerData(
  nextData: InvestmentPlannerData,
): Promise<void> {
  const data = sanitizeInvestmentPlannerData(nextData);
  const categories = data.categories.map((category, categoryIndex) => ({
    ...category,
    sortOrder: categoryIndex,
    holdings: category.holdings.map((holding, holdingIndex) => ({
      ...holding,
      sortOrder: holdingIndex,
    })),
  }));
  const profiles = data.profiles.map((profile, index) => ({
    ...profile,
    sortOrder: index,
  }));

  await apiPut("/api/investment-planner", {
    settings: data.settings,
    categories,
    profiles,
  });
}

export type {
  AllocationProfile,
  InvestmentCategory,
  InvestmentHolding,
  InvestmentPlanSettings,
  InvestmentPlannerData,
  InvestmentRecommendationMode,
};
