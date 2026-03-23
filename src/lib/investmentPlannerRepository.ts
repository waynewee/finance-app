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
import { supabase } from "./supabase";

interface InvestmentPlanSettingsRow {
  user_id: string;
  id: string;
  monthly_investment_amount: number;
  rebalance_mode: string;
  updated_at: string;
}

interface InvestmentCategoryRow {
  user_id: string;
  id: string;
  name: string;
  current_value: number;
  sort_order: number;
  updated_at: string;
}

interface InvestmentHoldingRow {
  user_id: string;
  id: string;
  category_id: string | null;
  symbol: string;
  name: string;
  target_percentage: number;
  current_price: number;
  share_increment: number;
  shares_owned: number;
  quote_updated_at: string | null;
  manual_price: number | null;
  manual_price_updated_at: string | null;
  sort_order: number;
  updated_at: string;
}

interface AllocationProfileRow {
  user_id: string;
  id: string;
  name: string;
  min_years_until_fire: number | null;
  max_years_until_fire: number | null;
  sort_order: number;
  updated_at: string;
}

interface AllocationTargetRow {
  user_id: string;
  profile_id: string;
  category_id: string;
  target_percentage: number;
  updated_at: string;
}

const INVESTMENT_PLAN_SETTINGS_ROW_ID = "primary";

function mapSettingsRowToSettings(
  row: InvestmentPlanSettingsRow | null | undefined,
): InvestmentPlanSettings {
  return {
    monthlyInvestmentAmount: Number(row?.monthly_investment_amount ?? 0),
    rebalanceMode:
      row?.rebalance_mode === "rebalance" ? "rebalance" : "buy-only",
  };
}

