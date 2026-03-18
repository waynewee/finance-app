export type RetirementAccountClassification =
  | "liquid"
  | "semi-liquid"
  | "locked"
  | "restricted";

export type RetirementPayoutMode = "none" | "drawdown" | "annuity";

export interface RetirementMemberConfig {
  id: string;
  name: string;
  monthlyIncome?: number;
  dateOfBirth?: string | null;
}

export interface RetirementBalancePeriod {
  year: number;
  monthIndex: number;
}

export interface RetirementBalanceSnapshot extends RetirementBalancePeriod {
  accountId: string;
  balance: number;
}

export interface RetirementWithdrawalRule {
  minimumAge?: number | null;
  payoutStartAge?: number | null;
  payoutMode?: RetirementPayoutMode;
  annualDrawdownRate?: number | null;
  annuityConversionRate?: number | null;
}

export interface RetirementAccountConfig {
  id: string;
  name: string;
  balance: number;
  annualReturnRate: number;
  classification: RetirementAccountClassification;
  memberId?: string | null;
  contributionGroup?: string | null;
  withdrawal?: RetirementWithdrawalRule;
}

export interface RetirementContributionRule {
  minAge?: number | null;
  maxAge?: number | null;
  employeeRate: number;
  employerRate?: number;
  monthlyIncomeCap?: number | null;
  annualContributionCap?: number | null;
  accountAllocations?: Record<string, number>;
  accountAllocationGroups?: Record<string, number>;
}

export interface RetirementSystemConfig {
  name: string;
  description?: string;
  payoutStartAge?: number | null;
  defaultPayoutMode?: RetirementPayoutMode;
  projectionYears?: number;
  members?: RetirementMemberConfig[];
  balanceHistory?: RetirementBalanceSnapshot[];
  accounts: RetirementAccountConfig[];
  contributionRules: RetirementContributionRule[];
}

export interface FireLiquidityBreakdown {
  liquid: number;
  semiLiquid: number;
  locked: number;
  restricted: number;
  residualLiquid: number;
  accessibleNow: number;
  total: number;
}

export interface RetirementProjectionPoint {
  month: number;
  yearOffset: number;
  age: number | null;
  totalBalance: number;
  accessibleBalance: number;
  liquidBalance: number;
  estimatedMonthlyIncome: number;
  breakdown: FireLiquidityBreakdown;
  accountBalances: Record<string, number>;
}

export interface RetirementAccountProjection {
  id: string;
  name: string;
  classification: RetirementAccountClassification;
  currentBalance: number;
  projectedBalance: number;
  projectedBalanceAtPayout: number | null;
  annualReturnRate: number;
  minimumWithdrawalAge: number | null;
  payoutMode: RetirementPayoutMode;
  estimatedMonthlyIncome: number;
  memberId: string | null;
  memberName: string | null;
}

export interface RetirementMemberProjection {
  id: string;
  name: string;
  monthlyIncome: number;
  currentAge: number | null;
  currentBalance: number;
  projectedBalance: number;
  estimatedMonthlyIncome: number;
}

export interface RetirementProjectionResult {
  breakdown: FireLiquidityBreakdown;
  payoutStartAge: number | null;
  projection: RetirementProjectionPoint[];
  monthsToFire: number | null;
  estimatedMonthlyRetirementIncome: number;
  trackedRetirementBalance: number;
  accountProjections: RetirementAccountProjection[];
  memberProjections: RetirementMemberProjection[];
  balancePeriod: RetirementBalancePeriod | null;
}

export interface RetirementProjectionOptions {
  currentNetWorth: number;
  monthlyIncome: number;
  currentAge: number | null;
  contributionStopAge?: number | null;
  liquidMonthlyContribution: number;
  liquidAnnualReturn: number;
  fallbackAnnualWithdrawalRate: number;
  fireNumber?: number;
  projectionMonths?: number;
  snapshotFrequencyMonths?: number;
  system: RetirementSystemConfig;
}

interface ProjectionMemberState {
  id: string;
  name: string;
  monthlyIncome: number;
  currentAge: number | null;
}

interface StartingBalanceAlignment {
  balances: Record<string, number>;
  trackedRetirementBalance: number;
}

const DEFAULT_PROJECTION_YEARS = 40;
const DEFAULT_SNAPSHOT_FREQUENCY_MONTHS = 12;
const MAX_PROJECTION_MONTHS = 100 * 12;
const CPF_ACCOUNT_GROUPS = ["oa", "sa", "ma"] as const;

function clampNumber(value: number, minimum = 0): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.max(minimum, value);
}

