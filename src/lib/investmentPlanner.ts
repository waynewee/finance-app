export type InvestmentRecommendationMode = "buy-only" | "rebalance";

export interface InvestmentHolding {
  id: string;
  symbol: string;
  name: string;
  sharesOwned: number;
  currentPrice: number;
  quoteUpdatedAt: string | null;
  manualPrice: number | null;
  manualPriceUpdatedAt: string | null;
  sortOrder: number;
}

export interface InvestmentCategory {
  id: string;
  name: string;
  currentValue: number;
  holdings: InvestmentHolding[];
  sortOrder: number;
}

export interface AllocationProfile {
  id: string;
  name: string;
  minYearsUntilFire: number | null;
  maxYearsUntilFire: number | null;
  sortOrder: number;
  allocations: Record<string, number>;
}

export interface InvestmentPlanSettings {
  monthlyInvestmentAmount: number;
  rebalanceMode: InvestmentRecommendationMode;
}

export interface InvestmentPlannerData {
  categories: InvestmentCategory[];
  profiles: AllocationProfile[];
  settings: InvestmentPlanSettings;
}

export interface ActiveAllocationProfile {
  profile: AllocationProfile | null;
  matchingProfiles: AllocationProfile[];
  normalizedAllocations: Record<string, number>;
  totalEnteredPercentage: number;
  usedFallbackProfile: boolean;
}

export interface InvestmentRecommendationRow {
  categoryId: string;
  categoryName: string;
  currentValue: number;
  currentAllocation: number;
  targetAllocation: number;
  targetValue: number;
  recommendationAmount: number;
  projectedValue: number;
  projectedAllocation: number;
  driftAmount: number;
  action: "buy" | "sell" | "hold";
}

export interface InvestmentRecommendationResult {
  rows: InvestmentRecommendationRow[];
  totalCurrentValue: number;
  totalProjectedValue: number;
  totalBuys: number;
  totalSells: number;
  netContribution: number;
  remainingCash: number;
}

const RECOMMENDED_FIRE_INVESTMENT_CATEGORIES: InvestmentCategory[] = [
  {
    id: "category_equities",
    name: "Equities",
    currentValue: 0,
    holdings: [],
    sortOrder: 0,
  },
  {
    id: "category_bonds",
    name: "Bonds",
    currentValue: 0,
    holdings: [],
    sortOrder: 1,
  },
  {
    id: "category_cash",
    name: "Cash",
    currentValue: 0,
    holdings: [],
    sortOrder: 2,
  },
];

const RECOMMENDED_FIRE_ALLOCATION_PROFILES: AllocationProfile[] = [
  {
    id: "profile_full_accumulation",
    name: "15+ years",
    minYearsUntilFire: 15,
    maxYearsUntilFire: null,
    sortOrder: 0,
    allocations: {
      category_equities: 100,
      category_bonds: 0,
      category_cash: 0,
    },
  },
  {
    id: "profile_late_accumulation",
    name: "5 to <15 years",
    minYearsUntilFire: 5,
    maxYearsUntilFire: 15,
    sortOrder: 1,
    allocations: {
      category_equities: 100,
      category_bonds: 0,
      category_cash: 0,
    },
  },
  {
    id: "profile_bond_tent",
    name: "3 to <5 years",
    minYearsUntilFire: 3,
    maxYearsUntilFire: 5,
    sortOrder: 2,
    allocations: {
      category_equities: 80,
      category_bonds: 20,
      category_cash: 0,
    },
  },
  {
    id: "profile_fire_runway",
    name: "0 to <3 years",
    minYearsUntilFire: 0,
    maxYearsUntilFire: 3,
    sortOrder: 3,
    allocations: {
      category_equities: 60,
      category_bonds: 30,
      category_cash: 10,
    },
  },
];

const DEFAULT_INVESTMENT_PLAN_SETTINGS: InvestmentPlanSettings = {
  monthlyInvestmentAmount: 0,
  rebalanceMode: "buy-only",
};

function clampNonNegativeNumber(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

export function normalizeInvestmentSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function sortBySortOrder<T extends { sortOrder: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.sortOrder - right.sortOrder);
}

export function normalizeAllocations(
  allocations: Record<string, number>,
): Record<string, number> {
  const normalizedEntries = Object.entries(allocations)
    .filter(([categoryId]) => categoryId.trim().length > 0)
    .map(
      ([categoryId, percentage]) =>
        [categoryId, clampNonNegativeNumber(Number(percentage))] as const,
    )
    .filter(([, percentage]) => percentage > 0);

  const total = normalizedEntries.reduce(
    (sum, [, percentage]) => sum + percentage,
    0,
  );

  if (total <= 0) {
    return {};
  }

  return normalizedEntries.reduce<Record<string, number>>(
    (result, [categoryId, percentage]) => {
      result[categoryId] = percentage / total;
      return result;
    },
    {},
  );
}

