import { useCallback, useEffect, useState } from "react";
import {
  clearValueLockPassword,
  hasValueLockPassword as fetchHasValueLockPassword,
  setValueLockPassword,
  verifyValueLockPassword,
} from "../lib/valueLockRepository";

export function useValueLock() {
  const [hasValueLockPassword, setHasValueLockPassword] = useState(false);
  const [isValueLockStatusLoading, setIsValueLockStatusLoading] =
    useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshValueLockStatus = useCallback(async () => {
    setIsValueLockStatusLoading(true);

    try {
      const nextHasValueLockPassword = await fetchHasValueLockPassword();
      setHasValueLockPassword(nextHasValueLockPassword);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load the value lock settings.",
      );
    } finally {
      setIsValueLockStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshValueLockStatus();
  }, [refreshValueLockStatus]);

  const saveValueLockPassword = useCallback(async (password: string) => {
    await setValueLockPassword(password);
    setHasValueLockPassword(true);
    setError(null);
  }, []);

  const clearValueLock = useCallback(async () => {
    await clearValueLockPassword();
    setHasValueLockPassword(false);
    setError(null);
  }, []);

  const verifyValueLock = useCallback(
    async (password: string): Promise<boolean> => {
      const isValid = await verifyValueLockPassword(password);
      setError(null);
      return isValid;
    },
    [],
  );

  return {
    hasValueLockPassword,
    isValueLockStatusLoading,
    error,
    saveValueLockPassword,
    clearValueLock,
    verifyValueLock,
  };
}
