import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeCategories, type Category } from "../data/defaultCategories";
import {
  cacheNetWorthState,
  DEFAULT_FIRE_SETTINGS,
  getCachedNetWorthState,
  loadNetWorthState,
  replaceYearMonthlyValues,
  replaceCategories,
  saveMonthlyValue,
  saveFireSettings,
  type FireSettings,
  type MonthlyData,
} from "../lib/netWorthRepository";

interface LatestNetWorthSnapshot {
  year: number;
  monthIndex: number;
  total: number;
}

export type NetWorthSnapshot = LatestNetWorthSnapshot;

function getIncludedSubcategoryIds(categories: Category[]): Set<string> {
  return new Set(
    categories.flatMap((category) =>
      category.subcategories
        .filter((subcategory) => !subcategory.isReferenceOnly)
        .map((subcategory) => subcategory.id),
    ),
  );
}

function getSortedSnapshots(
  categories: Category[],
  monthlyData: MonthlyData,
): LatestNetWorthSnapshot[] {
  const snapshots: LatestNetWorthSnapshot[] = [];
  const includedSubcategoryIds = getIncludedSubcategoryIds(categories);

  const yearKeys = Object.keys(monthlyData)
    .map((year) => Number(year))
    .filter((year) => Number.isFinite(year))
    .sort((left, right) => right - left);

  yearKeys.forEach((year) => {
    const months = monthlyData[year];
    const monthIndexes = Object.keys(months ?? {})
      .map((month) => Number(month))
      .filter((month) => Number.isInteger(month) && month >= 0 && month <= 11)
      .sort((left, right) => right - left);

    monthIndexes.forEach((monthIndex) => {
      const values = months?.[monthIndex];
      if (!values) {
        return;
      }

      const total = Object.entries(values).reduce(
        (sum, [subcategoryId, value]) => {
          if (
            !includedSubcategoryIds.has(subcategoryId) ||
            !Number.isFinite(value)
          ) {
            return sum;
          }

          return sum + value;
        },
        0,
      );

      snapshots.push({
        year,
        monthIndex,
        total,
      });
    });
  });

  return snapshots;
}