function sanitizeHolding(
  holding: InvestmentHolding,
  index: number,
): InvestmentHolding {
  return {
    id: holding.id,
    symbol: normalizeInvestmentSymbol(holding.symbol),
    name: holding.name.trim(),
    sharesOwned: clampNonNegativeNumber(holding.sharesOwned),
    currentPrice: clampNonNegativeNumber(holding.currentPrice),
    quoteUpdatedAt:
      typeof holding.quoteUpdatedAt === "string" &&
      holding.quoteUpdatedAt.trim().length > 0
        ? holding.quoteUpdatedAt
        : null,
    manualPrice:
      holding.manualPrice == null
        ? null
        : clampNonNegativeNumber(holding.manualPrice),
    manualPriceUpdatedAt:
      typeof holding.manualPriceUpdatedAt === "string" &&
      holding.manualPriceUpdatedAt.trim().length > 0
        ? holding.manualPriceUpdatedAt
        : null,
    sortOrder: index,
  };
}

export function getInvestmentHoldingLatestPrice(
  holding: InvestmentHolding,
): number {
  if (holding.manualPrice != null) {
    return clampNonNegativeNumber(holding.manualPrice);
  }

  return clampNonNegativeNumber(holding.currentPrice);
}

export function getInvestmentHoldingMarketValue(
  holding: InvestmentHolding,
): number {
  return roundCurrency(
    clampNonNegativeNumber(holding.sharesOwned) *
      getInvestmentHoldingLatestPrice(holding),
  );
}

export function getInvestmentCategoryCurrentValue(
  category: InvestmentCategory,
): number {
  const holdingsValue = (category.holdings ?? []).reduce(
    (sum, holding) => sum + getInvestmentHoldingMarketValue(holding),
    0,
  );

  return roundCurrency(
    clampNonNegativeNumber(category.currentValue) + holdingsValue,
  );
}

export function getTotalInvestmentPortfolioValue(
  categories: InvestmentCategory[],
): number {
  return roundCurrency(
    categories.reduce(
      (sum, category) => sum + getInvestmentCategoryCurrentValue(category),
      0,
    ),
  );
}

function sanitizeCategory(
  category: InvestmentCategory,
  index: number,
): InvestmentCategory {
  return {
    id: category.id,
    name: category.name.trim(),
    currentValue: clampNonNegativeNumber(category.currentValue),
    holdings: sortBySortOrder(category.holdings ?? []).map(sanitizeHolding),
    sortOrder: index,
  };
}

function sanitizeProfile(
  profile: AllocationProfile,
  index: number,
): AllocationProfile {
  const minYearsUntilFire =
    profile.minYearsUntilFire == null
      ? null
      : clampNonNegativeNumber(profile.minYearsUntilFire);
  const maxYearsUntilFire =
    profile.maxYearsUntilFire == null
      ? null
      : clampNonNegativeNumber(profile.maxYearsUntilFire);

  return {
    id: profile.id,
    name: profile.name.trim(),
    minYearsUntilFire,
    maxYearsUntilFire,
    sortOrder: index,
    allocations: Object.entries(profile.allocations).reduce<
      Record<string, number>
    >((result, [categoryId, percentage]) => {
      result[categoryId] = clampNonNegativeNumber(Number(percentage));
      return result;
    }, {}),
  };
}

export function getDefaultInvestmentPlannerData(): InvestmentPlannerData {
  return {
    categories: RECOMMENDED_FIRE_INVESTMENT_CATEGORIES.map((category) => ({
      ...category,
      holdings: [],
    })),
    profiles: RECOMMENDED_FIRE_ALLOCATION_PROFILES.map((profile) => ({
      ...profile,
      allocations: { ...profile.allocations },
    })),
    settings: { ...DEFAULT_INVESTMENT_PLAN_SETTINGS },
  };
}

export function getRecommendedFireInvestmentPlannerData(): InvestmentPlannerData {
  return getDefaultInvestmentPlannerData();
}

export function sanitizeInvestmentPlannerData(
  data: InvestmentPlannerData,
): InvestmentPlannerData {
  return {
    categories: data.categories.map(sanitizeCategory),
    profiles: data.profiles.map(sanitizeProfile),
    settings: {
      monthlyInvestmentAmount: clampNonNegativeNumber(
        data.settings.monthlyInvestmentAmount,
      ),
      rebalanceMode:
        data.settings.rebalanceMode === "rebalance" ? "rebalance" : "buy-only",
    },
  };
}

function matchesYearsUntilFire(
  yearsUntilFire: number,
  profile: AllocationProfile,
): boolean {
  if (
    profile.minYearsUntilFire != null &&
    yearsUntilFire < profile.minYearsUntilFire
  ) {
    return false;
  }

  if (
    profile.maxYearsUntilFire != null &&
    yearsUntilFire >= profile.maxYearsUntilFire
  ) {
    return false;
  }

  return true;
}

