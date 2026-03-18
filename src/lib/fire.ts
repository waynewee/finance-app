import { DEFAULT_FIRE_SETTINGS, type FireSettings } from "./netWorthRepository";
import {
  calculateRetirementProjection,
  sanitizeRetirementSystemConfig,
  type RetirementProjectionResult,
  type RetirementBalancePeriod,
} from "./retirementSystem";

export interface FireProjectionSnapshot extends RetirementBalancePeriod {
  total: number;
}

export interface FireProjection {
  annualContribution: number;
  fireNumber: number;
  fundedRatio: number;
  gapToGoal: number;
  monthsToFire: number | null;
  yearsToFire: number | null;
  targetYearsAway: number | null;
  requiredMonthlyContribution: number | null;
  accessibleNetWorth: number;
  grossNetWorth: number;
  currentMonthlyContribution: number | null;
  observedMonthlyNetWorthChange: number | null;
  retirementProjection: RetirementProjectionResult | null;
}

const MAX_PROJECTION_MONTHS = 100 * 12;

function toMonthlyReturnRate(expectedAnnualReturn: number): number {
  const normalizedAnnualReturn = expectedAnnualReturn / 100;
  if (normalizedAnnualReturn <= -1) {
    return -1;
  }

  return Math.pow(1 + normalizedAnnualReturn, 1 / 12) - 1;
}

function projectBalance(
  startingBalance: number,
  monthlyContribution: number,
  monthlyReturnRate: number,
  months: number,
): number {
  let balance = startingBalance;

  for (let month = 0; month < months; month += 1) {
    balance = balance * (1 + monthlyReturnRate) + monthlyContribution;
  }

  return balance;
}

function isValidDateOfBirth(value: string | null): value is string {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  return !Number.isNaN(timestamp);
}

function getReferenceDate(period: RetirementBalancePeriod): Date {
  return new Date(period.year, period.monthIndex + 1, 0);
}

