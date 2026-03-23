import { useCallback, useEffect, useState } from "react";
import {
  loadInvestmentPlannerData,
  replaceInvestmentPlannerData,
  type InvestmentPlannerData,
} from "../lib/investmentPlannerRepository";
import { getDefaultInvestmentPlannerData } from "../lib/investmentPlanner";

export function useInvestmentPlanner(accountUserId: string | null) {
  const [plan, setPlan] = useState<InvestmentPlannerData>(
    getDefaultInvestmentPlannerData(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!accountUserId) {
      setPlan(getDefaultInvestmentPlannerData());
      setError(null);
      setIsLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const hydrate = async () => {
      setIsLoading(true);

      try {
        const nextPlan = await loadInvestmentPlannerData(accountUserId);
        if (!isMounted) {
          return;
        }

        setPlan(nextPlan);
        setError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load planner settings.",
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

  const savePlan = useCallback(
    async (nextPlan: InvestmentPlannerData) => {
      if (!accountUserId) {
        return;
      }

      setPlan(nextPlan);

      try {
        await replaceInvestmentPlannerData(accountUserId, nextPlan);
        setError(null);
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Failed to save planner settings.",
        );
        throw saveError;
      }
    },
    [accountUserId],
  );

  return {
    plan,
    isLoading,
    error,
    savePlan,
  };
}