function normalizeAge(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function normalizePayoutMode(value: unknown): RetirementPayoutMode {
  return value === "drawdown" || value === "annuity" || value === "none"
    ? value
    : "drawdown";
}

function isValidDate(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  return !Number.isNaN(new Date(value).getTime());
}

function getAgeFromDateOfBirth(
  dateOfBirth: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!isValidDate(dateOfBirth)) {
    return null;
  }

  const birthDate = new Date(dateOfBirth);
  let age = now.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() &&
      now.getDate() >= birthDate.getDate());

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function toMonthlyReturnRate(annualReturnRate: number): number {
  const normalizedAnnualReturn = annualReturnRate / 100;
  if (normalizedAnnualReturn <= -1) {
    return -1;
  }

  return Math.pow(1 + normalizedAnnualReturn, 1 / 12) - 1;
}

function normalizeAllocationRecord(
  allocations: Record<string, number> | null | undefined,
): Record<string, number> {
  if (!allocations) {
    return {};
  }

  const entries = Object.entries(allocations)
    .filter(([key]) => key.trim().length > 0)
    .map(([key, value]) => [key, clampNumber(Number(value))] as const)
    .filter(([, value]) => value > 0);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  if (total <= 0) {
    return {};
  }

  return entries.reduce<Record<string, number>>((result, [key, value]) => {
    result[key] = value / total;
    return result;
  }, {});
}

function comparePeriods(
  left: RetirementBalancePeriod,
  right: RetirementBalancePeriod,
): number {
  if (left.year !== right.year) {
    return left.year - right.year;
  }

  return left.monthIndex - right.monthIndex;
}

function formatMemberNameFromId(value: string): string {
  const normalized = value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "Member";
  }

  return normalized
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function createRetirementMemberId(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || `member-${Date.now()}`;
}

function getMemberMap(
  system: RetirementSystemConfig,
): Map<string, RetirementMemberConfig> {
  return new Map((system.members ?? []).map((member) => [member.id, member]));
}

function resolveMemberName(
  memberMap: Map<string, RetirementMemberConfig>,
  memberId: string | null,
): string | null {
  if (!memberId) {
    return null;
  }

  return memberMap.get(memberId)?.name ?? formatMemberNameFromId(memberId);
}

function matchesAgeRule(
  age: number,
  rule: Pick<RetirementContributionRule, "minAge" | "maxAge">,
): boolean {
  const minAge = normalizeAge(rule.minAge);
  const maxAge = normalizeAge(rule.maxAge);

  if (minAge != null && age < minAge) {
    return false;
  }

  if (maxAge != null && age > maxAge) {
    return false;
  }

  return true;
}

function getApplicableContributionRule(
  rules: RetirementContributionRule[],
  age: number,
): RetirementContributionRule | null {
  return (
    rules.find((rule) => matchesAgeRule(age, rule)) ??
    rules.find((rule) => rule.minAge == null && rule.maxAge == null) ??
    null
  );
}

function getPayoutStartAge(
  account: RetirementAccountConfig,
  system: RetirementSystemConfig,
): number | null {
  return normalizeAge(
    account.withdrawal?.payoutStartAge ??
      account.withdrawal?.minimumAge ??
      system.payoutStartAge,
  );
}

function isAccessibleBalance(
  classification: RetirementAccountClassification,
  currentAge: number | null,
  minimumWithdrawalAge: number | null,
): boolean {
  if (classification === "liquid" || classification === "semi-liquid") {
    return true;
  }

  if (classification === "restricted") {
    return false;
  }

  if (minimumWithdrawalAge == null) {
    return false;
  }

  return currentAge != null && currentAge >= minimumWithdrawalAge;
}

function createBreakdown(
  liquidBalance: number,
  accounts: RetirementAccountConfig[],
  balances: Record<string, number>,
  age: number | null,
): FireLiquidityBreakdown {
  const breakdown: FireLiquidityBreakdown = {
    liquid: clampNumber(liquidBalance),
    semiLiquid: 0,
    locked: 0,
    restricted: 0,
    residualLiquid: clampNumber(liquidBalance),
    accessibleNow: clampNumber(liquidBalance),
    total: clampNumber(liquidBalance),
  };

  accounts.forEach((account) => {
    const balance = clampNumber(balances[account.id] ?? 0);
    breakdown.total += balance;

    if (account.classification === "liquid") {
      breakdown.liquid += balance;
    }

    if (account.classification === "semi-liquid") {
      breakdown.semiLiquid += balance;
    }

    if (account.classification === "locked") {
      breakdown.locked += balance;
    }

    if (account.classification === "restricted") {
      breakdown.restricted += balance;
    }

    if (
      isAccessibleBalance(
        account.classification,
        age,
        normalizeAge(account.withdrawal?.minimumAge),
      )
    ) {
      breakdown.accessibleNow += balance;
    }
  });

  return breakdown;
}

