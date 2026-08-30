import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Plus,
  RefreshCw,
  Save,
  Target,
  Trash2,
  Wand2,
} from "lucide-react";
import { useInvestmentPlanner } from "../hooks/useInvestmentPlanner";
import { getCurrentAgeFromDateOfBirth } from "../lib/fire";
import { fetchLiveQuotes } from "../lib/livePriceService";
import {
  calculateInvestmentRecommendations,
  getActiveAllocationProfile,
  getDefaultInvestmentPlannerData,
  getInvestmentCategoryCurrentValue,
  getInvestmentHoldingLatestPrice,
  getInvestmentHoldingMarketValue,
  getRecommendedFireInvestmentPlannerData,
  getTotalInvestmentPortfolioValue,
  normalizeInvestmentSymbol,
  type AllocationProfile,
  type InvestmentCategory,
  type InvestmentHolding,
  type InvestmentPlannerData,
  type InvestmentRecommendationMode,
} from "../lib/investmentPlanner";
import { type FireSettings } from "../lib/netWorthRepository";
import { maskDisplayValue, maskInlineNumbers } from "../lib/valueMasking";

interface Props {
  hideValues: boolean;
  fireSettings: FireSettings;
}

type NoticeTone = "amber" | "emerald";
type PlannerView = "details" | "settings";