export function getActiveAllocationProfile(
  profiles: AllocationProfile[],
  yearsUntilFire: number | null,
): ActiveAllocationProfile {
  const sortedProfiles = sortBySortOrder(profiles);
  const matchingProfiles =
    yearsUntilFire == null
      ? []
      : sortedProfiles.filter((profile) =>
          matchesYearsUntilFire(yearsUntilFire, profile),
        );
  const selectedProfile = matchingProfiles[0] ?? sortedProfiles[0] ?? null;

  return {
    profile: selectedProfile,
    matchingProfiles,
    normalizedAllocations: normalizeAllocations(
      selectedProfile?.allocations ?? {},
    ),
    totalEnteredPercentage: Object.values(
      selectedProfile?.allocations ?? {},
    ).reduce(
      (sum, percentage) => sum + clampNonNegativeNumber(Number(percentage)),
      0,
    ),
    usedFallbackProfile:
      selectedProfile != null &&
      yearsUntilFire != null &&
      matchingProfiles.length === 0,
  };
}

function applyNetContributionRounding(
  values: number[],
  targetNetContribution: number,
): number[] {
  if (values.length === 0) {
    return values;
  }

  const roundedValues = values.map((value) => roundCurrency(value));
  const currentNetContribution = roundCurrency(
    roundedValues.reduce((sum, value) => sum + value, 0),
  );
  const adjustment = roundCurrency(
    targetNetContribution - currentNetContribution,
  );

  if (adjustment === 0) {
    return roundedValues;
  }

  let targetIndex = 0;
  let highestMagnitude = -1;

  roundedValues.forEach((value, index) => {
    const magnitude = Math.abs(value);
    if (magnitude > highestMagnitude) {
      highestMagnitude = magnitude;
      targetIndex = index;
    }
  });

  roundedValues[targetIndex] = roundCurrency(
    roundedValues[targetIndex] + adjustment,
  );
  return roundedValues;
}

export function calculateInvestmentRecommendations(options: {
  categories: InvestmentCategory[];
  allocations: Record<string, number>;
  monthlyInvestmentAmount: number;
  rebalanceMode: InvestmentRecommendationMode;
}): InvestmentRecommendationResult {
  const categories = sortBySortOrder(options.categories);
  const totalCurrentValue = getTotalInvestmentPortfolioValue(categories);
  const monthlyInvestmentAmount = roundCurrency(
    clampNonNegativeNumber(options.monthlyInvestmentAmount),
  );
  const totalProjectedValue = roundCurrency(
    totalCurrentValue + monthlyInvestmentAmount,
  );
  const allocationMap = normalizeAllocations(options.allocations);
  const deltas = categories.map((category) => {
    const currentValue = getInvestmentCategoryCurrentValue(category);
    const targetAllocation = allocationMap[category.id] ?? 0;
    const targetValue = totalProjectedValue * targetAllocation;
    return targetValue - currentValue;
  });

  const positiveDeficitTotal = deltas.reduce(
    (sum, delta) => sum + Math.max(delta, 0),
    0,
  );
  const rawRecommendations = categories.map((category, index) => {
    if (options.rebalanceMode === "rebalance") {
      return deltas[index];
    }

    if (monthlyInvestmentAmount <= 0) {
      return 0;
    }

    if (positiveDeficitTotal > 0) {
      return (
        (monthlyInvestmentAmount * Math.max(deltas[index], 0)) /
        positiveDeficitTotal
      );
    }

    return monthlyInvestmentAmount * (allocationMap[category.id] ?? 0);
  });

  const recommendationAmounts = applyNetContributionRounding(
    rawRecommendations,
    monthlyInvestmentAmount,
  );

  const rows = categories.map((category, index) => {
    const currentValue = getInvestmentCategoryCurrentValue(category);
    const targetAllocation = allocationMap[category.id] ?? 0;
    const targetValue = roundCurrency(totalProjectedValue * targetAllocation);
    const recommendationAmount = recommendationAmounts[index] ?? 0;
    const projectedValue = roundCurrency(currentValue + recommendationAmount);
    const currentAllocation =
      totalCurrentValue > 0 ? currentValue / totalCurrentValue : 0;
    const projectedAllocation =
      totalProjectedValue > 0 ? projectedValue / totalProjectedValue : 0;
    const driftAmount = roundCurrency(projectedValue - targetValue);

    return {
      categoryId: category.id,
      categoryName: category.name,
      currentValue,
      currentAllocation,
      targetAllocation,
      targetValue,
      recommendationAmount,
      projectedValue,
      projectedAllocation,
      driftAmount,
      action:
        recommendationAmount > 0
          ? "buy"
          : recommendationAmount < 0
            ? "sell"
            : "hold",
    } satisfies InvestmentRecommendationRow;
  });

  const totalBuys = roundCurrency(
    rows.reduce(
      (sum, row) =>
        sum + (row.recommendationAmount > 0 ? row.recommendationAmount : 0),
      0,
    ),
  );
  const totalSells = roundCurrency(
    rows.reduce(
      (sum, row) =>
        sum +
        (row.recommendationAmount < 0 ? Math.abs(row.recommendationAmount) : 0),
      0,
    ),
  );
  const netContribution = roundCurrency(totalBuys - totalSells);

  return {
    rows,
    totalCurrentValue,
    totalProjectedValue,
    totalBuys,
    totalSells,
    netContribution,
    remainingCash:
      options.rebalanceMode === "buy-only"
        ? roundCurrency(Math.max(monthlyInvestmentAmount - totalBuys, 0))
        : 0,
  };
}