function estimateMonthlyIncomeFromBalance(
  account: RetirementAccountConfig,
  balance: number,
  payoutAge: number | null,
  fallbackAnnualWithdrawalRate: number,
  system: RetirementSystemConfig,
): number {
  if (account.classification === "restricted") {
    return 0;
  }

  const minimumWithdrawalAge = normalizeAge(account.withdrawal?.minimumAge);
  if (
    payoutAge != null &&
    minimumWithdrawalAge != null &&
    payoutAge < minimumWithdrawalAge
  ) {
    return 0;
  }

  const payoutMode = normalizePayoutMode(
    account.withdrawal?.payoutMode ?? system.defaultPayoutMode,
  );
  if (payoutMode === "none") {
    return 0;
  }

  if (payoutMode === "annuity") {
    const annuityRate = clampNumber(
      account.withdrawal?.annuityConversionRate ?? 0,
    );
    return (balance * annuityRate) / 100 / 12;
  }

  const drawdownRate = clampNumber(
    account.withdrawal?.annualDrawdownRate ?? fallbackAnnualWithdrawalRate,
  );
  return (balance * drawdownRate) / 100 / 12;
}

function createProjectionPoint(
  month: number,
  age: number | null,
  liquidBalance: number,
  system: RetirementSystemConfig,
  balances: Record<string, number>,
  fallbackAnnualWithdrawalRate: number,
): RetirementProjectionPoint {
  const breakdown = createBreakdown(
    liquidBalance,
    system.accounts,
    balances,
    age,
  );
  const accountBalances = system.accounts.reduce<Record<string, number>>(
    (result, account) => {
      result[account.id] = clampNumber(balances[account.id] ?? 0);
      return result;
    },
    {},
  );
  const estimatedMonthlyIncome = system.accounts.reduce((sum, account) => {
    return (
      sum +
      estimateMonthlyIncomeFromBalance(
        account,
        accountBalances[account.id] ?? 0,
        age,
        fallbackAnnualWithdrawalRate,
        system,
      )
    );
  }, 0);

  return {
    month,
    yearOffset: month / 12,
    age,
    totalBalance: breakdown.total,
    accessibleBalance: breakdown.accessibleNow,
    liquidBalance: breakdown.liquid,
    estimatedMonthlyIncome,
    breakdown,
    accountBalances,
  };
}

function buildProjectionMembers(
  system: RetirementSystemConfig,
  options: RetirementProjectionOptions,
): ProjectionMemberState[] {
  const memberMap = getMemberMap(system);
  const memberStates = new Map<string, ProjectionMemberState>();

  (system.members ?? []).forEach((member) => {
    memberStates.set(member.id, {
      id: member.id,
      name: member.name,
      monthlyIncome: clampNumber(member.monthlyIncome ?? 0),
      currentAge: getAgeFromDateOfBirth(member.dateOfBirth),
    });
  });

  system.accounts.forEach((account) => {
    const memberId = account.memberId?.trim();
    if (!memberId || memberStates.has(memberId)) {
      return;
    }

    memberStates.set(memberId, {
      id: memberId,
      name: resolveMemberName(memberMap, memberId) ?? "Member",
      monthlyIncome: clampNumber(memberMap.get(memberId)?.monthlyIncome ?? 0),
      currentAge: getAgeFromDateOfBirth(memberMap.get(memberId)?.dateOfBirth),
    });
  });

  if (memberStates.size > 0) {
    return Array.from(memberStates.values());
  }

  return [
    {
      id: "household",
      name: "Household",
      monthlyIncome: clampNumber(options.monthlyIncome),
      currentAge: options.currentAge,
    },
  ];
}

function alignStartingBalancesToNetWorth(
  balances: Record<string, number>,
  currentNetWorth: number,
): StartingBalanceAlignment {
  const normalizedNetWorth = clampNumber(currentNetWorth);
  const normalizedBalances = Object.entries(balances).reduce<
    Record<string, number>
  >((result, [accountId, balance]) => {
    result[accountId] = clampNumber(balance);
    return result;
  }, {});
  const trackedRetirementBalance = Object.values(normalizedBalances).reduce(
    (sum, balance) => sum + balance,
    0,
  );

  if (
    trackedRetirementBalance <= 0 ||
    trackedRetirementBalance <= normalizedNetWorth
  ) {
    return {
      balances: normalizedBalances,
      trackedRetirementBalance,
    };
  }

  const scale = normalizedNetWorth / trackedRetirementBalance;

  return {
    balances: Object.entries(normalizedBalances).reduce<Record<string, number>>(
      (result, [accountId, balance]) => {
        result[accountId] = balance * scale;
        return result;
      },
      {},
    ),
    trackedRetirementBalance: normalizedNetWorth,
  };
}

function shouldApplyContributionAtAge(
  age: number | null,
  contributionStopAge: number | null,
): boolean {
  if (contributionStopAge == null || age == null) {
    return true;
  }

  return age < contributionStopAge;
}

function applyDirectAllocations(
  memberId: string,
  accounts: RetirementAccountConfig[],
  directAllocations: Record<string, number>,
  totalContribution: number,
  balances: Record<string, number>,
): void {
  accounts.forEach((account) => {
    const allocation = directAllocations[account.id] ?? 0;
    if (allocation <= 0) {
      return;
    }

    const ownerId = account.memberId ?? "household";
    if (ownerId !== memberId) {
      return;
    }

    balances[account.id] += totalContribution * allocation;
  });
}

