import { useCallback, useEffect, useState } from "react";
import {
  loadInvestmentAssets,
  replaceInvestmentAssets,
  type InvestmentAsset,
} from "../lib/investmentPlannerRepository";

export function useInvestmentPlanner(accountUserId: string | null) {
  const [assets, setAssets] = useState<InvestmentAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!accountUserId) {
      setAssets([]);
      setError(null);
      setIsLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const hydrate = async () => {
      setIsLoading(true);

      try {
        const nextAssets = await loadInvestmentAssets(accountUserId);
        if (!isMounted) {
          return;
        }

        setAssets(nextAssets);
        setError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load planner assets.",
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

  const saveAssets = useCallback(
    async (nextAssets: InvestmentAsset[]) => {
      if (!accountUserId) {
        return;
      }

      const normalizedAssets = nextAssets.map((asset, index) => ({
        ...asset,
        sortOrder: index,
      }));

      setAssets(normalizedAssets);

      try {
        await replaceInvestmentAssets(accountUserId, normalizedAssets);
        setError(null);
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Failed to save planner assets.",
        );
        throw saveError;
      }
    },
    [accountUserId],
  );

  return {
    assets,
    isLoading,
    error,
    saveAssets,
  };
}
