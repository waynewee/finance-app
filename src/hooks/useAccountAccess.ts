import { useCallback, useEffect, useState } from "react";
import { type User } from "@supabase/supabase-js";
import { sendMagicLinkEmail } from "../lib/supabase";
import {
  clearAccountValueUnlockPassword,
  cancelAccountInvitation,
  claimPendingInvitations,
  ensureAccountProfile,
  hasAccountValueUnlockPassword,
  inviteAccountCollaborator,
  loadAccessibleAccountActivity,
  loadAccessibleAccounts,
  loadAccountCollaborators,
  loadPendingAccountInvitations,
  removeAccountCollaborator,
  renameAccount,
  setAccountValueUnlockPassword,
  type AccessibleAccount,
  type AccountCollaborator,
  type AccountInvitation,
  verifyAccountValueUnlockPassword,
} from "../lib/accountCollaborationRepository";

interface SharingState {
  collaborators: AccountCollaborator[];
  invitations: AccountInvitation[];
  isLoading: boolean;
}

interface InviteCollaboratorResult {
  emailSent: boolean;
  emailError: string | null;
}

const ACTIVE_ACCOUNT_STORAGE_KEY = "finance_app_active_account_user_id";

function getStoredActiveAccountId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACTIVE_ACCOUNT_STORAGE_KEY);
}

function setStoredActiveAccountId(accountUserId: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (accountUserId) {
    window.localStorage.setItem(ACTIVE_ACCOUNT_STORAGE_KEY, accountUserId);
    return;
  }

  window.localStorage.removeItem(ACTIVE_ACCOUNT_STORAGE_KEY);
}

function getAccountActivityScore(
  accountUserId: string,
  activityByUserId: Record<
    string,
    {
      hasCategories: boolean;
      hasMonthlyValues: boolean;
      hasFireSettings: boolean;
    }
  >,
): number {
  const activity = activityByUserId[accountUserId];
  if (!activity) {
    return 0;
  }

  return (
    (activity.hasMonthlyValues ? 3 : 0) +
    (activity.hasFireSettings ? 2 : 0) +
    (activity.hasCategories ? 1 : 0)
  );
}