function applyGroupAllocations(
  memberId: string,
  accounts: RetirementAccountConfig[],
  groupAllocations: Record<string, number>,
  totalContribution: number,
  balances: Record<string, number>,
): void {
  Object.entries(groupAllocations).forEach(([group, allocation]) => {
    if (allocation <= 0) {
      return;
    }

    const matchingAccounts = accounts.filter(
      (account) =>
        (account.memberId ?? "household") === memberId &&
        account.contributionGroup === group,
    );

    if (matchingAccounts.length === 0) {
      return;
    }

    const contributionPerAccount =
      (totalContribution * allocation) / matchingAccounts.length;
    matchingAccounts.forEach((account) => {
      balances[account.id] += contributionPerAccount;
    });
  });
}

function buildAccountProjections(
  system: RetirementSystemConfig,
  currentBalances: Record<string, number>,
  projectedBalances: Record<string, number>,
  payoutBalances: Record<string, number> | null,
  payoutAge: number | null,
  fallbackAnnualWithdrawalRate: number,
): RetirementAccountProjection[] {
  const memberMap = getMemberMap(system);
  return system.accounts.map((account) => {
    const payoutBalance = payoutBalances?.[account.id] ?? null;
    const memberId = account.memberId ?? null;

    return {
      id: account.id,
      name: account.name,
      classification: account.classification,
      currentBalance: clampNumber(
        currentBalances[account.id] ?? account.balance,
      ),
      projectedBalance: clampNumber(
        projectedBalances[account.id] ?? account.balance,
      ),
      projectedBalanceAtPayout:
        payoutBalance == null ? null : clampNumber(payoutBalance),
      annualReturnRate: account.annualReturnRate,
      minimumWithdrawalAge: normalizeAge(account.withdrawal?.minimumAge),
      payoutMode: normalizePayoutMode(
        account.withdrawal?.payoutMode ?? system.defaultPayoutMode,
      ),
      estimatedMonthlyIncome:
        payoutBalance == null
          ? 0
          : estimateMonthlyIncomeFromBalance(
              account,
              payoutBalance,
              payoutAge,
              fallbackAnnualWithdrawalRate,
              system,
            ),
      memberId,
      memberName: resolveMemberName(memberMap, memberId),
    };
  });
}

function buildMemberProjections(
  members: ProjectionMemberState[],
  accountProjections: RetirementAccountProjection[],
): RetirementMemberProjection[] {
  return members.map((member) => {
    const memberAccounts = accountProjections.filter(
      (account) => (account.memberId ?? "household") === member.id,
    );
    return {
      id: member.id,
      name: member.name,
      monthlyIncome: member.monthlyIncome,
      currentAge: member.currentAge,
      currentBalance: memberAccounts.reduce(
        (sum, account) => sum + account.currentBalance,
        0,
      ),
      projectedBalance: memberAccounts.reduce(
        (sum, account) => sum + account.projectedBalance,
        0,
      ),
      estimatedMonthlyIncome: memberAccounts.reduce(
        (sum, account) => sum + account.estimatedMonthlyIncome,
        0,
      ),
    };
  });
}