function createCategoryId(): string {
  return `category_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createProfileId(): string {
  return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createHoldingId(): string {
  return `holding_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createBlankCategory(sortOrder: number): InvestmentCategory {
  return {
    id: createCategoryId(),
    name: "",
    currentValue: 0,
    holdings: [],
    sortOrder,
  };
}

function createBlankProfile(sortOrder: number): AllocationProfile {
  return {
    id: createProfileId(),
    name: "",
    minYearsUntilFire: null,
    maxYearsUntilFire: null,
    sortOrder,
    allocations: {},
  };
}

function createBlankHolding(sortOrder: number): InvestmentHolding {
  return {
    id: createHoldingId(),
    symbol: "",
    name: "",
    sharesOwned: 0,
    currentPrice: 0,
    quoteUpdatedAt: null,
    manualPrice: null,
    manualPriceUpdatedAt: null,
    sortOrder,
  };
}

function parseNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOptionalNumber(value: string): number | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const parsed = Number(trimmedValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatEnteredPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatYears(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "Set in FIRE Tracker";
  }

  return `${value.toFixed(value % 1 === 0 ? 0 : 1)} years`;
}

function formatYearBandValue(value: number): string {
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
}

function formatYearBandLabel(profile: AllocationProfile | null): string {
  if (!profile) {
    return "No profiles configured";
  }

  if (profile.minYearsUntilFire == null && profile.maxYearsUntilFire == null) {
    return "All horizons";
  }

  if (profile.maxYearsUntilFire == null) {
    return `${formatYearBandValue(profile.minYearsUntilFire ?? 0)}+ years to FIRE`;
  }

  if (profile.minYearsUntilFire == null || profile.minYearsUntilFire <= 0) {
    return `< ${formatYearBandValue(profile.maxYearsUntilFire)} years to FIRE`;
  }

  return `${formatYearBandValue(profile.minYearsUntilFire)} to < ${formatYearBandValue(profile.maxYearsUntilFire)} years`;
}

function formatQuoteTimestamp(value: string | null): string {
  if (!value) {
    return "Not refreshed yet";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Not refreshed yet";
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatHoldingPriceStatus(holding: InvestmentHolding): string {
  if (holding.manualPrice != null) {
    return holding.manualPriceUpdatedAt
      ? `Manual override saved ${formatQuoteTimestamp(holding.manualPriceUpdatedAt)}`
      : "Manual override in use";
  }

  if (holding.currentPrice > 0) {
    return `Live quote from ${formatQuoteTimestamp(holding.quoteUpdatedAt)}`;
  }

  return "No latest price saved";
}

function getModeLabel(mode: InvestmentRecommendationMode): string {
  return mode === "rebalance" ? "Sell and rebalance" : "Buy only";
}

function getNoticeClassName(tone: NoticeTone): string {
  return tone === "emerald"
    ? "mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
    : "mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800";
}

export default function InvestmentPlannerPage({
  hideValues,
  fireSettings,
}: Props) {
  const { plan, isLoading, error, savePlan } = useInvestmentPlanner();
  const [draftPlan, setDraftPlan] = useState<InvestmentPlannerData>(
    getDefaultInvestmentPlannerData(),
  );
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [quoteNotice, setQuoteNotice] = useState<string | null>(null);
  const [quoteNoticeTone, setQuoteNoticeTone] = useState<NoticeTone>("emerald");
  const [isRefreshingQuotes, setIsRefreshingQuotes] = useState(false);
  const [activeView, setActiveView] = useState<PlannerView>("details");

  const refreshHoldingPrices = useCallback(
    async (
      planToRefresh: InvestmentPlannerData,
      options?: { silent?: boolean },
    ) => {
      const symbols = Array.from(
        new Set(
          planToRefresh.categories.flatMap((category) =>
            category.holdings
              .map((holding) => normalizeInvestmentSymbol(holding.symbol))
              .filter((symbol) => symbol.length > 0),
          ),
        ),
      );

      if (symbols.length === 0) {
        if (!options?.silent) {
          setQuoteNotice("Add at least one holding symbol to refresh prices.");
          setQuoteNoticeTone("amber");
        }
        return;
      }

      setIsRefreshingQuotes(true);

      try {
        const quotes = await fetchLiveQuotes(symbols);
        const fetchedAt = new Date().toISOString();

        setDraftPlan((current) => ({
          ...current,
          categories: current.categories.map((category) => ({
            ...category,
            holdings: category.holdings.map((holding) => {
              const quote = quotes.get(
                normalizeInvestmentSymbol(holding.symbol),
              );
              if (!quote) {
                return holding;
              }

              return {
                ...holding,
                currentPrice: quote.price,
                quoteUpdatedAt: fetchedAt,
              };
            }),
          })),
        }));

        if (!options?.silent || quotes.size > 0) {
          const missingQuotes = symbols.length - quotes.size;
          if (quotes.size === 0) {
            setQuoteNotice(
              "No prices were returned for the current holding symbols.",
            );
            setQuoteNoticeTone("amber");
          } else if (missingQuotes > 0) {
            setQuoteNotice(
              `Updated ${quotes.size} holding prices. ${missingQuotes} symbol${missingQuotes === 1 ? "" : "s"} did not return a live quote.`,
            );
            setQuoteNoticeTone("amber");
          } else {
            setQuoteNotice(
              `Updated ${quotes.size} holding price${quotes.size === 1 ? "" : "s"}.`,
            );
            setQuoteNoticeTone("emerald");
          }
        }
      } catch (refreshError) {
        if (!options?.silent) {
          setQuoteNotice(
            refreshError instanceof Error
              ? refreshError.message
              : "Failed to refresh holding prices.",
          );
          setQuoteNoticeTone("amber");
        }
      } finally {
        setIsRefreshingQuotes(false);
      }
    },
    [],
  );

  useEffect(() => {
    setDraftPlan(plan);
    setQuoteNotice(null);

    const hasSymbols = plan.categories.some((category: InvestmentCategory) =>
      category.holdings.some(
        (holding: InvestmentHolding) =>
          normalizeInvestmentSymbol(holding.symbol).length > 0,
      ),
    );

    if (hasSymbols) {
      void refreshHoldingPrices(plan, { silent: true });
    }
  }, [plan, refreshHoldingPrices]);

  const currentAge = useMemo(
    () => getCurrentAgeFromDateOfBirth(fireSettings.dateOfBirth),
    [fireSettings.dateOfBirth],
  );
  const yearsUntilFire = useMemo(() => {
    if (
      currentAge == null ||
      fireSettings.targetFireAge == null ||
      fireSettings.targetFireAge <= currentAge
    ) {
      return fireSettings.targetFireAge != null && currentAge != null
        ? 0
        : null;
    }

    return fireSettings.targetFireAge - currentAge;
  }, [currentAge, fireSettings.targetFireAge]);

  const activeProfile = useMemo(
    () => getActiveAllocationProfile(draftPlan.profiles, yearsUntilFire),
    [draftPlan.profiles, yearsUntilFire],
  );
  const recommendationResult = useMemo(
    () =>
      calculateInvestmentRecommendations({
        categories: draftPlan.categories,
        allocations: activeProfile.normalizedAllocations,
        monthlyInvestmentAmount: draftPlan.settings.monthlyInvestmentAmount,
        rebalanceMode: draftPlan.settings.rebalanceMode,
      }),
    [
      activeProfile.normalizedAllocations,
      draftPlan.categories,
      draftPlan.settings.monthlyInvestmentAmount,
      draftPlan.settings.rebalanceMode,
    ],
  );
  const categorySummaries = useMemo(() => {
    const totalPortfolioValue = getTotalInvestmentPortfolioValue(
      draftPlan.categories,
    );

    return draftPlan.categories.map((category) => {
      const holdingsValue = category.holdings.reduce(
        (sum, holding) => sum + getInvestmentHoldingMarketValue(holding),
        0,
      );
      const totalValue = getInvestmentCategoryCurrentValue(category);

      return {
        category,
        holdingsValue,
        totalValue,
        currentAllocation:
          totalPortfolioValue > 0 ? totalValue / totalPortfolioValue : 0,
      };
    });
  }, [draftPlan.categories]);
  const holdingRows = useMemo(
    () =>
      draftPlan.categories.flatMap((category) =>
        category.holdings.map((holding) => ({
          categoryId: category.id,
          categoryName: category.name,
          holding,
        })),
      ),
    [draftPlan.categories],
  );

  const displayCurrency = (value: number): string =>
    maskDisplayValue(formatCurrency(value), hideValues);
  const displayPercent = (value: number): string =>
    maskDisplayValue(formatPercent(value), hideValues);
  const displayEnteredPercent = (value: number): string =>
    maskDisplayValue(formatEnteredPercent(value), hideValues);

  const updatePlan = (
    updater: (current: InvestmentPlannerData) => InvestmentPlannerData,
  ) => {
    setDraftPlan((current) => updater(current));
    setSaveNotice(null);
  };

  const updateCategory = (
    categoryId: string,
    field: keyof Pick<InvestmentCategory, "name" | "currentValue">,
    value: string,
  ) => {
    updatePlan((current) => ({
      ...current,
      categories: current.categories.map((category) => {
        if (category.id !== categoryId) {
          return category;
        }

        return {
          ...category,
          [field]: field === "currentValue" ? parseNumber(value) : value,
        };
      }),
    }));
  };

  const updateHolding = (
    categoryId: string,
    holdingId: string,
    field: keyof Pick<
      InvestmentHolding,
      "symbol" | "name" | "sharesOwned" | "manualPrice"
    >,
    value: string,
  ) => {
    updatePlan((current) => ({
      ...current,
      categories: current.categories.map((category) => {
        if (category.id !== categoryId) {
          return category;
        }

        return {
          ...category,
          holdings: category.holdings.map((holding) => {
            if (holding.id !== holdingId) {
              return holding;
            }

            if (field === "sharesOwned") {
              return {
                ...holding,
                sharesOwned: parseNumber(value),
              };
            }

            if (field === "manualPrice") {
              const manualPrice = parseOptionalNumber(value);

              return {
                ...holding,
                manualPrice,
                manualPriceUpdatedAt:
                  manualPrice == null ? null : new Date().toISOString(),
              };
            }

            if (field === "symbol") {
              const nextSymbol = normalizeInvestmentSymbol(value);
              const symbolChanged =
                nextSymbol !== normalizeInvestmentSymbol(holding.symbol);

              return {
                ...holding,
                symbol: nextSymbol,
                currentPrice: symbolChanged ? 0 : holding.currentPrice,
                quoteUpdatedAt: symbolChanged ? null : holding.quoteUpdatedAt,
                manualPrice: symbolChanged ? null : holding.manualPrice,
                manualPriceUpdatedAt: symbolChanged
                  ? null
                  : holding.manualPriceUpdatedAt,
              };
            }

            return {
              ...holding,
              name: value,
            };
          }),
        };
      }),
    }));
  };

  const addCategory = () => {
    const nextCategory = createBlankCategory(draftPlan.categories.length);

    updatePlan((current) => ({
      ...current,
      categories: [...current.categories, nextCategory],
      profiles: current.profiles.map((profile) => ({
        ...profile,
        allocations: {
          ...profile.allocations,
          [nextCategory.id]: 0,
        },
      })),
    }));
  };

  const removeCategory = (categoryId: string) => {
    updatePlan((current) => ({
      ...current,
      categories: current.categories.filter(
        (category) => category.id !== categoryId,
      ),
      profiles: current.profiles.map((profile) => {
        const nextAllocations = { ...profile.allocations };
        delete nextAllocations[categoryId];
        return {
          ...profile,
          allocations: nextAllocations,
        };
      }),
    }));
  };

  const addHolding = (categoryId: string) => {
    updatePlan((current) => ({
      ...current,
      categories: current.categories.map((category) => {
        if (category.id !== categoryId) {
          return category;
        }

        return {
          ...category,
          holdings: [
            ...category.holdings,
            createBlankHolding(category.holdings.length),
          ],
        };
      }),
    }));
  };

  const removeHolding = (categoryId: string, holdingId: string) => {
    updatePlan((current) => ({
      ...current,
      categories: current.categories.map((category) => {
        if (category.id !== categoryId) {
          return category;
        }

        return {
          ...category,
          holdings: category.holdings.filter(
            (holding) => holding.id !== holdingId,
          ),
        };
      }),
    }));
  };

  const moveHoldingToCategory = (
    currentCategoryId: string,
    holdingId: string,
    nextCategoryId: string,
  ) => {
    if (currentCategoryId === nextCategoryId) {
      return;
    }

    updatePlan((current) => {
      let holdingToMove: InvestmentHolding | undefined;

      const categoriesWithoutHolding = current.categories.map((category) => {
        if (category.id !== currentCategoryId) {
          return category;
        }

        const nextHoldings = category.holdings.filter((holding) => {
          if (holding.id === holdingId) {
            holdingToMove = holding;
            return false;
          }

          return true;
        });

        return {
          ...category,
          holdings: nextHoldings,
        };
      });

      if (holdingToMove == null) {
        return current;
      }

      const movedHolding: InvestmentHolding = {
        ...holdingToMove,
      };

      return {
        ...current,
        categories: categoriesWithoutHolding.map((category) => {
          if (category.id !== nextCategoryId) {
            return category;
          }

          return {
            ...category,
            holdings: [
              ...category.holdings,
              {
                ...movedHolding,
                sortOrder: category.holdings.length,
              },
            ],
          };
        }),
      };
    });
  };

  const updateProfile = (
    profileId: string,
    field: keyof Pick<
      AllocationProfile,
      "name" | "minYearsUntilFire" | "maxYearsUntilFire"
    >,
    value: string,
  ) => {
    updatePlan((current) => ({
      ...current,
      profiles: current.profiles.map((profile) => {
        if (profile.id !== profileId) {
          return profile;
        }

        return {
          ...profile,
          [field]: field === "name" ? value : parseOptionalNumber(value),
        };
      }),
    }));
  };

  const updateProfileAllocation = (
    profileId: string,
    categoryId: string,
    value: string,
  ) => {
    updatePlan((current) => ({
      ...current,
      profiles: current.profiles.map((profile) => {
        if (profile.id !== profileId) {
          return profile;
        }

        return {
          ...profile,
          allocations: {
            ...profile.allocations,
            [categoryId]: parseNumber(value),
          },
        };
      }),
    }));
  };

  const addProfile = () => {
    updatePlan((current) => ({
      ...current,
      profiles: [
        ...current.profiles,
        createBlankProfile(current.profiles.length),
      ],
    }));
  };

  const removeProfile = (profileId: string) => {
    updatePlan((current) => ({
      ...current,
      profiles: current.profiles.filter((profile) => profile.id !== profileId),
    }));
  };

  const updateSettings = (
    field: keyof InvestmentPlannerData["settings"],
    value: string,
  ) => {
    updatePlan((current) => ({
      ...current,
      settings: {
        ...current.settings,
        [field]:
          field === "monthlyInvestmentAmount"
            ? parseNumber(value)
            : (value as InvestmentRecommendationMode),
      },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      await savePlan(draftPlan);
      setSaveNotice("Planner settings saved.");
    } catch {
      setSaveNotice(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadRecommendedPlan = () => {
    const recommendedPlan = getRecommendedFireInvestmentPlannerData();

    setDraftPlan({
      ...recommendedPlan,
      settings: {
        ...draftPlan.settings,
      },
    });
    setSaveNotice(
      "Recommended FIRE plan loaded into the draft. Review it and save when you are ready.",
    );
    setQuoteNotice(null);
  };

  const profileWarning =
    activeProfile.profile != null &&
    Math.abs(activeProfile.totalEnteredPercentage - 100) > 0.01
      ? `The active profile totals ${formatEnteredPercent(activeProfile.totalEnteredPercentage)}. Recommendations normalize that profile to 100%.`
      : null;
  const fireAgeWarning =
    yearsUntilFire == null
      ? "Set your date of birth and target FIRE age in the FIRE Tracker to auto-select the right year-band. Until then, the first allocation profile is used."
      : null;
  const isDetailsView = activeView === "details";

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Investment Planner
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Build category-level allocation profiles by years until FIRE,
              track actual holdings within each category, and generate this
              month&apos;s buy or rebalance plan.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#2CA01C] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#248814] disabled:cursor-not-allowed disabled:bg-[#9FD792]"
            >
              <Save size={16} />
              {isSaving ? "Saving..." : "Save planner"}
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-gray-300 bg-gray-50 p-1">
          <div className="grid grid-cols-2 gap-1">
            {(
              [
                ["details", "Plan Details"],
                ["settings", "Plan Settings"],
              ] as const
            ).map(([view, label]) => (
              <button
                key={view}
                onClick={() => setActiveView(view)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeView === view
                    ? "bg-white text-[#1E7A18] shadow-sm"
                    : "text-gray-500 hover:text-[#1E7A18]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-3 text-sm text-gray-500">
          {isDetailsView
            ? "Use plan details for the monthly workflow: refresh holdings, review drift, and decide what to buy this month."
            : "Use plan settings for the long-lived setup: define allocation profiles and load the baseline FIRE glide path when needed."}
        </p>

        {isDetailsView ? (
          <>
            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="block min-w-52">
                  <span className="mb-1 block text-sm font-medium text-gray-700">
                    Monthly investment amount
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draftPlan.settings.monthlyInvestmentAmount}
                    onChange={(event) =>
                      updateSettings(
                        "monthlyInvestmentAmount",
                        event.target.value,
                      )
                    }
                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                  />
                </label>

                <div className="rounded-xl border border-gray-300 bg-gray-50 p-1">
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      [
                        ["buy-only", "Buy only"],
                        ["rebalance", "Rebalance"],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        onClick={() => updateSettings("rebalanceMode", mode)}
                        className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          draftPlan.settings.rebalanceMode === mode
                            ? "bg-white text-[#1E7A18] shadow-sm"
                            : "text-gray-500 hover:text-[#1E7A18]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => void refreshHoldingPrices(draftPlan)}
                disabled={isRefreshingQuotes}
                className="flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
              >
                <RefreshCw
                  size={16}
                  className={isRefreshingQuotes ? "animate-spin" : undefined}
                />
                {isRefreshingQuotes ? "Refreshing prices..." : "Refresh prices"}
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Years until FIRE
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">
                  {maskDisplayValue(formatYears(yearsUntilFire), hideValues)}
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Active profile
                </p>
                <p className="mt-2 text-lg font-semibold text-gray-900">
                  {activeProfile.profile?.name || "No profile"}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {formatYearBandLabel(activeProfile.profile)}
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Current holdings
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">
                  {displayCurrency(recommendationResult.totalCurrentValue)}
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Recommendation mode
                </p>
                <p className="mt-2 text-lg font-semibold text-gray-900">
                  {getModeLabel(draftPlan.settings.rebalanceMode)}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {draftPlan.settings.rebalanceMode === "rebalance"
                    ? "Allows sells to reach target immediately."
                    : "Uses only new monthly cash to reduce drift."}
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-500">
                Load the starter glide path once, then tune year-bands and
                category targets as your plan evolves.
              </p>

              <button
                onClick={handleLoadRecommendedPlan}
                className="flex items-center justify-center gap-2 rounded-xl border border-[#2CA01C]/25 bg-[#EEF9EA] px-4 py-2.5 text-sm font-medium text-[#1E7A18] transition-colors hover:bg-[#E1F4DB]"
              >
                <Wand2 size={16} />
                Load recommended plan
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Years until FIRE
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">
                  {maskDisplayValue(formatYears(yearsUntilFire), hideValues)}
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Active profile
                </p>
                <p className="mt-2 text-lg font-semibold text-gray-900">
                  {activeProfile.profile?.name || "No profile"}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {formatYearBandLabel(activeProfile.profile)}
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Categories configured
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">
                  {draftPlan.categories.length}
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Profiles configured
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">
                  {draftPlan.profiles.length}
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm text-gray-500">
              Load recommended plan applies a simple FIRE glide path: stay fully
              in equities until 5 years out, then build a bond tent and a small
              cash runway as FIRE gets closer.
            </p>
          </>
        )}

        {saveNotice ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {saveNotice}
          </div>
        ) : null}

        {quoteNotice ? (
          <div className={getNoticeClassName(quoteNoticeTone)}>
            {quoteNotice}
          </div>
        ) : null}

        {fireAgeWarning ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {fireAgeWarning}
          </div>
        ) : null}

        {activeProfile.usedFallbackProfile ? (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            No allocation profile matches {formatYears(yearsUntilFire)}. The
            first profile in the list is being used as a fallback.
          </div>
        ) : null}

        {profileWarning ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {profileWarning}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-500 shadow-sm">
          Loading planner settings...
        </div>
      ) : isDetailsView ? (
        <>
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    Holdings Table
                  </h3>
                  <p className="text-sm text-gray-500">
                    Edit holdings in one flat table. Market value is shares
                    owned multiplied by the active latest price for each symbol.
                  </p>
                </div>

                <button
                  onClick={() => {
                    if (draftPlan.categories[0]) {
                      addHolding(draftPlan.categories[0].id);
                    }
                  }}
                  disabled={draftPlan.categories.length === 0}
                  className="flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  <Plus size={16} />
                  Add holding
                </button>
              </div>

              {holdingRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                  {draftPlan.categories.length === 0
                    ? "Create a category first, then add holdings to it."
                    : "Add stocks, ETFs, or funds to roll them up into your categories automatically."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="px-3 py-3 text-left font-semibold text-gray-700">
                          Category
                        </th>
                        <th className="px-3 py-3 text-left font-semibold text-gray-700">
                          Symbol
                        </th>
                        <th className="px-3 py-3 text-left font-semibold text-gray-700">
                          Holding name
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">
                          Shares
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">
                          Manual latest price
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">
                          Latest price
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">
                          Market value
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdingRows.map(({ categoryId, holding }) => {
                        const holdingValue =
                          getInvestmentHoldingMarketValue(holding);
                        const latestPrice =
                          getInvestmentHoldingLatestPrice(holding);
                        const hasSymbol =
                          normalizeInvestmentSymbol(holding.symbol).length > 0;
                        const hasManualPrice = holding.manualPrice != null;
                        const hasLatestPrice = latestPrice > 0;

                        return (
                          <tr
                            key={holding.id}
                            className="border-b border-gray-100 align-top last:border-b-0"
                          >
                            <td className="px-3 py-3">
                              <select
                                value={categoryId}
                                onChange={(event) =>
                                  moveHoldingToCategory(
                                    categoryId,
                                    holding.id,
                                    event.target.value,
                                  )
                                }
                                className="w-full min-w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                              >
                                {draftPlan.categories.map((category) => (
                                  <option key={category.id} value={category.id}>
                                    {category.name || "Unnamed category"}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-3">
                              <input
                                value={holding.symbol}
                                onChange={(event) =>
                                  updateHolding(
                                    categoryId,
                                    holding.id,
                                    "symbol",
                                    event.target.value,
                                  )
                                }
                                placeholder="VTI"
                                className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                value={holding.name}
                                onChange={(event) =>
                                  updateHolding(
                                    categoryId,
                                    holding.id,
                                    "name",
                                    event.target.value,
                                  )
                                }
                                placeholder="Vanguard Total Stock Market"
                                className="w-full min-w-56 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="number"
                                min="0"
                                step="0.0001"
                                value={holding.sharesOwned}
                                onChange={(event) =>
                                  updateHolding(
                                    categoryId,
                                    holding.id,
                                    "sharesOwned",
                                    event.target.value,
                                  )
                                }
                                className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-right text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="number"
                                min="0"
                                step="0.0001"
                                value={holding.manualPrice ?? ""}
                                onChange={(event) =>
                                  updateHolding(
                                    categoryId,
                                    holding.id,
                                    "manualPrice",
                                    event.target.value,
                                  )
                                }
                                placeholder="Optional"
                                className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-right text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                              />
                              <p className="mt-1 text-xs text-gray-500">
                                Blank uses live quotes.
                              </p>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className="font-medium text-gray-900">
                                {hasLatestPrice
                                  ? displayCurrency(latestPrice)
                                  : "--"}
                              </div>
                              <div className="mt-1 max-w-40 whitespace-normal text-xs text-gray-500">
                                {formatHoldingPriceStatus(holding)}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className="font-medium text-gray-900">
                                {displayCurrency(holdingValue)}
                              </div>
                              <div className="mt-1 max-w-40 whitespace-normal text-xs text-gray-500">
                                {!hasLatestPrice
                                  ? hasSymbol
                                    ? "Refresh prices or enter a manual latest price."
                                    : "Enter a symbol or a manual latest price."
                                  : hasManualPrice
                                    ? "Using the manual latest price override."
                                    : "Included in category total."}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex justify-end">
                                <button
                                  onClick={() =>
                                    removeHolding(categoryId, holding.id)
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-rose-600 transition-colors hover:bg-rose-50"
                                >
                                  <Trash2 size={14} />
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    Monthly Recommendation
                  </h3>
                  <p className="text-sm text-gray-500">
                    Use the active profile to direct this month&apos;s money
                    toward the categories that best improve alignment with your
                    target mix.
                  </p>
                </div>

                <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                  Active: {activeProfile.profile?.name || "No profile"}
                </div>
              </div>

              {recommendationResult.rows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-500">
                  Add categories and at least one allocation profile to see a
                  recommendation.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="px-3 py-3 text-left font-semibold text-gray-700">
                          Category
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">
                          Current holding
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">
                          Current %
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">
                          Target %
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">
                          Target value
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">
                          Suggestion
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">
                          Projected %
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">
                          End drift
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {recommendationResult.rows.map((row) => (
                        <tr
                          key={row.categoryId}
                          className="border-b border-gray-100 last:border-b-0"
                        >
                          <td className="px-3 py-3 align-top">
                            <div className="font-medium text-gray-900">
                              {row.categoryName || "Unnamed category"}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              {row.action === "hold"
                                ? "Already aligned"
                                : row.action === "sell"
                                  ? "Reduce to rebalance"
                                  : "Direct new money here"}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right font-medium text-gray-700">
                            {displayCurrency(row.currentValue)}
                          </td>
                          <td className="px-3 py-3 text-right text-gray-700">
                            {displayPercent(row.currentAllocation)}
                          </td>
                          <td className="px-3 py-3 text-right text-gray-700">
                            {displayPercent(row.targetAllocation)}
                          </td>
                          <td className="px-3 py-3 text-right text-gray-700">
                            {displayCurrency(row.targetValue)}
                          </td>
                          <td
                            className={`px-3 py-3 text-right font-semibold ${
                              row.action === "buy"
                                ? "text-[#1E7A18]"
                                : row.action === "sell"
                                  ? "text-rose-700"
                                  : "text-gray-500"
                            }`}
                          >
                            {row.action === "hold"
                              ? "Hold"
                              : `${row.action === "buy" ? "Buy" : "Sell"} ${displayCurrency(Math.abs(row.recommendationAmount))}`}
                          </td>
                          <td className="px-3 py-3 text-right text-gray-700">
                            {displayPercent(row.projectedAllocation)}
                          </td>
                          <td
                            className={`px-3 py-3 text-right font-medium ${
                              Math.abs(row.driftAmount) < 0.01
                                ? "text-emerald-700"
                                : row.driftAmount > 0
                                  ? "text-amber-700"
                                  : "text-sky-700"
                            }`}
                          >
                            {displayCurrency(row.driftAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  Monthly Plan Summary
                </h3>
                <p className="text-sm text-gray-500">
                  Recommendations are generated from the active year-band
                  profile and your current holdings.
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Gross buys
                  </p>
                  <p className="mt-2 text-xl font-semibold text-gray-900">
                    {displayCurrency(recommendationResult.totalBuys)}
                  </p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Gross sells
                  </p>
                  <p className="mt-2 text-xl font-semibold text-gray-900">
                    {displayCurrency(recommendationResult.totalSells)}
                  </p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Net new capital
                  </p>
                  <p className="mt-2 text-xl font-semibold text-gray-900">
                    {displayCurrency(recommendationResult.netContribution)}
                  </p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Projected portfolio
                  </p>
                  <p className="mt-2 text-xl font-semibold text-gray-900">
                    {displayCurrency(recommendationResult.totalProjectedValue)}
                  </p>
                </div>
              </div>

              {draftPlan.settings.rebalanceMode === "buy-only" &&
              recommendationResult.remainingCash > 0 ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {maskInlineNumbers(
                    `Unallocated cash after rounding: ${formatCurrency(recommendationResult.remainingCash)}.`,
                    hideValues,
                  )}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    Current Holdings
                  </h3>
                  <p className="text-sm text-gray-500">
                    Category totals combine any manual value with listed
                    holdings priced from live quotes or manual latest-price
                    overrides.
                  </p>
                </div>

                <button
                  onClick={addCategory}
                  className="flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Plus size={16} />
                  Add category
                </button>
              </div>

              {categorySummaries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-500">
                  Add asset categories such as Equities, Bonds, or Cash.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="px-3 py-3 text-left font-semibold text-gray-700">
                          Category
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">
                          Manual value
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">
                          Holdings subtotal
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">
                          Total value
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">
                          Portfolio weight
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {categorySummaries.map(
                        ({
                          category,
                          holdingsValue,
                          totalValue,
                          currentAllocation,
                        }) => (
                          <tr
                            key={category.id}
                            className="border-b border-gray-100 align-top last:border-b-0"
                          >
                            <td className="px-3 py-3">
                              <input
                                value={category.name}
                                onChange={(event) =>
                                  updateCategory(
                                    category.id,
                                    "name",
                                    event.target.value,
                                  )
                                }
                                placeholder="Equities"
                                className="w-full min-w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={category.currentValue}
                                onChange={(event) =>
                                  updateCategory(
                                    category.id,
                                    "currentValue",
                                    event.target.value,
                                  )
                                }
                                className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-right text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                              />
                              <p className="mt-1 text-xs text-gray-500">
                                Untracked assets in this bucket.
                              </p>
                            </td>
                            <td className="px-3 py-3 text-right font-medium text-gray-700">
                              {displayCurrency(holdingsValue)}
                            </td>
                            <td className="px-3 py-3 text-right font-medium text-gray-700">
                              {displayCurrency(totalValue)}
                            </td>
                            <td className="px-3 py-3 text-right text-gray-700">
                              {displayPercent(currentAllocation)}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => addHolding(category.id)}
                                  className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                                >
                                  <Plus size={14} />
                                  Holding
                                </button>
                                <button
                                  onClick={() => removeCategory(category.id)}
                                  className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-rose-600 transition-colors hover:bg-rose-50"
                                >
                                  <Trash2 size={14} />
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-4 text-sm text-gray-500 shadow-sm">
            <div className="flex items-start gap-3">
              <Target size={18} className="mt-0.5 text-gray-400" />
              <p>
                {maskInlineNumbers(
                  `Example: if your equities category contains ${formatCurrency(50000)} of ETF holdings and ${formatCurrency(5000)} of untracked manual assets, your bonds category contains ${formatCurrency(20000)}, your active profile is 70% equities / 30% bonds, and this month you invest ${formatCurrency(2000)}, buy-only mode will direct more of that ${formatCurrency(2000)} toward the underweight category. Rebalance mode will instead calculate the exact buy and sell amounts needed to land on the post-contribution target mix.`,
                  hideValues,
                )}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-sky-300 bg-sky-50 px-5 py-4 text-sm text-sky-800 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 text-sky-600" />
              <p>
                This planner still recommends at the asset-category level.
                Individual holdings roll up into each category using the latest
                live quote or manual override, but security-level trade
                selection still happens outside this module.
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  Allocation Profiles
                </h3>
                <p className="text-sm text-gray-500">
                  Define year-bands using a lower bound that is inclusive and an
                  upper bound that is exclusive. Example: 5 to 10 means 5.0 up
                  to, but not including, 10.0 years.
                </p>
              </div>

              <button
                onClick={addProfile}
                className="flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                <Plus size={16} />
                Add profile
              </button>
            </div>

            {draftPlan.profiles.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-500">
                Add at least one allocation profile to generate a plan.
              </div>
            ) : (
              <div className="space-y-4">
                {draftPlan.profiles.map((profile) => {
                  const profileTotal = Object.values(
                    profile.allocations,
                  ).reduce((sum, percentage) => sum + percentage, 0);
                  const isActive = activeProfile.profile?.id === profile.id;
                  const hasInvalidRange =
                    profile.minYearsUntilFire != null &&
                    profile.maxYearsUntilFire != null &&
                    profile.minYearsUntilFire >= profile.maxYearsUntilFire;

                  return (
                    <div
                      key={profile.id}
                      className={`rounded-2xl border p-4 ${
                        isActive
                          ? "border-[#2CA01C] bg-[#F5FBF3]"
                          : "border-gray-200 bg-gray-50"
                      }`}
                    >
                      <div className="grid gap-3 lg:grid-cols-[1.3fr,0.7fr,0.7fr,auto]">
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                            Profile name
                          </span>
                          <input
                            value={profile.name}
                            onChange={(event) =>
                              updateProfile(
                                profile.id,
                                "name",
                                event.target.value,
                              )
                            }
                            placeholder="Growth"
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                            Min years to FIRE
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={profile.minYearsUntilFire ?? ""}
                            onChange={(event) =>
                              updateProfile(
                                profile.id,
                                "minYearsUntilFire",
                                event.target.value,
                              )
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                            Max years to FIRE
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={profile.maxYearsUntilFire ?? ""}
                            onChange={(event) =>
                              updateProfile(
                                profile.id,
                                "maxYearsUntilFire",
                                event.target.value,
                              )
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                          />
                        </label>

                        <div className="flex items-end justify-end">
                          <button
                            onClick={() => removeProfile(profile.id)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-rose-600 transition-colors hover:bg-rose-50"
                          >
                            <Trash2 size={14} />
                            Remove
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        {isActive ? (
                          <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-green-700">
                            Active for {formatYears(yearsUntilFire)}
                          </span>
                        ) : null}
                        <span className="rounded-full border border-gray-300 bg-white px-3 py-1 text-gray-600">
                          Entered total: {displayEnteredPercent(profileTotal)}
                        </span>
                        <span className="rounded-full border border-gray-300 bg-white px-3 py-1 text-gray-600">
                          {formatYearBandLabel(profile)}
                        </span>
                        {hasInvalidRange ? (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-700">
                            Max must be greater than min
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {draftPlan.categories.map((category) => (
                          <label
                            key={`${profile.id}-${category.id}`}
                            className="block rounded-xl border border-white bg-white px-3 py-3 shadow-sm"
                          >
                            <span className="mb-1 block text-sm font-medium text-gray-700">
                              {category.name || "Unnamed category"}
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={profile.allocations[category.id] ?? 0}
                              onChange={(event) =>
                                updateProfileAllocation(
                                  profile.id,
                                  category.id,
                                  event.target.value,
                                )
                              }
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                            />
                            <span className="mt-1 block text-xs text-gray-500">
                              Target allocation percentage
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
