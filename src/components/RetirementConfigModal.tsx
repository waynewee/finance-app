import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Download, Flame, Plus, Trash2, Upload, X } from "lucide-react";
import { MONTHS } from "../data/defaultCategories";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { sanitizeFireSettings } from "../lib/fire";
import { type FireSettings } from "../lib/netWorthRepository";
import {
  CPF_EXAMPLE_RETIREMENT_SYSTEM,
  SIMPLE_401K_EXAMPLE_RETIREMENT_SYSTEM,
  addCpfMemberToRetirementSystem,
  createRetirementMemberId,
  getLatestRetirementBalancePeriod,
  getRetirementBalanceMapForPeriod,
  isCpfRetirementSystem,
  sanitizeRetirementSystemConfig,
  upsertRetirementBalanceSnapshot,
  type RetirementAccountClassification,
  type RetirementAccountConfig,
  type RetirementContributionRule,
  type RetirementPayoutMode,
  type RetirementSystemConfig,
} from "../lib/retirementSystem";

interface LatestSnapshot {
  year: number;
  monthIndex: number;
  total: number;
}

interface Props {
  settings: FireSettings;
  latestSnapshot: LatestSnapshot | null;
  onUpdate: (settings: FireSettings) => void;
  onClose: () => void;
}

const PAYOUT_MODE_OPTIONS: RetirementPayoutMode[] = [
  "drawdown",
  "annuity",
  "none",
];
const CLASSIFICATION_OPTIONS: RetirementAccountClassification[] = [
  "liquid",
  "semi-liquid",
  "locked",
  "restricted",
];

function parseNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalDate(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function createId(base: string): string {
  const normalized = base
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${normalized || "item"}-${Date.now().toString(36).slice(-5)}`;
}

function createStarterRetirementSystem(): RetirementSystemConfig {
  return {
    name: "Custom retirement system",
    description: "",
    payoutStartAge: null,
    defaultPayoutMode: "drawdown",
    projectionYears: 40,
    members: [
      {
        id: "household",
        name: "Household",
        monthlyIncome: 0,
        dateOfBirth: null,
      },
    ],
    accounts: [
      {
        id: "core-account",
        name: "Core retirement account",
        balance: 0,
        annualReturnRate: 5,
        classification: "locked",
        memberId: "household",
        contributionGroup: null,
        withdrawal: {
          minimumAge: null,
          payoutStartAge: null,
          payoutMode: "drawdown",
          annualDrawdownRate: 4,
          annuityConversionRate: null,
        },
      },
    ],
    contributionRules: [
      {
        employeeRate: 0,
        employerRate: 0,
        monthlyIncomeCap: null,
        annualContributionCap: null,
        accountAllocations: {
          "core-account": 1,
        },
        accountAllocationGroups: {},
      },
    ],
  };
}

function createDefaultPeriod(latestSnapshot: LatestSnapshot | null): {
  year: number;
  monthIndex: number;
} {
  if (latestSnapshot) {
    return {
      year: latestSnapshot.year,
      monthIndex: latestSnapshot.monthIndex,
    };
  }

  const now = new Date();
  return {
    year: now.getFullYear(),
    monthIndex: now.getMonth(),
  };
}

function formatMonthPeriod(year: number, monthIndex: number): string {
  return `${MONTHS[monthIndex]} ${year}`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatPercentLabel(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default function RetirementConfigModal({
  settings,
  latestSnapshot,
  onUpdate,
  onClose,
}: Props) {
  useBodyScrollLock(true);

  const [retirementSystemDraft, setRetirementSystemDraft] = useState(
    sanitizeRetirementSystemConfig(settings.retirementSystem),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const latestBalancePeriod = getLatestRetirementBalancePeriod(
    retirementSystemDraft,
  );
  const defaultPeriod = createDefaultPeriod(latestSnapshot);
  const [balanceYear, setBalanceYear] = useState(
    latestBalancePeriod?.year ?? defaultPeriod.year,
  );
  const [balanceMonthIndex, setBalanceMonthIndex] = useState(
    latestBalancePeriod?.monthIndex ?? defaultPeriod.monthIndex,
  );
  const isCpfSystem = isCpfRetirementSystem(retirementSystemDraft);

  const syncRetirementSystem = (next: RetirementSystemConfig | null) => {
    setRetirementSystemDraft(sanitizeRetirementSystemConfig(next));
    setValidationError(null);
  };

  const memberMap = useMemo(
    () =>
      new Map(
        (retirementSystemDraft?.members ?? []).map((member) => [
          member.id,
          member,
        ]),
      ),
    [retirementSystemDraft],
  );

  const balanceMap = useMemo(
    () =>
      getRetirementBalanceMapForPeriod(retirementSystemDraft, {
        year: balanceYear,
        monthIndex: balanceMonthIndex,
      }),
    [balanceMonthIndex, balanceYear, retirementSystemDraft],
  );

  const memberCount = useMemo(() => {
    if (!retirementSystemDraft) {
      return 0;
    }

    const memberIds = new Set(
      (retirementSystemDraft.members ?? []).map((member) => member.id),
    );
    retirementSystemDraft.accounts.forEach((account) => {
      if (account.memberId) {
        memberIds.add(account.memberId);
      }
    });
    return memberIds.size;
  }, [retirementSystemDraft]);

  const contributionGroups = useMemo(
    () =>
      Array.from(
        new Set(
          (retirementSystemDraft?.accounts ?? [])
            .map((account) => account.contributionGroup)
            .filter((group): group is string => Boolean(group)),
        ),
      ),
    [retirementSystemDraft],
  );

  const accountsByMember = useMemo(() => {
    if (!retirementSystemDraft) {
      return [];
    }

    const groups = new Map<
      string,
      {
        id: string;
        name: string;
        monthlyIncome: number;
        accounts: RetirementAccountConfig[];
      }
    >();

    (retirementSystemDraft.members ?? []).forEach((member) => {
      groups.set(member.id, {
        id: member.id,
        name: member.name,
        monthlyIncome: member.monthlyIncome ?? 0,
        accounts: [],
      });
    });

    retirementSystemDraft.accounts.forEach((account) => {
      const memberId = account.memberId ?? "unassigned";
      const member = memberId === "unassigned" ? null : memberMap.get(memberId);
      if (!groups.has(memberId)) {
        groups.set(memberId, {
          id: memberId,
          name: member?.name ?? "Unassigned accounts",
          monthlyIncome: member?.monthlyIncome ?? 0,
          accounts: [],
        });
      }

      groups.get(memberId)?.accounts.push(account);
    });

    return Array.from(groups.values()).filter((group) => group.accounts.length);
  }, [memberMap, retirementSystemDraft]);

  const updateSystem = (updates: Partial<RetirementSystemConfig>) => {
    if (!retirementSystemDraft) {
      return;
    }

    syncRetirementSystem({
      ...retirementSystemDraft,
      ...updates,
    });
  };

  const updateMember = (
    memberId: string,
    updates: {
      name?: string;
      monthlyIncome?: number;
      dateOfBirth?: string | null;
    },
  ) => {
    if (!retirementSystemDraft) {
      return;
    }

    const nextMembers = (retirementSystemDraft.members ?? []).map((member) =>
      member.id === memberId ? { ...member, ...updates } : member,
    );
    const nextAccounts = retirementSystemDraft.accounts.map((account) => {
      if (
        account.memberId !== memberId ||
        !updates.name ||
        !account.contributionGroup ||
        !isCpfSystem
      ) {
        return account;
      }

      return {
        ...account,
        name: `${updates.name} ${account.contributionGroup.toUpperCase()}`,
      };
    });

    syncRetirementSystem({
      ...retirementSystemDraft,
      members: nextMembers,
      accounts: nextAccounts,
    });
  };

  const addGenericMember = () => {
    const baseSystem =
      retirementSystemDraft ??
      sanitizeRetirementSystemConfig(createStarterRetirementSystem());
    if (!baseSystem) {
      return;
    }

    const nextName = `Member ${(baseSystem.members?.length ?? 0) + 1}`;
    syncRetirementSystem({
      ...baseSystem,
      members: [
        ...(baseSystem.members ?? []),
        {
          id: createRetirementMemberId(nextName),
          name: nextName,
          monthlyIncome: 0,
          dateOfBirth: null,
        },
      ],
    });
  };

  const addCpfMember = () => {
    const baseSystem =
      retirementSystemDraft ??
      sanitizeRetirementSystemConfig(CPF_EXAMPLE_RETIREMENT_SYSTEM);
    if (!baseSystem) {
      return;
    }

    const nextName = `Member ${(baseSystem.members?.length ?? 0) + 1}`;
    const memberId = createId(createRetirementMemberId(nextName));
    syncRetirementSystem(
      addCpfMemberToRetirementSystem(baseSystem, {
        id: memberId,
        name: nextName,
        monthlyIncome: 0,
        dateOfBirth: null,
      }),
    );
  };

  const removeMember = (memberId: string) => {
    if (!retirementSystemDraft) {
      return;
    }

    const relatedAccountIds = retirementSystemDraft.accounts
      .filter((account) => account.memberId === memberId)
      .map((account) => account.id);

    syncRetirementSystem({
      ...retirementSystemDraft,
      members: (retirementSystemDraft.members ?? []).filter(
        (member) => member.id !== memberId,
      ),
      accounts: isCpfSystem
        ? retirementSystemDraft.accounts.filter(
            (account) => account.memberId !== memberId,
          )
        : retirementSystemDraft.accounts.map((account) =>
            account.memberId === memberId
              ? { ...account, memberId: null }
              : account,
          ),
      balanceHistory: isCpfSystem
        ? (retirementSystemDraft.balanceHistory ?? []).filter(
            (snapshot) => !relatedAccountIds.includes(snapshot.accountId),
          )
        : retirementSystemDraft.balanceHistory,
    });
  };

  const addAccount = () => {
    const baseSystem =
      retirementSystemDraft ??
      sanitizeRetirementSystemConfig(createStarterRetirementSystem());
    if (!baseSystem) {
      return;
    }

    const memberId = baseSystem.members?.[0]?.id ?? null;
    const accountId = createId("account");
    syncRetirementSystem({
      ...baseSystem,
      accounts: [
        ...baseSystem.accounts,
        {
          id: accountId,
          name: `Account ${baseSystem.accounts.length + 1}`,
          balance: 0,
          annualReturnRate: 5,
          classification: "locked",
          memberId,
          contributionGroup: null,
          withdrawal: {
            minimumAge: null,
            payoutStartAge: null,
            payoutMode: baseSystem.defaultPayoutMode ?? "drawdown",
            annualDrawdownRate: 4,
            annuityConversionRate: null,
          },
        },
      ],
    });
  };

  const updateAccount = (
    accountId: string,
    updates: Partial<RetirementAccountConfig>,
  ) => {
    if (!retirementSystemDraft) {
      return;
    }

    syncRetirementSystem({
      ...retirementSystemDraft,
      accounts: retirementSystemDraft.accounts.map((account) =>
        account.id === accountId ? { ...account, ...updates } : account,
      ),
    });
  };

  const updateAccountWithdrawal = (
    accountId: string,
    updates: Partial<NonNullable<RetirementAccountConfig["withdrawal"]>>,
  ) => {
    if (!retirementSystemDraft) {
      return;
    }

    syncRetirementSystem({
      ...retirementSystemDraft,
      accounts: retirementSystemDraft.accounts.map((account) =>
        account.id === accountId
          ? {
              ...account,
              withdrawal: {
                ...account.withdrawal,
                ...updates,
              },
            }
          : account,
      ),
    });
  };

  const removeAccount = (accountId: string) => {
    if (!retirementSystemDraft) {
      return;
    }

    syncRetirementSystem({
      ...retirementSystemDraft,
      accounts: retirementSystemDraft.accounts.filter(
        (account) => account.id !== accountId,
      ),
      balanceHistory: (retirementSystemDraft.balanceHistory ?? []).filter(
        (snapshot) => snapshot.accountId !== accountId,
      ),
      contributionRules: retirementSystemDraft.contributionRules.map(
        (rule) => ({
          ...rule,
          accountAllocations: Object.fromEntries(
            Object.entries(rule.accountAllocations ?? {}).filter(
              ([candidateId]) => candidateId !== accountId,
            ),
          ),
        }),
      ),
    });
  };

  const addContributionRule = () => {
    const baseSystem =
      retirementSystemDraft ??
      sanitizeRetirementSystemConfig(createStarterRetirementSystem());
    if (!baseSystem) {
      return;
    }

    syncRetirementSystem({
      ...baseSystem,
      contributionRules: [
        ...baseSystem.contributionRules,
        {
          minAge: null,
          maxAge: null,
          employeeRate: 0,
          employerRate: 0,
          monthlyIncomeCap: null,
          annualContributionCap: null,
          accountAllocations:
            baseSystem.accounts[0] != null
              ? { [baseSystem.accounts[0].id]: 1 }
              : {},
          accountAllocationGroups: {},
        },
      ],
    });
  };

  const updateContributionRule = (
    ruleIndex: number,
    updates: Partial<RetirementContributionRule>,
  ) => {
    if (!retirementSystemDraft) {
      return;
    }

    syncRetirementSystem({
      ...retirementSystemDraft,
      contributionRules: retirementSystemDraft.contributionRules.map(
        (rule, index) => (index === ruleIndex ? { ...rule, ...updates } : rule),
      ),
    });
  };

  const updateRuleAccountAllocation = (
    ruleIndex: number,
    accountId: string,
    percent: string,
  ) => {
    if (!retirementSystemDraft) {
      return;
    }

    const value = parseNumber(percent) / 100;
    const rule = retirementSystemDraft.contributionRules[ruleIndex];
    if (!rule) {
      return;
    }

    const nextAllocations = {
      ...(rule.accountAllocations ?? {}),
    };
    if (value > 0) {
      nextAllocations[accountId] = value;
    } else {
      delete nextAllocations[accountId];
    }

    updateContributionRule(ruleIndex, {
      accountAllocations: nextAllocations,
    });
  };

  const updateRuleGroupAllocation = (
    ruleIndex: number,
    group: string,
    percent: string,
  ) => {
    if (!retirementSystemDraft) {
      return;
    }

    const value = parseNumber(percent) / 100;
    const rule = retirementSystemDraft.contributionRules[ruleIndex];
    if (!rule) {
      return;
    }

    const nextGroups = {
      ...(rule.accountAllocationGroups ?? {}),
    };
    if (value > 0) {
      nextGroups[group] = value;
    } else {
      delete nextGroups[group];
    }

    updateContributionRule(ruleIndex, {
      accountAllocationGroups: nextGroups,
    });
  };

  const removeContributionRule = (ruleIndex: number) => {
    if (!retirementSystemDraft) {
      return;
    }

    syncRetirementSystem({
      ...retirementSystemDraft,
      contributionRules: retirementSystemDraft.contributionRules.filter(
        (_, index) => index !== ruleIndex,
      ),
    });
  };

  const updateBalance = (accountId: string, value: string) => {
    if (!retirementSystemDraft) {
      return;
    }

    syncRetirementSystem(
      upsertRetirementBalanceSnapshot(retirementSystemDraft, {
        year: balanceYear,
        monthIndex: balanceMonthIndex,
        accountId,
        balance: parseNumber(value),
      }),
    );
  };

  const loadExample = (retirementSystem: RetirementSystemConfig) => {
    syncRetirementSystem(retirementSystem);
    const latestPeriod = getLatestRetirementBalancePeriod(retirementSystem);
    if (latestPeriod) {
      setBalanceYear(latestPeriod.year);
      setBalanceMonthIndex(latestPeriod.monthIndex);
    }
  };

  const handleSave = () => {
    onUpdate(
      sanitizeFireSettings({
        ...settings,
        retirementSystem: retirementSystemDraft,
      }),
    );
    onClose();
  };

  const handleExport = () => {
    if (!retirementSystemDraft) {
      return;
    }

    const blob = new Blob([JSON.stringify(retirementSystemDraft, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "retirement-system-config.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const parsed = sanitizeRetirementSystemConfig(
        JSON.parse(await file.text()) as RetirementSystemConfig,
      );
      if (!parsed) {
        setValidationError(
          "Imported config needs at least one valid retirement account.",
        );
        return;
      }

      syncRetirementSystem(parsed);
      const latestPeriod = getLatestRetirementBalancePeriod(parsed);
      if (latestPeriod) {
        setBalanceYear(latestPeriod.year);
        setBalanceMonthIndex(latestPeriod.monthIndex);
      }
    } catch {
      setValidationError("Imported file must contain valid retirement JSON.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 px-4 py-4 backdrop-blur-sm sm:items-center">
      <div className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-7xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Retirement Module
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Configure retirement systems explicitly with fields for members,
              accounts, rules, and monthly balances.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid gap-6 overflow-y-auto overscroll-contain px-6 py-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-6 rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
            <div>
              <div className="mb-4 flex items-center gap-2 text-orange-800">
                <Flame size={18} />
                <h3 className="font-semibold">Module Actions</h3>
              </div>
              <div className="grid gap-2">
                <button
                  onClick={() => loadExample(CPF_EXAMPLE_RETIREMENT_SYSTEM)}
                  className="rounded-xl border border-orange-300 bg-white px-3 py-2 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100"
                >
                  Load CPF Example
                </button>
                <button
                  onClick={() =>
                    loadExample(SIMPLE_401K_EXAMPLE_RETIREMENT_SYSTEM)
                  }
                  className="rounded-xl border border-orange-300 bg-white px-3 py-2 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100"
                >
                  Load 401(k) Example
                </button>
                <button
                  onClick={() =>
                    syncRetirementSystem(createStarterRetirementSystem())
                  }
                  className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  Start Blank Module
                </button>
                <button
                  onClick={() => syncRetirementSystem(null)}
                  className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  Disable Retirement Module
                </button>
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  <Upload size={15} />
                  Import JSON
                </button>
                <button
                  onClick={handleExport}
                  disabled={!retirementSystemDraft}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download size={15} />
                  Export JSON
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(event) => void handleImport(event)}
                />
              </div>
            </div>

            <section className="space-y-3">
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Status
                </p>
                <p className="mt-2 text-lg font-semibold text-gray-900">
                  {retirementSystemDraft ? "Configured" : "Disabled"}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Members
                </p>
                <p className="mt-2 text-lg font-semibold text-gray-900">
                  {memberCount}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Accounts
                </p>
                <p className="mt-2 text-lg font-semibold text-gray-900">
                  {retirementSystemDraft?.accounts.length ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Latest balance month
                </p>
                <p className="mt-2 text-lg font-semibold text-gray-900">
                  {latestBalancePeriod
                    ? formatMonthPeriod(
                        latestBalancePeriod.year,
                        latestBalancePeriod.monthIndex,
                      )
                    : "No saved balances"}
                </p>
              </div>
            </section>

            <div className="rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm text-gray-600">
              JSON is now optional. Use import/export when you want to move a
              configuration between accounts or edit it outside the app.
            </div>
          </aside>

          <div className="space-y-6">
            {retirementSystemDraft ? (
              <>
                <section className="rounded-2xl border border-orange-200 bg-white p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        System Basics
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Core defaults used by the retirement projection engine.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-right text-xs text-gray-500">
                      <p>Projection horizon</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">
                        {retirementSystemDraft.projectionYears} years
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">
                        System name
                      </span>
                      <input
                        type="text"
                        value={retirementSystemDraft.name}
                        onChange={(event) =>
                          updateSystem({ name: event.target.value })
                        }
                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">
                        Payout start age
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={retirementSystemDraft.payoutStartAge ?? ""}
                        onChange={(event) =>
                          updateSystem({
                            payoutStartAge: parseOptionalNumber(
                              event.target.value,
                            ),
                          })
                        }
                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">
                        Default payout mode
                      </span>
                      <select
                        value={
                          retirementSystemDraft.defaultPayoutMode ?? "drawdown"
                        }
                        onChange={(event) =>
                          updateSystem({
                            defaultPayoutMode: event.target
                              .value as RetirementPayoutMode,
                          })
                        }
                        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                      >
                        {PAYOUT_MODE_OPTIONS.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block md:col-span-2 xl:col-span-3">
                      <span className="mb-1 block text-sm font-medium text-gray-700">
                        Description
                      </span>
                      <textarea
                        value={retirementSystemDraft.description ?? ""}
                        onChange={(event) =>
                          updateSystem({ description: event.target.value })
                        }
                        rows={3}
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">
                        Projection years
                      </span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={retirementSystemDraft.projectionYears ?? 40}
                        onChange={(event) =>
                          updateSystem({
                            projectionYears: Math.max(
                              1,
                              Math.round(parseNumber(event.target.value)),
                            ),
                          })
                        }
                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                      />
                    </label>
                  </div>
                </section>

                <section className="rounded-2xl border border-orange-200 bg-white p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">Members</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        People whose age and income influence retirement
                        contributions.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={addGenericMember}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                      >
                        <Plus size={15} />
                        Add Member
                      </button>
                      {isCpfSystem ? (
                        <button
                          onClick={addCpfMember}
                          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:from-orange-600 hover:to-red-600"
                        >
                          <Plus size={15} />
                          Add CPF Stack
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {(retirementSystemDraft.members ?? []).map((member) => (
                      <article
                        key={member.id}
                        className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4"
                      >
                        <div className="mb-3 text-xs uppercase tracking-wide text-gray-400">
                          {member.id}
                        </div>
                        <div className="space-y-3">
                          <label className="block">
                            <span className="mb-1 block text-sm font-medium text-gray-700">
                              Member name
                            </span>
                            <input
                              type="text"
                              value={member.name}
                              onChange={(event) =>
                                updateMember(member.id, {
                                  name: event.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-sm font-medium text-gray-700">
                              Monthly income
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="100"
                              value={member.monthlyIncome ?? 0}
                              onChange={(event) =>
                                updateMember(member.id, {
                                  monthlyIncome: parseNumber(
                                    event.target.value,
                                  ),
                                })
                              }
                              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-sm font-medium text-gray-700">
                              Date of birth
                            </span>
                            <input
                              type="date"
                              value={member.dateOfBirth ?? ""}
                              onChange={(event) =>
                                updateMember(member.id, {
                                  dateOfBirth: parseOptionalDate(
                                    event.target.value,
                                  ),
                                })
                              }
                              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                            />
                          </label>
                          <button
                            onClick={() => removeMember(member.id)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300 px-3 py-3 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50"
                          >
                            <Trash2 size={15} />
                            Remove Member
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-orange-200 bg-white p-4">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        Monthly Balance Update
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Enter balances for the statement month. The latest saved
                        month becomes the projection starting point.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
                          Month
                        </span>
                        <select
                          value={balanceMonthIndex}
                          onChange={(event) =>
                            setBalanceMonthIndex(Number(event.target.value))
                          }
                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                        >
                          {MONTHS.map((month, monthIndex) => (
                            <option key={month} value={monthIndex}>
                              {month}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
                          Year
                        </span>
                        <input
                          type="number"
                          step="1"
                          value={balanceYear}
                          onChange={(event) =>
                            setBalanceYear(
                              Math.round(parseNumber(event.target.value)),
                            )
                          }
                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {accountsByMember.map((group) => (
                      <article
                        key={group.id}
                        className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4"
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <h4 className="font-semibold text-gray-900">
                              {group.name}
                            </h4>
                            <p className="text-xs text-gray-500">
                              {formatMonthPeriod(
                                balanceYear,
                                balanceMonthIndex,
                              )}{" "}
                              balances
                            </p>
                          </div>
                          <div className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-right text-xs text-gray-500">
                            <p>Income</p>
                            <p className="mt-1 text-sm font-semibold text-gray-900">
                              {formatCurrency(group.monthlyIncome)}
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {group.accounts.map((account) => (
                            <label
                              key={account.id}
                              className="block rounded-2xl border border-gray-200 bg-white px-4 py-3"
                            >
                              <span className="block text-sm font-medium text-gray-800">
                                {account.name}
                              </span>
                              <span className="mt-1 block text-xs uppercase tracking-wide text-gray-400">
                                {account.contributionGroup ??
                                  account.classification}
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="100"
                                value={balanceMap[account.id] ?? 0}
                                onChange={(event) =>
                                  updateBalance(account.id, event.target.value)
                                }
                                className="mt-3 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                              />
                            </label>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-orange-200 bg-white p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">Accounts</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Every tracked retirement or semi-liquid account that
                        affects FIRE access.
                      </p>
                    </div>
                    <button
                      onClick={addAccount}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:from-orange-600 hover:to-red-600"
                    >
                      <Plus size={15} />
                      Add Account
                    </button>
                  </div>

                  <div className="space-y-4">
                    {retirementSystemDraft.accounts.map((account) => (
                      <article
                        key={account.id}
                        className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4"
                      >
                        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-gray-400">
                              {account.id}
                            </p>
                            <p className="mt-1 text-sm text-gray-500">
                              Current default balance{" "}
                              {formatCurrency(account.balance)}
                            </p>
                          </div>
                          <button
                            onClick={() => removeAccount(account.id)}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50"
                          >
                            <Trash2 size={15} />
                            Remove Account
                          </button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <label className="block xl:col-span-2">
                            <span className="mb-1 block text-sm font-medium text-gray-700">
                              Account name
                            </span>
                            <input
                              type="text"
                              value={account.name}
                              onChange={(event) =>
                                updateAccount(account.id, {
                                  name: event.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-sm font-medium text-gray-700">
                              Member
                            </span>
                            <select
                              value={account.memberId ?? ""}
                              onChange={(event) =>
                                updateAccount(account.id, {
                                  memberId: event.target.value || null,
                                })
                              }
                              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                            >
                              <option value="">Unassigned</option>
                              {(retirementSystemDraft.members ?? []).map(
                                (member) => (
                                  <option key={member.id} value={member.id}>
                                    {member.name}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-sm font-medium text-gray-700">
                              Contribution group
                            </span>
                            <input
                              type="text"
                              value={account.contributionGroup ?? ""}
                              onChange={(event) =>
                                updateAccount(account.id, {
                                  contributionGroup:
                                    event.target.value.trim() || null,
                                })
                              }
                              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-sm font-medium text-gray-700">
                              Classification
                            </span>
                            <select
                              value={account.classification}
                              onChange={(event) =>
                                updateAccount(account.id, {
                                  classification: event.target
                                    .value as RetirementAccountClassification,
                                })
                              }
                              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                            >
                              {CLASSIFICATION_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-sm font-medium text-gray-700">
                              Annual return (%)
                            </span>
                            <input
                              type="number"
                              step="0.1"
                              value={account.annualReturnRate}
                              onChange={(event) =>
                                updateAccount(account.id, {
                                  annualReturnRate: parseNumber(
                                    event.target.value,
                                  ),
                                })
                              }
                              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-sm font-medium text-gray-700">
                              Default balance
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="100"
                              value={account.balance}
                              onChange={(event) =>
                                updateAccount(account.id, {
                                  balance: parseNumber(event.target.value),
                                })
                              }
                              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-sm font-medium text-gray-700">
                              Minimum withdrawal age
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={account.withdrawal?.minimumAge ?? ""}
                              onChange={(event) =>
                                updateAccountWithdrawal(account.id, {
                                  minimumAge: parseOptionalNumber(
                                    event.target.value,
                                  ),
                                })
                              }
                              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-sm font-medium text-gray-700">
                              Account payout age
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={account.withdrawal?.payoutStartAge ?? ""}
                              onChange={(event) =>
                                updateAccountWithdrawal(account.id, {
                                  payoutStartAge: parseOptionalNumber(
                                    event.target.value,
                                  ),
                                })
                              }
                              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-sm font-medium text-gray-700">
                              Payout mode
                            </span>
                            <select
                              value={
                                account.withdrawal?.payoutMode ??
                                retirementSystemDraft.defaultPayoutMode ??
                                "drawdown"
                              }
                              onChange={(event) =>
                                updateAccountWithdrawal(account.id, {
                                  payoutMode: event.target
                                    .value as RetirementPayoutMode,
                                })
                              }
                              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                            >
                              {PAYOUT_MODE_OPTIONS.map((mode) => (
                                <option key={mode} value={mode}>
                                  {mode}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-sm font-medium text-gray-700">
                              Drawdown rate (%)
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={
                                account.withdrawal?.annualDrawdownRate ?? ""
                              }
                              onChange={(event) =>
                                updateAccountWithdrawal(account.id, {
                                  annualDrawdownRate: parseOptionalNumber(
                                    event.target.value,
                                  ),
                                })
                              }
                              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-sm font-medium text-gray-700">
                              Annuity conversion (%)
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={
                                account.withdrawal?.annuityConversionRate ?? ""
                              }
                              onChange={(event) =>
                                updateAccountWithdrawal(account.id, {
                                  annuityConversionRate: parseOptionalNumber(
                                    event.target.value,
                                  ),
                                })
                              }
                              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                            />
                          </label>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-orange-200 bg-white p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        Contribution Rules
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Age bands, caps, and allocation weights for ongoing
                        retirement contributions.
                      </p>
                    </div>
                    <button
                      onClick={addContributionRule}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:from-orange-600 hover:to-red-600"
                    >
                      <Plus size={15} />
                      Add Rule
                    </button>
                  </div>

                  <div className="space-y-4">
                    {retirementSystemDraft.contributionRules.map(
                      (rule, ruleIndex) => (
                        <article
                          key={`rule-${ruleIndex}`}
                          className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4"
                        >
                          <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-gray-900">
                                Rule {ruleIndex + 1}
                              </p>
                              <p className="mt-1 text-sm text-gray-500">
                                Allocation weights are entered as percentages
                                and normalized on save.
                              </p>
                            </div>
                            <button
                              onClick={() => removeContributionRule(ruleIndex)}
                              className="inline-flex items-center gap-2 rounded-xl border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50"
                            >
                              <Trash2 size={15} />
                              Remove Rule
                            </button>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            <label className="block">
                              <span className="mb-1 block text-sm font-medium text-gray-700">
                                Minimum age
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={rule.minAge ?? ""}
                                onChange={(event) =>
                                  updateContributionRule(ruleIndex, {
                                    minAge: parseOptionalNumber(
                                      event.target.value,
                                    ),
                                  })
                                }
                                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-sm font-medium text-gray-700">
                                Maximum age
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={rule.maxAge ?? ""}
                                onChange={(event) =>
                                  updateContributionRule(ruleIndex, {
                                    maxAge: parseOptionalNumber(
                                      event.target.value,
                                    ),
                                  })
                                }
                                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-sm font-medium text-gray-700">
                                Employee rate (%)
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={rule.employeeRate}
                                onChange={(event) =>
                                  updateContributionRule(ruleIndex, {
                                    employeeRate: parseNumber(
                                      event.target.value,
                                    ),
                                  })
                                }
                                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-sm font-medium text-gray-700">
                                Employer rate (%)
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={rule.employerRate ?? 0}
                                onChange={(event) =>
                                  updateContributionRule(ruleIndex, {
                                    employerRate: parseNumber(
                                      event.target.value,
                                    ),
                                  })
                                }
                                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-sm font-medium text-gray-700">
                                Monthly income cap
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="100"
                                value={rule.monthlyIncomeCap ?? ""}
                                onChange={(event) =>
                                  updateContributionRule(ruleIndex, {
                                    monthlyIncomeCap: parseOptionalNumber(
                                      event.target.value,
                                    ),
                                  })
                                }
                                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-sm font-medium text-gray-700">
                                Annual contribution cap
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="100"
                                value={rule.annualContributionCap ?? ""}
                                onChange={(event) =>
                                  updateContributionRule(ruleIndex, {
                                    annualContributionCap: parseOptionalNumber(
                                      event.target.value,
                                    ),
                                  })
                                }
                                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                              />
                            </label>
                          </div>

                          <div className="mt-4 grid gap-4 xl:grid-cols-2">
                            <div className="rounded-2xl border border-gray-200 bg-white p-4">
                              <h4 className="font-medium text-gray-900">
                                Account allocations
                              </h4>
                              <p className="mt-1 text-xs text-gray-500">
                                Current mix:{" "}
                                {Object.values(rule.accountAllocations ?? {})
                                  .length
                                  ? Object.values(rule.accountAllocations ?? {})
                                      .map(formatPercentLabel)
                                      .join(" / ")
                                  : "none"}
                              </p>
                              <div className="mt-3 space-y-3">
                                {retirementSystemDraft.accounts.map(
                                  (account) => (
                                    <label
                                      key={`rule-${ruleIndex}-account-${account.id}`}
                                      className="block"
                                    >
                                      <span className="mb-1 block text-sm font-medium text-gray-700">
                                        {account.name}
                                      </span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={(
                                          (rule.accountAllocations?.[
                                            account.id
                                          ] ?? 0) * 100
                                        )
                                          .toFixed(1)
                                          .replace(/\.0$/, "")}
                                        onChange={(event) =>
                                          updateRuleAccountAllocation(
                                            ruleIndex,
                                            account.id,
                                            event.target.value,
                                          )
                                        }
                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                                      />
                                    </label>
                                  ),
                                )}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-gray-200 bg-white p-4">
                              <h4 className="font-medium text-gray-900">
                                Contribution group allocations
                              </h4>
                              <p className="mt-1 text-xs text-gray-500">
                                Use groups like OA, SA, or employer buckets when
                                a rule should target more than one account.
                              </p>
                              {contributionGroups.length > 0 ? (
                                <div className="mt-3 space-y-3">
                                  {contributionGroups.map((group) => (
                                    <label
                                      key={`rule-${ruleIndex}-group-${group}`}
                                      className="block"
                                    >
                                      <span className="mb-1 block text-sm font-medium text-gray-700">
                                        {group}
                                      </span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={(
                                          (rule.accountAllocationGroups?.[
                                            group
                                          ] ?? 0) * 100
                                        )
                                          .toFixed(1)
                                          .replace(/\.0$/, "")}
                                        onChange={(event) =>
                                          updateRuleGroupAllocation(
                                            ruleIndex,
                                            group,
                                            event.target.value,
                                          )
                                        }
                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                                      />
                                    </label>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-3 text-sm text-gray-500">
                                  Add contribution groups on accounts to edit
                                  group-level allocations here.
                                </p>
                              )}
                            </div>
                          </div>
                        </article>
                      ),
                    )}
                  </div>
                </section>
              </>
            ) : (
              <section className="rounded-2xl border border-dashed border-orange-300 bg-white px-6 py-8 text-sm text-gray-600">
                Start with a blank module or load an example. FIRE can still run
                without retirement logic, but this editor is where CPF, 401(k),
                and custom systems now live.
              </section>
            )}

            {validationError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {validationError}
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-gray-200 px-6 py-4">
          <div className="mb-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            The retirement module now has explicit forms for everything the
            projection engine uses. JSON import and export remain available for
            bulk edits and power-user workflows.
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-xl bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:from-orange-600 hover:to-red-600"
            >
              Save Retirement Module
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