export function useNetWorthData() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData>({});
  const [fireSettings, setFireSettings] = useState<FireSettings>(
    DEFAULT_FIRE_SETTINGS,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const categoriesRef = useRef(categories);
  const monthlyDataRef = useRef(monthlyData);
  const fireSettingsRef = useRef(fireSettings);

  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);

  useEffect(() => {
    monthlyDataRef.current = monthlyData;
  }, [monthlyData]);

  useEffect(() => {
    fireSettingsRef.current = fireSettings;
  }, [fireSettings]);

  const syncCachedState = useCallback(
    (nextState: {
      categories?: Category[];
      monthlyData?: MonthlyData;
      fireSettings?: FireSettings;
    }) => {
      const cachedCategories = nextState.categories ?? categoriesRef.current;
      const cachedMonthlyData = nextState.monthlyData ?? monthlyDataRef.current;
      const cachedFireSettings =
        nextState.fireSettings ?? fireSettingsRef.current;

      categoriesRef.current = cachedCategories;
      monthlyDataRef.current = cachedMonthlyData;
      fireSettingsRef.current = cachedFireSettings;

      cacheNetWorthState({
        categories: cachedCategories,
        monthlyData: cachedMonthlyData,
        fireSettings: cachedFireSettings,
      });
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;

    const cachedState = getCachedNetWorthState();
    if (cachedState) {
      const normalizedCategories = normalizeCategories(cachedState.categories);

      setCategories(normalizedCategories);
      setMonthlyData(cachedState.monthlyData);
      setFireSettings(cachedState.fireSettings);
      setIsLoading(false);
      categoriesRef.current = normalizedCategories;
      monthlyDataRef.current = cachedState.monthlyData;
      fireSettingsRef.current = cachedState.fireSettings;
    } else {
      setIsLoading(true);
    }

    const hydrate = async () => {
      try {
        const state = await loadNetWorthState();
        if (!isMounted) {
          return;
        }

        const normalizedCategories = normalizeCategories(state.categories);

        setCategories(normalizedCategories);
        setMonthlyData(state.monthlyData);
        setFireSettings(state.fireSettings);
        syncCachedState({ ...state, categories: normalizedCategories });
        setError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load saved data.",
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, [syncCachedState]);

  const getValue = useCallback(
    (year: number, monthIndex: number, subcategoryId: string): number => {
      return monthlyData[year]?.[monthIndex]?.[subcategoryId] ?? 0;
    },
    [monthlyData],
  );

  const setValue = useCallback(
    (
      year: number,
      monthIndex: number,
      subcategoryId: string,
      value: number,
    ) => {
      setMonthlyData((prev) => {
        const next = {
          ...prev,
          [year]: {
            ...prev[year],
            [monthIndex]: {
              ...prev[year]?.[monthIndex],
              [subcategoryId]: value,
            },
          },
        };
        syncCachedState({ monthlyData: next });
        return next;
      });

      void saveMonthlyValue(year, monthIndex, subcategoryId, value).catch(
        (saveError) => {
          setError(
            saveError instanceof Error
              ? saveError.message
              : "Failed to save value.",
          );
        },
      );
    },
    [],
  );

  const getMonthTotal = useCallback(
    (year: number, monthIndex: number): number => {
      return categories.reduce((total, cat) => {
        return (
          total +
          cat.subcategories.reduce((catTotal, sub) => {
            if (sub.isReferenceOnly) {
              return catTotal;
            }

            return catTotal + (monthlyData[year]?.[monthIndex]?.[sub.id] ?? 0);
          }, 0)
        );
      }, 0);
    },
    [categories, monthlyData],
  );

  const getCategoryMonthTotal = useCallback(
    (year: number, monthIndex: number, categoryId: string): number => {
      const cat = categories.find((c) => c.id === categoryId);
      if (!cat) return 0;
      return cat.subcategories.reduce((total, sub) => {
        if (sub.isReferenceOnly) {
          return total;
        }

        return total + (monthlyData[year]?.[monthIndex]?.[sub.id] ?? 0);
      }, 0);
    },
    [categories, monthlyData],
  );

  const getLatestSnapshot = useCallback((): LatestNetWorthSnapshot | null => {
    return getSortedSnapshots(categories, monthlyData)[0] ?? null;
  }, [categories, monthlyData]);

  const getPreviousSnapshot = useCallback((): LatestNetWorthSnapshot | null => {
    return getSortedSnapshots(categories, monthlyData)[1] ?? null;
  }, [categories, monthlyData]);

  const getNetWorthSnapshots = useCallback((): LatestNetWorthSnapshot[] => {
    return getSortedSnapshots(categories, monthlyData);
  }, [categories, monthlyData]);

  const updateCategories = useCallback((updated: Category[]) => {
    const normalizedCategories = normalizeCategories(updated);

    setCategories(normalizedCategories);
    syncCachedState({ categories: normalizedCategories });
    void replaceCategories(normalizedCategories).catch((saveError) => {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save categories.",
      );
    });
  }, []);

  const updateFireSettings = useCallback((updated: FireSettings) => {
    setFireSettings(updated);
    syncCachedState({ fireSettings: updated });
    void saveFireSettings(updated).catch((saveError) => {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save FIRE settings.",
      );
    });
  }, []);

  const replaceYearData = useCallback(
    async (year: number, valuesBySubcategory: Record<string, number[]>) => {
      const nextYearData = Object.entries(valuesBySubcategory).reduce<
        MonthlyData[string]
      >((result, [subcategoryId, values]) => {
        values.forEach((value, monthIndex) => {
          if (value === 0) {
            return;
          }

          result[monthIndex] ??= {};
          result[monthIndex][subcategoryId] = value;
        });

        return result;
      }, {});

      const previousYearData = monthlyData[year] ?? {};

      setMonthlyData((prev) => ({
        ...prev,
        [year]: nextYearData,
      }));
      syncCachedState({
        monthlyData: {
          ...monthlyDataRef.current,
          [year]: nextYearData,
        },
      });
      setError(null);

      try {
        await replaceYearMonthlyValues(year, valuesBySubcategory);
      } catch (saveError) {
        setMonthlyData((prev) => ({
          ...prev,
          [year]: previousYearData,
        }));
        syncCachedState({
          monthlyData: {
            ...monthlyDataRef.current,
            [year]: previousYearData,
          },
        });
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Failed to import yearly data.",
        );
        throw saveError;
      }
    },
    [monthlyData],
  );

  return {
    categories,
    monthlyData,
    fireSettings,
    isLoading,
    error,
    getValue,
    setValue,
    getMonthTotal,
    getCategoryMonthTotal,
    getLatestSnapshot,
    getNetWorthSnapshots,
    getPreviousSnapshot,
    updateCategories,
    updateFireSettings,
    replaceYearData,
  };
}