function mapSettingsToRow(
  userId: string,
  settings: InvestmentPlanSettings,
): InvestmentPlanSettingsRow {
  return {
    user_id: userId,
    id: INVESTMENT_PLAN_SETTINGS_ROW_ID,
    monthly_investment_amount: settings.monthlyInvestmentAmount,
    rebalance_mode: settings.rebalanceMode,
    updated_at: new Date().toISOString(),
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

function mapCategoryToRow(
  userId: string,
  category: InvestmentCategory,
): InvestmentCategoryRow {
  return {
    user_id: userId,
    id: category.id,
    name: category.name,
    current_value: category.currentValue,
    sort_order: category.sortOrder,
    updated_at: new Date().toISOString(),
  };
}

function mapHoldingToRow(
  userId: string,
  categoryId: string,
  holding: InvestmentHolding,
): InvestmentHoldingRow {
  return {
    user_id: userId,
    id: holding.id,
    category_id: categoryId,
    symbol: holding.symbol,
    name: holding.name,
    target_percentage: 0,
    current_price: holding.currentPrice,
    share_increment: 1,
    shares_owned: holding.sharesOwned,
    quote_updated_at: holding.quoteUpdatedAt,
    manual_price: holding.manualPrice,
    manual_price_updated_at: holding.manualPriceUpdatedAt,
    sort_order: holding.sortOrder,
    updated_at: new Date().toISOString(),
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

function mapProfileToRow(
  userId: string,
  profile: AllocationProfile,
): AllocationProfileRow {
  return {
    user_id: userId,
    id: profile.id,
    name: profile.name,
    min_years_until_fire: profile.minYearsUntilFire,
    max_years_until_fire: profile.maxYearsUntilFire,
    sort_order: profile.sortOrder,
    updated_at: new Date().toISOString(),
  };
}

function mapAllocationTargetsToRows(
  userId: string,
  profile: AllocationProfile,
): AllocationTargetRow[] {
  return Object.entries(profile.allocations)
    .filter(([categoryId]) => categoryId.trim().length > 0)
    .map(([categoryId, targetPercentage]) => ({
      user_id: userId,
      profile_id: profile.id,
      category_id: categoryId,
      target_percentage: targetPercentage,
      updated_at: new Date().toISOString(),
    }));
}

export async function loadInvestmentPlannerData(
  userId: string,
): Promise<InvestmentPlannerData> {
  const [
    { data: settingsRows, error: settingsError },
    { data: categoryRows, error: categoriesError },
    { data: holdingRows, error: holdingsError },
    { data: profileRows, error: profilesError },
    { data: allocationRows, error: allocationsError },
  ] = await Promise.all([
    supabase
      .from("investment_plan_settings")
      .select(
        "user_id, id, monthly_investment_amount, rebalance_mode, updated_at",
      )
      .eq("user_id", userId),
    supabase
      .from("investment_asset_categories")
      .select("user_id, id, name, current_value, sort_order, updated_at")
      .eq("user_id", userId)
      .order("sort_order"),
    supabase
      .from("investment_assets")
      .select(
        "user_id, id, category_id, symbol, name, target_percentage, current_price, share_increment, shares_owned, quote_updated_at, manual_price, manual_price_updated_at, sort_order, updated_at",
      )
      .eq("user_id", userId)
      .order("sort_order"),
    supabase
      .from("investment_allocation_profiles")
      .select(
        "user_id, id, name, min_years_until_fire, max_years_until_fire, sort_order, updated_at",
      )
      .eq("user_id", userId)
      .order("sort_order"),
    supabase
      .from("investment_profile_allocations")
      .select("user_id, profile_id, category_id, target_percentage, updated_at")
      .eq("user_id", userId),
  ]);

  const error =
    settingsError ??
    categoriesError ??
    holdingsError ??
    profilesError ??
    allocationsError;
  if (error) {
    throw error;
  }

  const defaultData = getDefaultInvestmentPlannerData();
  const hasStoredData =
    (categoryRows?.length ?? 0) > 0 ||
    (profileRows?.length ?? 0) > 0 ||
    (settingsRows?.length ?? 0) > 0 ||
    (holdingRows?.length ?? 0) > 0;

  if (!hasStoredData) {
    return defaultData;
  }

  return sanitizeInvestmentPlannerData({
    categories:
      (categoryRows ?? []).map((row) =>
        mapCategoryRowToCategory(row, holdingRows ?? []),
      ) ?? defaultData.categories,
    profiles:
      (profileRows ?? []).map((row) =>
        mapProfileRowToProfile(row, allocationRows ?? []),
      ) ?? defaultData.profiles,
    settings: mapSettingsRowToSettings(settingsRows?.[0]),
  });
}

export async function replaceInvestmentPlannerData(
  userId: string,
  nextData: InvestmentPlannerData,
): Promise<void> {
  const data = sanitizeInvestmentPlannerData(nextData);
  const nextCategories = data.categories.map((category, categoryIndex) => ({
    ...category,
    sortOrder: categoryIndex,
    holdings: category.holdings.map((holding, holdingIndex) => ({
      ...holding,
      sortOrder: holdingIndex,
    })),
  }));
  const nextProfiles = data.profiles.map((profile, index) => ({
    ...profile,
    sortOrder: index,
  }));
  const nextCategoryRows = nextCategories.map((category) =>
    mapCategoryToRow(userId, category),
  );
  const nextHoldingRows = nextCategories.flatMap((category) =>
    category.holdings.map((holding) =>
      mapHoldingToRow(userId, category.id, holding),
    ),
  );
  const nextProfileRows = nextProfiles.map((profile) =>
    mapProfileToRow(userId, profile),
  );
  const nextAllocationRows = nextProfiles.flatMap((profile) =>
    mapAllocationTargetsToRows(userId, profile),
  );

  const [
    { data: existingCategoryRows, error: categoriesReadError },
    { data: existingHoldingRows, error: holdingsReadError },
    { data: existingProfileRows, error: profilesReadError },
  ] = await Promise.all([
    supabase
      .from("investment_asset_categories")
      .select("id")
      .eq("user_id", userId),
    supabase.from("investment_assets").select("id").eq("user_id", userId),
    supabase
      .from("investment_allocation_profiles")
      .select("id")
      .eq("user_id", userId),
  ]);

  const readError =
    categoriesReadError ?? holdingsReadError ?? profilesReadError;
  if (readError) {
    throw readError;
  }

  const nextCategoryIds = new Set(nextCategoryRows.map((row) => row.id));
  const nextHoldingIds = new Set(nextHoldingRows.map((row) => row.id));
  const nextProfileIds = new Set(nextProfileRows.map((row) => row.id));
  const removedCategoryIds = (existingCategoryRows ?? [])
    .filter((row) => !nextCategoryIds.has(row.id))
    .map((row) => row.id);
  const removedHoldingIds = (existingHoldingRows ?? [])
    .filter((row) => !nextHoldingIds.has(row.id))
    .map((row) => row.id);
  const removedProfileIds = (existingProfileRows ?? [])
    .filter((row) => !nextProfileIds.has(row.id))
    .map((row) => row.id);

  if (removedHoldingIds.length > 0) {
    const { error } = await supabase
      .from("investment_assets")
      .delete()
      .eq("user_id", userId)
      .in("id", removedHoldingIds);

    if (error) {
      throw error;
    }
  }

  if (removedProfileIds.length > 0) {
    const { error } = await supabase
      .from("investment_allocation_profiles")
      .delete()
      .eq("user_id", userId)
      .in("id", removedProfileIds);

    if (error) {
      throw error;
    }
  }

  if (removedCategoryIds.length > 0) {
    const { error } = await supabase
      .from("investment_asset_categories")
      .delete()
      .eq("user_id", userId)
      .in("id", removedCategoryIds);

    if (error) {
      throw error;
    }
  }

  const { error: settingsError } = await supabase
    .from("investment_plan_settings")
    .upsert(mapSettingsToRow(userId, data.settings), {
      onConflict: "user_id,id",
    });

  if (settingsError) {
    throw settingsError;
  }

  if (nextCategoryRows.length > 0) {
    const { error } = await supabase
      .from("investment_asset_categories")
      .upsert(nextCategoryRows, { onConflict: "user_id,id" });

    if (error) {
      throw error;
    }
  }

  if (nextHoldingRows.length > 0) {
    const { error } = await supabase
      .from("investment_assets")
      .upsert(nextHoldingRows, { onConflict: "user_id,id" });

    if (error) {
      throw error;
    }
  }

  if (nextProfileRows.length > 0) {
    const { error } = await supabase
      .from("investment_allocation_profiles")
      .upsert(nextProfileRows, { onConflict: "user_id,id" });

    if (error) {
      throw error;
    }
  }

  const { error: deleteAllocationsError } = await supabase
    .from("investment_profile_allocations")
    .delete()
    .eq("user_id", userId);

  if (deleteAllocationsError) {
    throw deleteAllocationsError;
  }

  if (nextAllocationRows.length > 0) {
    const { error } = await supabase
      .from("investment_profile_allocations")
      .upsert(nextAllocationRows, {
        onConflict: "user_id,profile_id,category_id",
      });

    if (error) {
      throw error;
    }
  }
}

export type {
  AllocationProfile,
  InvestmentCategory,
  InvestmentHolding,
  InvestmentPlanSettings,
  InvestmentPlannerData,
  InvestmentRecommendationMode,
};
