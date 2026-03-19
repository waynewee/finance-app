import { useCallback, useEffect, useState } from "react";
import { type Category } from "../data/defaultCategories";
import {
  DEFAULT_FIRE_SETTINGS,
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

function getSortedSnapshots(
  monthlyData: MonthlyData,
): LatestNetWorthSnapshot[] {
  const snapshots: LatestNetWorthSnapshot[] = [];

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

      const total = Object.values(values).reduce(
        (sum, value) => sum + (Number.isFinite(value) ? value : 0),
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

export function useNetWorthData(accountUserId: string | null) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData>({});
  const [fireSettings, setFireSettings] = useState<FireSettings>(
    DEFAULT_FIRE_SETTINGS,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!accountUserId) {
      setCategories([]);
      setMonthlyData({});
      setFireSettings(DEFAULT_FIRE_SETTINGS);
      setError(null);
      setIsLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const hydrate = async () => {
      setIsLoading(true);

      try {
        const state = await loadNetWorthState(accountUserId);
        if (!isMounted) {
          return;
        }

        setCategories(state.categories);
        setMonthlyData(state.monthlyData);
        setFireSettings(state.fireSettings);
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
  }, [accountUserId]);

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
      if (!accountUserId) {
        return;
      }

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
        return next;
      });

      void saveMonthlyValue(
        accountUserId,
        year,
        monthIndex,
        subcategoryId,
        value,
      ).catch((saveError) => {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Failed to save value.",
        );
      });
    },
    [accountUserId],
  );

  const getMonthTotal = useCallback(
    (year: number, monthIndex: number): number => {
      return categories.reduce((total, cat) => {
        return (
          total +
          cat.subcategories.reduce((catTotal, sub) => {
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
        return total + (monthlyData[year]?.[monthIndex]?.[sub.id] ?? 0);
      }, 0);
    },
    [categories, monthlyData],
  );

  const getLatestSnapshot = useCallback((): LatestNetWorthSnapshot | null => {
    return getSortedSnapshots(monthlyData)[0] ?? null;
  }, [monthlyData]);

  const getPreviousSnapshot = useCallback((): LatestNetWorthSnapshot | null => {
    return getSortedSnapshots(monthlyData)[1] ?? null;
  }, [monthlyData]);

  const getNetWorthSnapshots = useCallback((): LatestNetWorthSnapshot[] => {
    return getSortedSnapshots(monthlyData);
  }, [monthlyData]);

  const updateCategories = useCallback(
    (updated: Category[]) => {
      if (!accountUserId) {
        return;
      }

      setCategories(updated);
      void replaceCategories(accountUserId, updated).catch((saveError) => {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Failed to save categories.",
        );
      });
    },
    [accountUserId],
  );

  const updateFireSettings = useCallback(
    (updated: FireSettings) => {
      if (!accountUserId) {
        return;
      }

      setFireSettings(updated);
      void saveFireSettings(accountUserId, updated).catch((saveError) => {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Failed to save FIRE settings.",
        );
      });
    },
    [accountUserId],
  );

  const replaceYearData = useCallback(
    async (year: number, valuesBySubcategory: Record<string, number[]>) => {
      if (!accountUserId) {
        return;
      }

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
      setError(null);

      try {
        await replaceYearMonthlyValues(
          accountUserId,
          year,
          valuesBySubcategory,
        );
      } catch (saveError) {
        setMonthlyData((prev) => ({
          ...prev,
          [year]: previousYearData,
        }));
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Failed to import yearly data.",
        );
        throw saveError;
      }
    },
    [accountUserId, monthlyData],
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