export function sanitizeRetirementSystemConfig(
  config: RetirementSystemConfig | null | undefined,
): RetirementSystemConfig | null {
  if (!config || typeof config !== "object") {
    return null;
  }

  const members = Array.isArray(config.members)
    ? config.members
        .map((member) => ({
          id: String(member.id ?? "").trim(),
          name: String(member.name ?? "").trim() || "Member",
          monthlyIncome: clampNumber(Number(member.monthlyIncome ?? 0)),
          dateOfBirth: isValidDate(member.dateOfBirth)
            ? member.dateOfBirth
            : null,
        }))
        .filter((member) => member.id.length > 0)
    : [];
  const accounts = Array.isArray(config.accounts)
    ? config.accounts
        .map((account) => ({
          id: String(account.id ?? "").trim(),
          name: String(account.name ?? "").trim() || "Unnamed account",
          balance: clampNumber(Number(account.balance ?? 0)),
          annualReturnRate: Number(account.annualReturnRate ?? 0),
          classification:
            account.classification === "liquid" ||
            account.classification === "semi-liquid" ||
            account.classification === "locked" ||
            account.classification === "restricted"
              ? account.classification
              : "locked",
          memberId:
            typeof account.memberId === "string" &&
            account.memberId.trim().length > 0
              ? account.memberId.trim()
              : null,
          contributionGroup:
            typeof account.contributionGroup === "string" &&
            account.contributionGroup.trim().length > 0
              ? account.contributionGroup.trim()
              : null,
          withdrawal: account.withdrawal
            ? {
                minimumAge: normalizeAge(account.withdrawal.minimumAge),
                payoutStartAge: normalizeAge(account.withdrawal.payoutStartAge),
                payoutMode: normalizePayoutMode(account.withdrawal.payoutMode),
                annualDrawdownRate: normalizeAge(
                  account.withdrawal.annualDrawdownRate,
                ),
                annuityConversionRate: normalizeAge(
                  account.withdrawal.annuityConversionRate,
                ),
              }
            : undefined,
        }))
        .filter((account) => account.id.length > 0)
    : [];

  const validAccountIds = new Set(accounts.map((account) => account.id));
  const contributionRules = Array.isArray(config.contributionRules)
    ? config.contributionRules
        .map((rule) => ({
          minAge: normalizeAge(rule.minAge),
          maxAge: normalizeAge(rule.maxAge),
          employeeRate: clampNumber(Number(rule.employeeRate ?? 0)),
          employerRate: clampNumber(Number(rule.employerRate ?? 0)),
          monthlyIncomeCap: normalizeAge(rule.monthlyIncomeCap),
          annualContributionCap: normalizeAge(rule.annualContributionCap),
          accountAllocations: Object.fromEntries(
            Object.entries(
              normalizeAllocationRecord(rule.accountAllocations),
            ).filter(([accountId]) => validAccountIds.has(accountId)),
          ),
          accountAllocationGroups: normalizeAllocationRecord(
            rule.accountAllocationGroups,
          ),
        }))
        .filter(
          (rule) =>
            Object.keys(rule.accountAllocations).length > 0 ||
            Object.keys(rule.accountAllocationGroups).length > 0,
        )
    : [];

  const balanceHistory = Array.isArray(config.balanceHistory)
    ? config.balanceHistory
        .map((snapshot) => ({
          year: Math.round(Number(snapshot.year ?? 0)),
          monthIndex: Math.round(Number(snapshot.monthIndex ?? -1)),
          accountId: String(snapshot.accountId ?? "").trim(),
          balance: clampNumber(Number(snapshot.balance ?? 0)),
        }))
        .filter(
          (snapshot) =>
            snapshot.accountId.length > 0 &&
            validAccountIds.has(snapshot.accountId) &&
            snapshot.monthIndex >= 0 &&
            snapshot.monthIndex <= 11 &&
            Number.isFinite(snapshot.year),
        )
    : [];

  if (accounts.length === 0) {
    return null;
  }

  return {
    name:
      String(config.name ?? "Retirement System").trim() || "Retirement System",
    description:
      typeof config.description === "string" &&
      config.description.trim().length > 0
        ? config.description.trim()
        : undefined,
    payoutStartAge: normalizeAge(config.payoutStartAge),
    defaultPayoutMode: normalizePayoutMode(config.defaultPayoutMode),
    projectionYears: Math.max(
      1,
      Math.min(
        MAX_PROJECTION_MONTHS / 12,
        Number(config.projectionYears ?? DEFAULT_PROJECTION_YEARS),
      ),
    ),
    members,
    balanceHistory,
    accounts,
    contributionRules,
  };
}

export function getLatestRetirementBalancePeriod(
  system: RetirementSystemConfig | null | undefined,
): RetirementBalancePeriod | null {
  const balanceHistory =
    sanitizeRetirementSystemConfig(system)?.balanceHistory ?? [];
  if (balanceHistory.length === 0) {
    return null;
  }

  return balanceHistory.reduce<RetirementBalancePeriod | null>(
    (latest, snapshot) => {
      if (!latest || comparePeriods(snapshot, latest) > 0) {
        return { year: snapshot.year, monthIndex: snapshot.monthIndex };
      }

      return latest;
    },
    null,
  );
}

export function getRetirementBalanceMapForPeriod(
  system: RetirementSystemConfig | null | undefined,
  period?: RetirementBalancePeriod | null,
): Record<string, number> {
  const sanitized = sanitizeRetirementSystemConfig(system);
  if (!sanitized) {
    return {};
  }

  const targetPeriod = period ?? getLatestRetirementBalancePeriod(sanitized);
  const balances = sanitized.accounts.reduce<Record<string, number>>(
    (result, account) => {
      result[account.id] = account.balance;
      return result;
    },
    {},
  );

  if (!targetPeriod) {
    return balances;
  }

  sanitized.balanceHistory?.forEach((snapshot) => {
    if (
      snapshot.year === targetPeriod.year &&
      snapshot.monthIndex === targetPeriod.monthIndex
    ) {
      balances[snapshot.accountId] = snapshot.balance;
    }
  });

  return balances;
}

