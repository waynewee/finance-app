import { useMemo, useState } from "react";
import { Flame, Plus, Settings2, Target, Trash2, X } from "lucide-react";
import { MONTHS } from "../data/defaultCategories";
import { sanitizeFireSettings } from "../lib/fire";
import { type FireSnapshotPreference } from "../lib/firePreferences";
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
  previousSnapshot: LatestSnapshot | null;
  snapshotPreference: FireSnapshotPreference;
  onSnapshotPreferenceChange: (preference: FireSnapshotPreference) => void;
  onUpdate: (settings: FireSettings) => void;
  onClose: () => void;
}

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

function formatRetirementSystem(
  retirementSystem: RetirementSystemConfig | null,
): string {
  return retirementSystem ? JSON.stringify(retirementSystem, null, 2) : "";
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

export default function FireConfigModal({
  settings,
  latestSnapshot,
  previousSnapshot,
  snapshotPreference,
  onSnapshotPreferenceChange,
  onUpdate,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<FireSettings>({ ...settings });
  const [retirementSystemDraft, setRetirementSystemDraft] = useState(
    sanitizeRetirementSystemConfig(settings.retirementSystem),
  );
  const [retirementSystemText, setRetirementSystemText] = useState(
    formatRetirementSystem(settings.retirementSystem),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
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

  const balanceMap = useMemo(
    () =>
      getRetirementBalanceMapForPeriod(retirementSystemDraft, {
        year: balanceYear,
        monthIndex: balanceMonthIndex,
      }),
    [balanceMonthIndex, balanceYear, retirementSystemDraft],
  );

  const accountsByMember = useMemo(() => {
    if (!retirementSystemDraft) {
      return [];
    }

    const members = retirementSystemDraft.members ?? [];
    const memberMap = new Map(members.map((member) => [member.id, member]));
    const groups = new Map<
      string,
      {
        id: string;
        name: string;
        monthlyIncome: number;
        dateOfBirth: string | null;
        accounts: RetirementSystemConfig["accounts"];
      }
    >();

    members.forEach((member) => {
      groups.set(member.id, {
        id: member.id,
        name: member.name,
        monthlyIncome: member.monthlyIncome ?? 0,
        dateOfBirth: member.dateOfBirth ?? null,
        accounts: [],
      });
    });

    retirementSystemDraft.accounts.forEach((account) => {
      const memberId = account.memberId ?? "household";
      if (!groups.has(memberId)) {
        groups.set(memberId, {
          id: memberId,
          name: memberMap.get(memberId)?.name ?? "Household",
          monthlyIncome: memberMap.get(memberId)?.monthlyIncome ?? 0,
          dateOfBirth: memberMap.get(memberId)?.dateOfBirth ?? null,
          accounts: [],
        });
      }

      groups.get(memberId)?.accounts.push(account);
    });

    return Array.from(groups.values()).filter(
      (group) => group.accounts.length > 0,
    );
  }, [retirementSystemDraft]);

  const memberCount = useMemo(() => {
    if (!retirementSystemDraft) {
      return 0;
    }

    const memberIds = new Set(
      (retirementSystemDraft.members ?? [])
        .map((member) => member.id)
        .filter((memberId) => memberId.trim().length > 0),
    );

    retirementSystemDraft.accounts.forEach((account) => {
      if (account.memberId?.trim()) {
        memberIds.add(account.memberId.trim());
      }
    });

    return memberIds.size;
  }, [retirementSystemDraft]);

  const syncRetirementSystem = (next: RetirementSystemConfig | null) => {
    const sanitized = sanitizeRetirementSystemConfig(next);
    setRetirementSystemDraft(sanitized);
    setRetirementSystemText(formatRetirementSystem(sanitized));
    setValidationError(null);
  };

  const handleSave = () => {
    setValidationError(null);
    onUpdate(
      sanitizeFireSettings({
        ...draft,
        retirementSystem: retirementSystemDraft,
      }),
    );
    onClose();
  };

  const loadExample = (retirementSystem: RetirementSystemConfig) => {
    syncRetirementSystem(retirementSystem);
    const latestPeriod = getLatestRetirementBalancePeriod(retirementSystem);
    if (latestPeriod) {
      setBalanceYear(latestPeriod.year);
      setBalanceMonthIndex(latestPeriod.monthIndex);
    }
  };

  const handleApplyAdvancedJson = () => {
    if (!retirementSystemText.trim()) {
      syncRetirementSystem(null);
      return;
    }

    try {
      const parsed = sanitizeRetirementSystemConfig(
        JSON.parse(retirementSystemText) as RetirementSystemConfig,
      );

      if (!parsed) {
        setValidationError(
          "Retirement system config needs at least one valid account.",
        );
        return;
      }

      syncRetirementSystem(parsed);
    } catch {
      setValidationError("Retirement system config must be valid JSON.");
    }
  };

  const addCpfMember = () => {
    const baseSystem =
      retirementSystemDraft ??
      sanitizeRetirementSystemConfig(CPF_EXAMPLE_RETIREMENT_SYSTEM);
    if (!baseSystem) {
      return;
    }

    const memberCount = (baseSystem.members?.length ?? 0) + 1;
    const memberName = `Member ${memberCount}`;
    const memberId = `${createRetirementMemberId(memberName)}-${Date.now().toString(36).slice(-4)}`;
    syncRetirementSystem(
      addCpfMemberToRetirementSystem(baseSystem, {
        id: memberId,
        name: memberName,
        monthlyIncome: 0,
        dateOfBirth: null,
      }),
    );
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
      if (account.memberId !== memberId || !updates.name) {
        return account;
      }

      if (account.contributionGroup === "oa") {
        return { ...account, name: `${updates.name} OA` };
      }

      if (account.contributionGroup === "sa") {
        return { ...account, name: `${updates.name} SA` };
      }

      if (account.contributionGroup === "ma") {
        return { ...account, name: `${updates.name} MA` };
      }

      return account;
    });

    syncRetirementSystem({
      ...retirementSystemDraft,
      members: nextMembers,
      accounts: nextAccounts,
    });
  };

  const removeMember = (memberId: string) => {
    if (!retirementSystemDraft) {
      return;
    }

    const accountIds = retirementSystemDraft.accounts
      .filter((account) => account.memberId === memberId)
      .map((account) => account.id);
    syncRetirementSystem({
      ...retirementSystemDraft,
      members: (retirementSystemDraft.members ?? []).filter(
        (member) => member.id !== memberId,
      ),
      accounts: retirementSystemDraft.accounts.filter(
        (account) => account.memberId !== memberId,
      ),
      balanceHistory: (retirementSystemDraft.balanceHistory ?? []).filter(
        (snapshot) => !accountIds.includes(snapshot.accountId),
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 flex max-h-[92vh] w-full max-w-6xl flex-col rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              FIRE Settings
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Manage household FIRE assumptions and track CPF or retirement
              balances by member.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid gap-6 overflow-y-auto px-6 py-5 xl:grid-cols-[320px_320px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="mb-4 flex items-center gap-2 text-amber-800">
              <Flame size={18} />
              <h3 className="font-semibold">Goal Assumptions</h3>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  Annual spending in retirement
                </span>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={draft.annualSpendingGoal}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      annualSpendingGoal: parseNumber(event.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  Safe withdrawal rate (%)
                </span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={draft.withdrawalRate}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      withdrawalRate: parseNumber(event.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  Expected annual return (%)
                </span>
                <input
                  type="number"
                  step="0.1"
                  value={draft.expectedAnnualReturn}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      expectedAnnualReturn: parseNumber(event.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
            <div className="mb-4 flex items-center gap-2 text-indigo-800">
              <Target size={18} />
              <h3 className="font-semibold">Timeline Controls</h3>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-indigo-200 bg-white px-4 py-3 text-sm text-gray-600">
                Monthly liquid savings are inferred from your latest two net
                worth snapshots. The planner backs out expected market growth
                and modeled retirement contributions, so you do not need to
                enter a separate savings number here.
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  Date of birth
                </span>
                <input
                  type="date"
                  value={draft.dateOfBirth ?? ""}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      dateOfBirth: parseOptionalDate(event.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  Target FIRE age
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.targetFireAge ?? ""}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      targetFireAge: parseOptionalNumber(event.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  Stop retirement contributions at age
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.retirementContributionStopAge ?? ""}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      retirementContributionStopAge: parseOptionalNumber(
                        event.target.value,
                      ),
                    }))
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
                <p className="mt-1 text-xs text-gray-500">
                  CPF or retirement-account contributions stop at this age, even
                  if your FIRE age is later.
                </p>
              </label>

              <div className="rounded-2xl border border-indigo-200 bg-white px-4 py-3">
                <p className="text-sm font-medium text-gray-700">
                  FIRE tracker month
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Choose whether the tracker uses the latest recorded month or
                  the month before it. This preference is saved on this device.
                </p>
                <div className="mt-3 flex items-center gap-1 rounded-xl bg-gray-100 p-1">
                  <button
                    type="button"
                    onClick={() => onSnapshotPreferenceChange("current")}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      snapshotPreference === "current"
                        ? "bg-white text-indigo-700 shadow-sm"
                        : "text-gray-500 hover:text-indigo-600"
                    }`}
                  >
                    Current month
                    {latestSnapshot
                      ? ` (${formatMonthPeriod(latestSnapshot.year, latestSnapshot.monthIndex)})`
                      : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSnapshotPreferenceChange("previous")}
                    disabled={!previousSnapshot}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      snapshotPreference === "previous"
                        ? "bg-white text-indigo-700 shadow-sm"
                        : "text-gray-500 hover:text-indigo-600"
                    } ${!previousSnapshot ? "cursor-not-allowed opacity-50 hover:text-gray-500" : ""}`}
                  >
                    Previous month
                    {previousSnapshot
                      ? ` (${formatMonthPeriod(previousSnapshot.year, previousSnapshot.monthIndex)})`
                      : ""}
                  </button>
                </div>
                {!previousSnapshot ? (
                  <p className="mt-2 text-xs text-amber-700">
                    Add one more month of net worth history to enable the
                    previous-month FIRE view.
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="space-y-6 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-900">
                  Retirement Module
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  Use a guided CPF workflow for monthly balances and individual
                  household members.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => loadExample(CPF_EXAMPLE_RETIREMENT_SYSTEM)}
                  className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  Load CPF Example
                </button>
                <button
                  onClick={() =>
                    loadExample(SIMPLE_401K_EXAMPLE_RETIREMENT_SYSTEM)
                  }
                  className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  Load 401(k) Example
                </button>
                <button
                  onClick={() => syncRetirementSystem(null)}
                  className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
                >
                  Clear
                </button>
              </div>
            </div>

            {retirementSystemDraft ? (
              <>
                <section className="rounded-2xl border border-emerald-200 bg-white p-4">
                  <div className="space-y-4">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">
                        System name
                      </span>
                      <input
                        type="text"
                        value={retirementSystemDraft.name}
                        onChange={(event) =>
                          syncRetirementSystem({
                            ...retirementSystemDraft,
                            name: event.target.value,
                          })
                        }
                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
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
                          syncRetirementSystem({
                            ...retirementSystemDraft,
                            payoutStartAge: parseOptionalNumber(
                              event.target.value,
                            ),
                          })
                        }
                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                      />
                    </label>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-gray-400">
                        Members
                      </p>
                      <p className="mt-2 text-lg font-semibold text-gray-900">
                        {memberCount}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-gray-400">
                        Accounts
                      </p>
                      <p className="mt-2 text-lg font-semibold text-gray-900">
                        {retirementSystemDraft.accounts.length}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-gray-400">
                        Latest update
                      </p>
                      <p className="mt-2 text-lg font-semibold text-gray-900">
                        {latestBalancePeriod
                          ? formatMonthPeriod(
                              latestBalancePeriod.year,
                              latestBalancePeriod.monthIndex,
                            )
                          : "No monthly balance yet"}
                      </p>
                    </div>
                  </div>
                </section>

                {isCpfSystem ? (
                  <section className="rounded-2xl border border-emerald-200 bg-white p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-gray-900">
                          CPF Members
                        </h4>
                        <p className="mt-1 text-sm text-gray-500">
                          Each person keeps an individual CPF stack, with
                          contributions projected from their own age and income.
                        </p>
                      </div>
                      <button
                        onClick={addCpfMember}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                      >
                        <Plus size={15} />
                        Add CPF Member
                      </button>
                    </div>

                    <div className="space-y-3">
                      {(retirementSystemDraft.members ?? []).map((member) => (
                        <article
                          key={member.id}
                          className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4"
                        >
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
                                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
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
                                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
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
                                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                              />
                            </label>
                            <button
                              onClick={() => removeMember(member.id)}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300 px-3 py-3 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50"
                            >
                              <Trash2 size={15} />
                              Remove
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="rounded-2xl border border-emerald-200 bg-white p-4">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-gray-900">
                        Monthly Balance Update
                      </h4>
                      <p className="mt-1 text-sm text-gray-500">
                        Enter balances for the statement month. Projections use
                        the latest saved month automatically.
                      </p>
                    </div>
                    <div className="space-y-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
                          Month
                        </span>
                        <select
                          value={balanceMonthIndex}
                          onChange={(event) =>
                            setBalanceMonthIndex(Number(event.target.value))
                          }
                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
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
                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
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
                            <h5 className="font-semibold text-gray-900">
                              {group.name}
                            </h5>
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
                              {group.monthlyIncome.toLocaleString("en-US", {
                                style: "currency",
                                currency: "USD",
                                maximumFractionDigits: 0,
                              })}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
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
                                className="mt-3 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                              />
                            </label>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <details className="rounded-2xl border border-gray-200 bg-white p-4">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-gray-900">
                    <span className="inline-flex items-center gap-2">
                      <Settings2 size={16} />
                      Advanced JSON
                    </span>
                  </summary>
                  <p className="mt-3 text-sm text-gray-500">
                    Use this for non-CPF systems or advanced edits. Apply
                    changes to sync them back into the guided view.
                  </p>
                  <textarea
                    value={retirementSystemText}
                    onChange={(event) => {
                      setRetirementSystemText(event.target.value);
                      setValidationError(null);
                    }}
                    spellCheck={false}
                    rows={16}
                    className="mt-3 min-h-[280px] w-full rounded-2xl border border-gray-300 bg-gray-50 px-4 py-3 font-mono text-xs leading-6 text-gray-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={handleApplyAdvancedJson}
                      className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                    >
                      Apply JSON
                    </button>
                  </div>
                </details>
              </>
            ) : (
              <section className="rounded-2xl border border-dashed border-emerald-300 bg-white px-5 py-6 text-sm text-gray-600">
                Load a CPF example to start tracking per-person balances
                monthly, or keep retirement disabled for a plain FIRE setup.
              </section>
            )}

            {validationError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {validationError}
              </div>
            ) : null}
          </section>
        </div>

        <div className="border-t border-gray-200 px-6 py-4">
          <div className="mb-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            FIRE projections now distinguish household liquid assets from
            per-member retirement balances. CPF-style contributions use each
            member's own age and income, and the latest monthly CPF balances
            become the starting point for projections.
            {draft.retirementContributionStopAge != null
              ? ` Retirement contributions stop at age ${draft.retirementContributionStopAge}.`
              : ""}
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
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Save FIRE Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