export function useAccountAccess(user: User | null) {
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;
  const [accounts, setAccounts] = useState<AccessibleAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [sharing, setSharing] = useState<SharingState>({
    collaborators: [],
    invitations: [],
    isLoading: false,
  });
  const [hasValueLockPassword, setHasValueLockPassword] = useState(false);
  const [isValueLockStatusLoading, setIsValueLockStatusLoading] =
    useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshAccounts = useCallback(async () => {
    if (!userId) {
      setAccounts([]);
      setActiveAccountId(null);
      return;
    }

    await ensureAccountProfile(userId);
    const claimedOwnerUserIds = await claimPendingInvitations(
      userId,
      userEmail,
    );

    const nextAccounts = await loadAccessibleAccounts(userId);
    const storedAccountId = getStoredActiveAccountId();
    const hasStoredSelection = nextAccounts.some(
      (account) => account.userId === storedAccountId,
    );
    let nextActiveAccountId = hasStoredSelection ? storedAccountId : null;

    if (!nextActiveAccountId && claimedOwnerUserIds.length > 0) {
      nextActiveAccountId =
        claimedOwnerUserIds.find((ownerUserId) =>
          nextAccounts.some((account) => account.userId === ownerUserId),
        ) ?? null;
    }

    if (
      nextAccounts.length > 1 &&
      (!nextActiveAccountId || nextActiveAccountId === userId)
    ) {
      const activityByUserId = await loadAccessibleAccountActivity(
        nextAccounts.map((account) => account.userId),
      );
      const ownScore = getAccountActivityScore(userId, activityByUserId);
      const bestSharedAccount = nextAccounts
        .filter((account) => account.role === "collaborator")
        .map((account) => ({
          userId: account.userId,
          score: getAccountActivityScore(account.userId, activityByUserId),
        }))
        .sort((left, right) => right.score - left.score)[0];

      if (bestSharedAccount && bestSharedAccount.score > ownScore) {
        nextActiveAccountId = bestSharedAccount.userId;
      }
    }

    if (!nextActiveAccountId) {
      nextActiveAccountId = nextAccounts[0]?.userId ?? userId;
    }

    setAccounts(nextAccounts);
    setActiveAccountId(nextActiveAccountId);
    setStoredActiveAccountId(nextActiveAccountId);
  }, [userEmail, userId]);

  const refreshSharing = useCallback(async () => {
    if (!userId || activeAccountId !== userId) {
      setSharing({ collaborators: [], invitations: [], isLoading: false });
      return;
    }

    setSharing((prev) => ({ ...prev, isLoading: true }));

    const [collaborators, invitations] = await Promise.all([
      loadAccountCollaborators(userId),
      loadPendingAccountInvitations(userId),
    ]);

    setSharing({
      collaborators,
      invitations,
      isLoading: false,
    });
  }, [activeAccountId, userId]);

  const refreshValueLockStatus = useCallback(async () => {
    if (!userId || !activeAccountId) {
      setHasValueLockPassword(false);
      setIsValueLockStatusLoading(false);
      return;
    }

    setIsValueLockStatusLoading(true);

    try {
      const nextHasValueLockPassword =
        await hasAccountValueUnlockPassword(activeAccountId);
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
  }, [activeAccountId, userId]);

  useEffect(() => {
    let isMounted = true;

    if (!userId) {
      setAccounts([]);
      setActiveAccountId(null);
      setSharing({ collaborators: [], invitations: [], isLoading: false });
      setHasValueLockPassword(false);
      setIsValueLockStatusLoading(false);
      setError(null);
      setIsLoading(false);
      setStoredActiveAccountId(null);
      return () => {
        isMounted = false;
      };
    }

    const hydrate = async () => {
      setIsLoading(true);

      try {
        await refreshAccounts();

        if (!isMounted) {
          return;
        }

        setError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load shared account access.",
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
  }, [refreshAccounts, userId]);

  useEffect(() => {
    if (!userId || activeAccountId !== userId) {
      setSharing({ collaborators: [], invitations: [], isLoading: false });
    }
  }, [activeAccountId, userId]);

  useEffect(() => {
    void refreshValueLockStatus();
  }, [refreshValueLockStatus]);

  const selectAccount = useCallback((accountUserId: string) => {
    setActiveAccountId(accountUserId);
    setStoredActiveAccountId(accountUserId);
  }, []);

  const renameOwnAccount = useCallback(
    async (accountName: string) => {
      if (!userId) {
        return;
      }

      await renameAccount(userId, accountName);
      await refreshAccounts();
      await refreshSharing();
      setError(null);
    },
    [refreshAccounts, refreshSharing, userId],
  );

  const inviteCollaborator = useCallback(
    async (email: string): Promise<InviteCollaboratorResult> => {
      if (!userId || activeAccountId !== userId) {
        return {
          emailSent: false,
          emailError: "Only the account owner can send collaborator invites.",
        };
      }

      await inviteAccountCollaborator(userId, email);
      await refreshSharing();
      setError(null);

      try {
        await sendMagicLinkEmail(email);

        return {
          emailSent: true,
          emailError: null,
        };
      } catch (inviteEmailError) {
        return {
          emailSent: false,
          emailError:
            inviteEmailError instanceof Error
              ? inviteEmailError.message
              : "The sign-in link email could not be sent.",
        };
      }
    },
    [activeAccountId, refreshSharing, userId],
  );

  const removeCollaborator = useCallback(
    async (collaboratorUserId: string) => {
      if (!userId || activeAccountId !== userId) {
        return;
      }

      await removeAccountCollaborator(userId, collaboratorUserId);
      await refreshSharing();
      setError(null);
    },
    [activeAccountId, refreshSharing, userId],
  );

  const cancelInvitation = useCallback(
    async (invitationId: string) => {
      if (!userId || activeAccountId !== userId) {
        return;
      }

      await cancelAccountInvitation(userId, invitationId);
      await refreshSharing();
      setError(null);
    },
    [activeAccountId, refreshSharing, userId],
  );

  const saveActiveAccountValueLockPassword = useCallback(
    async (password: string) => {
      if (!userId || activeAccountId !== userId) {
        throw new Error(
          "Only the account owner can change the value lock password.",
        );
      }

      await setAccountValueUnlockPassword(userId, password);
      setHasValueLockPassword(true);
      setError(null);
    },
    [activeAccountId, userId],
  );

  const clearActiveAccountValueLock = useCallback(async () => {
    if (!userId || activeAccountId !== userId) {
      throw new Error(
        "Only the account owner can remove the value lock password.",
      );
    }

    await clearAccountValueUnlockPassword(userId);
    setHasValueLockPassword(false);
    setError(null);
  }, [activeAccountId, userId]);

  const verifyActiveAccountValueLock = useCallback(
    async (password: string): Promise<boolean> => {
      if (!activeAccountId) {
        return false;
      }

      const isValid = await verifyAccountValueUnlockPassword(
        activeAccountId,
        password,
      );
      setError(null);
      return isValid;
    },
    [activeAccountId],
  );

  return {
    accounts,
    activeAccountId,
    activeAccount:
      accounts.find((account) => account.userId === activeAccountId) ?? null,
    isOwnerOfActiveAccount: Boolean(userId && activeAccountId === userId),
    sharing,
    hasValueLockPassword,
    isValueLockStatusLoading,
    isLoading,
    error,
    setActiveAccountId: selectAccount,
    loadSharing: refreshSharing,
    renameActiveAccount: renameOwnAccount,
    inviteCollaborator,
    removeCollaborator,
    cancelInvitation,
    saveActiveAccountValueLockPassword,
    clearActiveAccountValueLock,
    verifyActiveAccountValueLock,
    refreshValueLockStatus,
    refreshAccounts,
  };
}