export function getCurrentAgeFromDateOfBirth(
  dateOfBirth: string | null,
  now: Date = new Date(),
): number | null {
  if (!isValidDateOfBirth(dateOfBirth)) {
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

export function sanitizeFireSettings(settings: FireSettings): FireSettings {
  return {
    annualSpendingGoal: Math.max(0, settings.annualSpendingGoal),
    withdrawalRate: Math.max(0.1, settings.withdrawalRate),
    expectedAnnualReturn: settings.expectedAnnualReturn,
    dateOfBirth: isValidDateOfBirth(settings.dateOfBirth)
      ? settings.dateOfBirth
      : null,
    targetFireAge:
      settings.targetFireAge == null || settings.targetFireAge <= 0
        ? null
        : settings.targetFireAge,
    retirementContributionStopAge:
      settings.retirementContributionStopAge == null ||
      settings.retirementContributionStopAge <= 0
        ? null
        : settings.retirementContributionStopAge,
    retirementSystem: sanitizeRetirementSystemConfig(settings.retirementSystem),
  };
}

export function getDefaultFireSettings(): FireSettings {
  return DEFAULT_FIRE_SETTINGS;
}

export function calculateFireProjection(
  currentNetWorth: number,
  settings: FireSettings,
  snapshots?: {
    currentSnapshot?: FireProjectionSnapshot | null;
    previousSnapshot?: FireProjectionSnapshot | null;
  },
): FireProjection {
  const normalizedSettings = sanitizeFireSettings(settings);
  const currentAge = getCurrentAgeFromDateOfBirth(
    normalizedSettings.dateOfBirth,
  );
  const observedMonthlyNetWorthChange =
    snapshots?.currentSnapshot && snapshots.previousSnapshot
      ? snapshots.currentSnapshot.total - snapshots.previousSnapshot.total
      : null;
  const fireNumber =
    normalizedSettings.withdrawalRate > 0
      ? normalizedSettings.annualSpendingGoal /
        (normalizedSettings.withdrawalRate / 100)
      : Number.POSITIVE_INFINITY;
  const retirementSystem = normalizedSettings.retirementSystem;
  const currentMonthlyContribution = inferMonthlyLiquidContribution(
    normalizedSettings,
    snapshots?.currentSnapshot ?? null,
    snapshots?.previousSnapshot ?? null,
  );
  const annualContribution = (currentMonthlyContribution ?? 0) * 12;
  const retirementProjection = retirementSystem
    ? calculateRetirementProjection({
        currentNetWorth,
        currentAge,
        contributionStopAge: normalizedSettings.retirementContributionStopAge,
        liquidMonthlyContribution: currentMonthlyContribution ?? 0,
        liquidAnnualReturn: normalizedSettings.expectedAnnualReturn,
        fallbackAnnualWithdrawalRate: normalizedSettings.withdrawalRate,
        fireNumber,
        projectionMonths: MAX_PROJECTION_MONTHS,
        system: retirementSystem,
      })
    : null;
  const accessibleNetWorth =
    retirementProjection?.breakdown.accessibleNow ?? currentNetWorth;
  const grossNetWorth =
    retirementProjection?.breakdown.total ?? currentNetWorth;
  const gapToGoal = Math.max(fireNumber - accessibleNetWorth, 0);
  const fundedRatio = fireNumber > 0 ? accessibleNetWorth / fireNumber : 0;
  const monthsToFire =
    retirementProjection?.monthsToFire ??
    calculateMonthsToFire(
      currentNetWorth,
      fireNumber,
      currentMonthlyContribution ?? 0,
      normalizedSettings.expectedAnnualReturn,
    );
  const targetYearsAway =
    currentAge != null &&
    normalizedSettings.targetFireAge != null &&
    normalizedSettings.targetFireAge > currentAge
      ? normalizedSettings.targetFireAge - currentAge
      : null;
  const requiredMonthlyContribution =
    targetYearsAway == null
      ? null
      : calculateRequiredMonthlyContribution(
          currentNetWorth,
          fireNumber,
          normalizedSettings.expectedAnnualReturn,
          targetYearsAway,
          normalizedSettings,
          currentAge,
          currentMonthlyContribution ?? 0,
        );

  return {
    annualContribution,
    fireNumber,
    fundedRatio,
    gapToGoal,
    monthsToFire,
    yearsToFire: monthsToFire == null ? null : monthsToFire / 12,
    targetYearsAway,
    requiredMonthlyContribution,
    accessibleNetWorth,
    grossNetWorth,
    currentMonthlyContribution,
    observedMonthlyNetWorthChange,
    retirementProjection,
  };
}

function inferMonthlyLiquidContribution(
  settings: FireSettings,
  currentSnapshot: FireProjectionSnapshot | null,
  previousSnapshot: FireProjectionSnapshot | null,
): number | null {
  if (!currentSnapshot || !previousSnapshot) {
    return null;
  }

  const normalizedSettings = sanitizeFireSettings(settings);
  const retirementSystem = normalizedSettings.retirementSystem;

  if (!retirementSystem) {
    const monthlyReturnRate = toMonthlyReturnRate(
      normalizedSettings.expectedAnnualReturn,
    );
    const baseline = projectBalance(
      previousSnapshot.total,
      0,
      monthlyReturnRate,
      1,
    );
    const inferred = currentSnapshot.total - baseline;
    return Number.isFinite(inferred) ? inferred : null;
  }

  const previousAge = getCurrentAgeFromDateOfBirth(
    normalizedSettings.dateOfBirth,
    getReferenceDate(previousSnapshot),
  );
  const baselineProjection = calculateRetirementProjection({
    currentNetWorth: previousSnapshot.total,
    currentAge: previousAge,
    contributionStopAge: normalizedSettings.retirementContributionStopAge,
    liquidMonthlyContribution: 0,
    liquidAnnualReturn: normalizedSettings.expectedAnnualReturn,
    fallbackAnnualWithdrawalRate: normalizedSettings.withdrawalRate,
    projectionMonths: 1,
    snapshotFrequencyMonths: 1,
    startingBalancePeriod: previousSnapshot,
    system: retirementSystem,
  });
  const modeledTotal =
    baselineProjection.projection[baselineProjection.projection.length - 1]
      ?.totalBalance ?? previousSnapshot.total;
  const inferred = currentSnapshot.total - modeledTotal;
  return Number.isFinite(inferred) ? inferred : null;
}

export function calculateMonthsToFire(
  currentNetWorth: number,
  fireNumber: number,
  monthlyContribution: number,
  expectedAnnualReturn: number,
): number | null {
  if (currentNetWorth >= fireNumber) {
    return 0;
  }

  const monthlyReturnRate = toMonthlyReturnRate(expectedAnnualReturn);
  let balance = currentNetWorth;

  for (let month = 1; month <= MAX_PROJECTION_MONTHS; month += 1) {
    balance = balance * (1 + monthlyReturnRate) + monthlyContribution;
    if (balance >= fireNumber) {
      return month;
    }
  }

  return null;
}

export function calculateRequiredMonthlyContribution(
  currentNetWorth: number,
  fireNumber: number,
  expectedAnnualReturn: number,
  targetYearsAway: number,
  settings?: FireSettings,
  currentAge?: number | null,
  currentMonthlyContribution = 0,
): number | null {
  const normalizedSettings = settings ? sanitizeFireSettings(settings) : null;
  const retirementSystem = normalizedSettings?.retirementSystem ?? null;
  const currentAccessibleNetWorth =
    normalizedSettings && retirementSystem
      ? calculateRetirementProjection({
          currentNetWorth,
          currentAge: currentAge ?? null,
          contributionStopAge: normalizedSettings.retirementContributionStopAge,
          liquidMonthlyContribution: 0,
          liquidAnnualReturn: normalizedSettings.expectedAnnualReturn,
          fallbackAnnualWithdrawalRate: normalizedSettings.withdrawalRate,
          projectionMonths: 0,
          system: retirementSystem,
        }).breakdown.accessibleNow
      : currentNetWorth;

  if (currentAccessibleNetWorth >= fireNumber) {
    return 0;
  }

  if (targetYearsAway <= 0) {
    return null;
  }

  const months = Math.round(targetYearsAway * 12);

  if (normalizedSettings && retirementSystem) {
    const reachesTarget = (monthlyContribution: number): boolean => {
      const projection = calculateRetirementProjection({
        currentNetWorth,
        currentAge: currentAge ?? null,
        contributionStopAge: normalizedSettings.retirementContributionStopAge,
        liquidMonthlyContribution: monthlyContribution,
        liquidAnnualReturn: normalizedSettings.expectedAnnualReturn,
        fallbackAnnualWithdrawalRate: normalizedSettings.withdrawalRate,
        projectionMonths: months,
        fireNumber,
        system: retirementSystem,
      });
      const finalPoint =
        projection.projection[projection.projection.length - 1];
      return (finalPoint?.accessibleBalance ?? 0) >= fireNumber;
    };

    if (reachesTarget(0)) {
      return 0;
    }

    let low = 0;
    let high = Math.max(currentMonthlyContribution, 1_000);

    while (!reachesTarget(high)) {
      high *= 2;
      if (high > 1_000_000) {
        return null;
      }
    }

    for (let iteration = 0; iteration < 50; iteration += 1) {
      const middle = (low + high) / 2;
      if (reachesTarget(middle)) {
        high = middle;
      } else {
        low = middle;
      }
    }

    return Math.ceil(high);
  }

  const monthlyReturnRate = toMonthlyReturnRate(expectedAnnualReturn);

  if (
    projectBalance(currentNetWorth, 0, monthlyReturnRate, months) >= fireNumber
  ) {
    return 0;
  }

  let low = 0;
  let high = 1_000;

  while (
    projectBalance(currentNetWorth, high, monthlyReturnRate, months) <
    fireNumber
  ) {
    high *= 2;
    if (high > 1_000_000) {
      return null;
    }
  }

  for (let iteration = 0; iteration < 50; iteration += 1) {
    const middle = (low + high) / 2;
    const projectedBalance = projectBalance(
      currentNetWorth,
      middle,
      monthlyReturnRate,
      months,
    );

    if (projectedBalance >= fireNumber) {
      high = middle;
    } else {
      low = middle;
    }
  }

  return Math.ceil(high);
}