export function upsertRetirementBalanceSnapshot(
  system: RetirementSystemConfig,
  snapshot: RetirementBalanceSnapshot,
): RetirementSystemConfig {
  const sanitized = sanitizeRetirementSystemConfig(system);
  if (!sanitized) {
    return system;
  }

  const nextHistory = (sanitized.balanceHistory ?? []).filter(
    (entry) =>
      !(
        entry.year === snapshot.year &&
        entry.monthIndex === snapshot.monthIndex &&
        entry.accountId === snapshot.accountId
      ),
  );

  nextHistory.push({
    year: snapshot.year,
    monthIndex: snapshot.monthIndex,
    accountId: snapshot.accountId,
    balance: clampNumber(snapshot.balance),
  });

  return sanitizeRetirementSystemConfig({
    ...sanitized,
    balanceHistory: nextHistory,
  }) as RetirementSystemConfig;
}

export function updateRetirementMember(
  system: RetirementSystemConfig,
  memberId: string,
  updates: Partial<RetirementMemberConfig>,
): RetirementSystemConfig {
  const sanitized = sanitizeRetirementSystemConfig(system);
  if (!sanitized) {
    return system;
  }

  return sanitizeRetirementSystemConfig({
    ...sanitized,
    members: (sanitized.members ?? []).map((member) =>
      member.id === memberId ? { ...member, ...updates } : member,
    ),
  }) as RetirementSystemConfig;
}

export function createCpfMemberAccounts(
  memberId: string,
  memberName: string,
): RetirementAccountConfig[] {
  return [
    {
      id: `${memberId}-oa`,
      name: `${memberName} OA`,
      balance: 0,
      annualReturnRate: 2.5,
      classification: "semi-liquid",
      memberId,
      contributionGroup: "oa",
      withdrawal: {
        minimumAge: 55,
        payoutMode: "drawdown",
        annualDrawdownRate: 4,
      },
    },
    {
      id: `${memberId}-sa`,
      name: `${memberName} SA`,
      balance: 0,
      annualReturnRate: 4,
      classification: "locked",
      memberId,
      contributionGroup: "sa",
      withdrawal: {
        minimumAge: 55,
        payoutMode: "annuity",
        annuityConversionRate: 6,
      },
    },
    {
      id: `${memberId}-ma`,
      name: `${memberName} MA`,
      balance: 0,
      annualReturnRate: 4,
      classification: "restricted",
      memberId,
      contributionGroup: "ma",
      withdrawal: {
        minimumAge: 65,
        payoutMode: "none",
      },
    },
  ];
}

export function addCpfMemberToRetirementSystem(
  system: RetirementSystemConfig,
  member: RetirementMemberConfig,
): RetirementSystemConfig {
  const sanitized = sanitizeRetirementSystemConfig(system);
  if (!sanitized) {
    return system;
  }

  const members = [...(sanitized.members ?? [])];
  if (!members.some((existingMember) => existingMember.id === member.id)) {
    members.push({
      id: member.id,
      name: member.name,
      monthlyIncome: clampNumber(member.monthlyIncome ?? 0),
      dateOfBirth: isValidDate(member.dateOfBirth) ? member.dateOfBirth : null,
    });
  }

  const existingAccountIds = new Set(
    sanitized.accounts.map((account) => account.id),
  );
  const accounts = [...sanitized.accounts];
  createCpfMemberAccounts(member.id, member.name).forEach((account) => {
    if (!existingAccountIds.has(account.id)) {
      accounts.push(account);
    }
  });

  return sanitizeRetirementSystemConfig({
    ...sanitized,
    members,
    accounts,
  }) as RetirementSystemConfig;
}

export function isCpfRetirementSystem(
  system: RetirementSystemConfig | null | undefined,
): boolean {
  const sanitized = sanitizeRetirementSystemConfig(system);
  if (!sanitized) {
    return false;
  }

  const groupSet = new Set(
    sanitized.accounts
      .map((account) => account.contributionGroup)
      .filter((group): group is string => Boolean(group)),
  );

  return CPF_ACCOUNT_GROUPS.every((group) => groupSet.has(group));
}

export function calculateRetirementProjection(
  options: RetirementProjectionOptions,
): RetirementProjectionResult {
  const system = sanitizeRetirementSystemConfig(options.system);
  if (!system) {
    return {
      breakdown: {
        liquid: clampNumber(options.currentNetWorth),
        semiLiquid: 0,
        locked: 0,
        restricted: 0,
        residualLiquid: clampNumber(options.currentNetWorth),
        accessibleNow: clampNumber(options.currentNetWorth),
        total: clampNumber(options.currentNetWorth),
      },
      payoutStartAge: null,
      projection: [],
      monthsToFire:
        options.fireNumber != null &&
        options.currentNetWorth >= options.fireNumber
          ? 0
          : null,
      estimatedMonthlyRetirementIncome: 0,
      trackedRetirementBalance: 0,
      accountProjections: [],
      memberProjections: [],
      balancePeriod: null,
    };
  }

  const projectionMonths = Math.min(
    clampNumber(
      options.projectionMonths ??
        (system.projectionYears ?? DEFAULT_PROJECTION_YEARS) * 12,
      0,
    ),
    MAX_PROJECTION_MONTHS,
  );
  const snapshotFrequencyMonths = Math.max(
    1,
    Math.round(
      options.snapshotFrequencyMonths ?? DEFAULT_SNAPSHOT_FREQUENCY_MONTHS,
    ),
  );
  const balancePeriod = getLatestRetirementBalancePeriod(system);
  const rawStartingBalances = getRetirementBalanceMapForPeriod(
    system,
    balancePeriod,
  );
  const { balances: startingBalances, trackedRetirementBalance } =
    alignStartingBalancesToNetWorth(
      rawStartingBalances,
      options.currentNetWorth,
    );
  const accountBalances = { ...startingBalances };
  let liquidBalance = Math.max(
    clampNumber(options.currentNetWorth) - trackedRetirementBalance,
    0,
  );
  const contributionStopAge = normalizeAge(options.contributionStopAge);
  let monthsToFire: number | null =
    options.fireNumber != null &&
    clampNumber(options.currentNetWorth) >= options.fireNumber
      ? 0
      : null;
  const payoutStartAge =
    system.payoutStartAge ??
    system.accounts.reduce<number | null>((minimumAge, account) => {
      const accountPayoutAge = getPayoutStartAge(account, system);
      if (accountPayoutAge == null) {
        return minimumAge;
      }

      return minimumAge == null
        ? accountPayoutAge
        : Math.min(minimumAge, accountPayoutAge);
    }, null);
  let payoutSnapshot: RetirementProjectionPoint | null = null;
  const members = buildProjectionMembers(system, options);
  const yearToDateContribution = new Map<string, number>();

  const initialPoint = createProjectionPoint(
    0,
    options.currentAge,
    liquidBalance,
    system,
    accountBalances,
    options.fallbackAnnualWithdrawalRate,
  );
  const projection: RetirementProjectionPoint[] = [initialPoint];

  if (
    monthsToFire == null &&
    options.fireNumber != null &&
    initialPoint.accessibleBalance >= options.fireNumber
  ) {
    monthsToFire = 0;
  }

  for (let month = 1; month <= projectionMonths; month += 1) {
    const contributionAge =
      options.currentAge == null ? null : options.currentAge + (month - 1) / 12;
    liquidBalance =
      liquidBalance * (1 + toMonthlyReturnRate(options.liquidAnnualReturn)) +
      (shouldApplyContributionAtAge(contributionAge, contributionStopAge)
        ? clampNumber(options.liquidMonthlyContribution)
        : 0);

    system.accounts.forEach((account) => {
      accountBalances[account.id] =
        accountBalances[account.id] *
        (1 + toMonthlyReturnRate(account.annualReturnRate));
    });

    members.forEach((member) => {
      const memberAge =
        member.currentAge == null ? null : member.currentAge + (month - 1) / 12;
      if (!shouldApplyContributionAtAge(memberAge, contributionStopAge)) {
        return;
      }

      const rule = getApplicableContributionRule(
        system.contributionRules,
        memberAge == null ? 0 : Math.floor(memberAge),
      );
      if (!rule) {
        return;
      }

      const incomeCap = clampNumber(
        rule.monthlyIncomeCap ?? member.monthlyIncome,
      );
      const contributableIncome = Math.min(member.monthlyIncome, incomeCap);
      const monthlyContributionRate =
        clampNumber(rule.employeeRate) + clampNumber(rule.employerRate ?? 0);
      let totalContribution =
        (contributableIncome * monthlyContributionRate) / 100;

      if (rule.annualContributionCap != null) {
        const used = yearToDateContribution.get(member.id) ?? 0;
        totalContribution = Math.min(
          totalContribution,
          Math.max(rule.annualContributionCap - used, 0),
        );
        yearToDateContribution.set(member.id, used + totalContribution);
      }

      applyDirectAllocations(
        member.id,
        system.accounts,
        rule.accountAllocations ?? {},
        totalContribution,
        accountBalances,
      );
      applyGroupAllocations(
        member.id,
        system.accounts,
        rule.accountAllocationGroups ?? {},
        totalContribution,
        accountBalances,
      );
    });

    if (month % 12 === 0) {
      yearToDateContribution.clear();
    }

    const snapshotAge =
      options.currentAge == null ? null : options.currentAge + month / 12;
    const point = createProjectionPoint(
      month,
      snapshotAge,
      liquidBalance,
      system,
      accountBalances,
      options.fallbackAnnualWithdrawalRate,
    );

    if (
      payoutSnapshot == null &&
      payoutStartAge != null &&
      snapshotAge != null &&
      snapshotAge >= payoutStartAge
    ) {
      payoutSnapshot = point;
    }

    if (
      monthsToFire == null &&
      options.fireNumber != null &&
      point.accessibleBalance >= options.fireNumber
    ) {
      monthsToFire = month;
    }

    if (month === projectionMonths || month % snapshotFrequencyMonths === 0) {
      projection.push(point);
    }
  }

  const finalPoint = projection[projection.length - 1];
  const payoutPoint = payoutSnapshot ?? finalPoint;
  const accountProjections = buildAccountProjections(
    system,
    startingBalances,
    finalPoint.accountBalances,
    payoutPoint.accountBalances,
    payoutPoint.age,
    options.fallbackAnnualWithdrawalRate,
  );
  const memberProjections = buildMemberProjections(members, accountProjections);

  return {
    breakdown: initialPoint.breakdown,
    payoutStartAge,
    projection,
    monthsToFire,
    estimatedMonthlyRetirementIncome: accountProjections.reduce(
      (sum, account) => sum + account.estimatedMonthlyIncome,
      0,
    ),
    trackedRetirementBalance,
    accountProjections,
    memberProjections,
    balancePeriod,
  };
}

export const CPF_EXAMPLE_RETIREMENT_SYSTEM: RetirementSystemConfig = {
  name: "Singapore CPF (approx.)",
  description:
    "Illustrative CPF-style system with per-member OA, SA, and MA accounts plus age-based contribution splits.",
  payoutStartAge: 65,
  defaultPayoutMode: "drawdown",
  projectionYears: 40,
  members: [
    {
      id: "alex",
      name: "Alex",
      monthlyIncome: 6200,
      dateOfBirth: "1990-01-01",
    },
  ],
  balanceHistory: [
    { year: 2026, monthIndex: 1, accountId: "alex-oa", balance: 120000 },
    { year: 2026, monthIndex: 1, accountId: "alex-sa", balance: 90000 },
    { year: 2026, monthIndex: 1, accountId: "alex-ma", balance: 55000 },
  ],
  accounts: createCpfMemberAccounts("alex", "Alex"),
  contributionRules: [
    {
      maxAge: 35,
      employeeRate: 20,
      employerRate: 17,
      monthlyIncomeCap: 6800,
      accountAllocationGroups: {
        oa: 62.27,
        sa: 16.21,
        ma: 21.52,
      },
    },
    {
      minAge: 36,
      maxAge: 45,
      employeeRate: 20,
      employerRate: 17,
      monthlyIncomeCap: 6800,
      accountAllocationGroups: {
        oa: 56.76,
        sa: 18.91,
        ma: 24.33,
      },
    },
    {
      minAge: 46,
      maxAge: 50,
      employeeRate: 20,
      employerRate: 17,
      monthlyIncomeCap: 6800,
      accountAllocationGroups: {
        oa: 51.36,
        sa: 21.62,
        ma: 27.02,
      },
    },
    {
      minAge: 51,
      maxAge: 55,
      employeeRate: 20,
      employerRate: 17,
      monthlyIncomeCap: 6800,
      accountAllocationGroups: {
        oa: 40.54,
        sa: 31.08,
        ma: 28.38,
      },
    },
    {
      minAge: 56,
      maxAge: 60,
      employeeRate: 15,
      employerRate: 15.5,
      monthlyIncomeCap: 6800,
      accountAllocationGroups: {
        oa: 38.85,
        sa: 19.67,
        ma: 41.48,
      },
    },
    {
      minAge: 61,
      maxAge: 65,
      employeeRate: 12.5,
      employerRate: 12,
      monthlyIncomeCap: 6800,
      accountAllocationGroups: {
        oa: 15.55,
        sa: 15.55,
        ma: 68.9,
      },
    },
    {
      minAge: 66,
      employeeRate: 7.5,
      employerRate: 9,
      monthlyIncomeCap: 6800,
      accountAllocationGroups: {
        oa: 6.06,
        sa: 8.08,
        ma: 85.86,
      },
    },
  ],
};

export const SIMPLE_401K_EXAMPLE_RETIREMENT_SYSTEM: RetirementSystemConfig = {
  name: "Simple 401(k) + taxable example",
  description:
    "Illustrative config showing a locked employer plan paired with a liquid taxable sleeve.",
  payoutStartAge: 60,
  defaultPayoutMode: "drawdown",
  projectionYears: 35,
  members: [
    {
      id: "household",
      name: "Household",
      monthlyIncome: 8000,
      dateOfBirth: "1988-01-01",
    },
  ],
  accounts: [
    {
      id: "401k",
      name: "401(k)",
      balance: 180000,
      annualReturnRate: 7,
      classification: "locked",
      memberId: "household",
      withdrawal: {
        minimumAge: 59.5,
        payoutMode: "drawdown",
        annualDrawdownRate: 4,
      },
    },
    {
      id: "taxable",
      name: "Taxable brokerage",
      balance: 95000,
      annualReturnRate: 6,
      classification: "liquid",
      memberId: "household",
      withdrawal: {
        payoutMode: "drawdown",
        annualDrawdownRate: 4,
      },
    },
  ],
  contributionRules: [
    {
      employeeRate: 10,
      employerRate: 5,
      annualContributionCap: 34500,
      accountAllocations: {
        "401k": 100,
      },
    },
  ],
};
