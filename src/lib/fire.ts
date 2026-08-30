import { DEFAULT_FIRE_SETTINGS, type FireSettings } from "./netWorthRepository";
import {
  calculateRetirementProjection,
  type RetirementBalancePeriod,
  type RetirementProjectionResult,
  type RetirementSystemConfig,
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
  inferredMonthlyContribution: number | null;
  recurringMonthlyContribution: number | null;
  currentMonthlyContribution: number | null;
  jobLossMonthlyContribution: number | null;
  jobLossMonthsToFire: number | null;
  jobLossYearsToFire: number | null;
  jobLossDelayMonths: number | null;
  jobLossExceedsProjectionHorizon: boolean;
  jobLossDelayIsLowerBound: boolean;
  observedMonthlyNetWorthChange: number | null;
  retirementProjection: RetirementProjectionResult | null;
}

const MAX_PROJECTION_MONTHS = 100 * 12;
const TRAILING_TWELVE_MONTH_COUNT = 12;

export function getFireCalculationLookbackMonths(): number {
  return TRAILING_TWELVE_MONTH_COUNT;
}

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

function getRecurringMonthlyContribution(
  inferredMonthlyContribution: number | null,
  ttmBonusAmount: number,
): number | null {
  if (inferredMonthlyContribution == null) {
    return null;
  }

  const recurringMonthlyContribution =
    inferredMonthlyContribution - ttmBonusAmount / TRAILING_TWELVE_MONTH_COUNT;

  return Number.isFinite(recurringMonthlyContribution)
    ? Math.max(recurringMonthlyContribution, 0)
    : null;
}

function getTtmOneOffMonthlyEquivalent(oneOffAmount: number): number {
  return oneOffAmount / TRAILING_TWELVE_MONTH_COUNT;
}

function getReducedMonthlyContribution(
  monthlyContribution: number | null,
  monthlySavingsReduction: number,
): number | null {
  if (monthlyContribution == null) {
    return null;
  }

  return Math.max(monthlyContribution - monthlySavingsReduction, 0);
}

function normalizeScenarioDurationMonths(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  const roundedMonths = Math.round(value);
  return roundedMonths > 0 ? roundedMonths : null;
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

function getMonthsBetweenPeriods(
  currentPeriod: RetirementBalancePeriod,
  previousPeriod: RetirementBalancePeriod,
): number {
  return (
    (currentPeriod.year - previousPeriod.year) * 12 +
    (currentPeriod.monthIndex - previousPeriod.monthIndex)
  );
}

function getMonthlyContributionFutureValueFactor(
  monthlyReturnRate: number,
  months: number,
): number {
  if (months <= 0) {
    return 0;
  }

  if (monthlyReturnRate === 0) {
    return months;
  }

  return (Math.pow(1 + monthlyReturnRate, months) - 1) / monthlyReturnRate;
}

function inferMonthlyContributionFromModeledDelta(
  modeledEndingBalance: number,
  actualEndingBalance: number,
  monthlyReturnRate: number,
  months: number,
): number | null {
  const contributionFactor = getMonthlyContributionFutureValueFactor(
    monthlyReturnRate,
    months,
  );

  if (!Number.isFinite(contributionFactor) || contributionFactor <= 0) {
    return null;
  }

  const inferred =
    (actualEndingBalance - modeledEndingBalance) / contributionFactor;
  return Number.isFinite(inferred) ? inferred : null;
}

function getProjectionReferencePeriod(
  snapshot?: FireProjectionSnapshot | null,
): RetirementBalancePeriod {
  if (snapshot) {
    return snapshot;
  }

  const now = new Date();
  return {
    year: now.getFullYear(),
    monthIndex: now.getMonth(),
  };
}

function getProjectionReferenceDate(
  snapshot?: FireProjectionSnapshot | null,
): Date {
  const period = getProjectionReferencePeriod(snapshot);
  return new Date(period.year, period.monthIndex + 1, 0);
}

function getProjectionMonthLimit(
  dateOfBirth: string | null,
  predictedDeathAge: number | null,
  referenceDate: Date,
): number {
  if (predictedDeathAge == null || !isValidDateOfBirth(dateOfBirth)) {
    return MAX_PROJECTION_MONTHS;
  }

  const birthDate = new Date(dateOfBirth);
  const targetDate = new Date(
    birthDate.getFullYear() + predictedDeathAge,
    birthDate.getMonth(),
    birthDate.getDate(),
  );

  if (targetDate <= referenceDate) {
    return 0;
  }

  let monthsUntilTarget =
    (targetDate.getFullYear() - referenceDate.getFullYear()) * 12 +
    (targetDate.getMonth() - referenceDate.getMonth());

  if (targetDate.getDate() < referenceDate.getDate()) {
    monthsUntilTarget -= 1;
  }

  return Math.max(0, Math.min(MAX_PROJECTION_MONTHS, monthsUntilTarget));
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
    preFireAnnualSpending: Math.max(0, settings.preFireAnnualSpending),
    withdrawalRate: Math.max(0.1, settings.withdrawalRate),
    expectedAnnualReturn: settings.expectedAnnualReturn,
    timeToFireAlgorithm: settings.timeToFireAlgorithm === "ttm" ? "ttm" : "ttm",
    annualBonusAmount: Math.max(0, settings.annualBonusAmount),
    nonRecurringBonusAmount: Math.max(0, settings.nonRecurringBonusAmount),
    jobLossMonthlySavingsReduction: Math.max(
      0,
      settings.jobLossMonthlySavingsReduction,
    ),
    jobLossMonthlySavingsReductionMonths: normalizeScenarioDurationMonths(
      settings.jobLossMonthlySavingsReductionMonths,
    ),
    annualBonusMonthAdded: settings.annualBonusMonthAdded ?? null,
    nonRecurringBonusMonthAdded: settings.nonRecurringBonusMonthAdded ?? null,
    dateOfBirth: isValidDateOfBirth(settings.dateOfBirth)
      ? settings.dateOfBirth
      : null,
    targetFireAge:
      settings.targetFireAge == null || settings.targetFireAge <= 0
        ? null
        : settings.targetFireAge,
    predictedDeathAge:
      settings.predictedDeathAge == null || settings.predictedDeathAge <= 0
        ? null
        : Math.round(settings.predictedDeathAge),
    retirementContributionStopAge:
      settings.retirementContributionStopAge == null ||
      settings.retirementContributionStopAge <= 0
        ? null
        : settings.retirementContributionStopAge,
    // Retirement system considerations have been removed from FIRE
    // calculations; FIRE math now only uses the net worth total.
    retirementSystem: null,
  };
}

export function getDefaultFireSettings(): FireSettings {
  return DEFAULT_FIRE_SETTINGS;
}

function calculateProjectedMonthsToFire(
  currentNetWorth: number,
  fireNumber: number,
  monthlyContribution: number,
  settings: FireSettings,
  currentAge: number | null,
  projectionMonthLimit: number,
  spendingStartAge: number | null = settings.targetFireAge,
): number | null {
  return calculateProjectedMonthsToFireForSchedule({
    currentNetWorth,
    fireNumber,
    initialMonthlyContribution: monthlyContribution,
    restoredMonthlyContribution: null,
    restoredContributionStartsAfterMonths: null,
    settings,
    currentAge,
    projectionMonthLimit,
    spendingStartAge,
    referencePeriod: null,
  });
}

function calculateProjectedMonthsToFireForSchedule({
  currentNetWorth,
  fireNumber,
  initialMonthlyContribution,
  restoredMonthlyContribution,
  restoredContributionStartsAfterMonths,
  settings,
  currentAge,
  projectionMonthLimit,
  spendingStartAge,
  referencePeriod,
}: {
  currentNetWorth: number;
  fireNumber: number;
  initialMonthlyContribution: number;
  restoredMonthlyContribution: number | null;
  restoredContributionStartsAfterMonths: number | null;
  settings: FireSettings;
  currentAge: number | null;
  projectionMonthLimit: number;
  spendingStartAge: number | null;
  referencePeriod: RetirementBalancePeriod | null;
}): number | null {
  const restoredAfterMonths = Math.min(
    normalizeScenarioDurationMonths(restoredContributionStartsAfterMonths) ??
      projectionMonthLimit,
    projectionMonthLimit,
  );

  if (settings.retirementSystem) {
    if (
      restoredMonthlyContribution == null ||
      restoredAfterMonths >= projectionMonthLimit
    ) {
      return calculateRetirementProjection({
        currentNetWorth,
        currentAge,
        contributionStopAge: settings.retirementContributionStopAge,
        spendingStartAge,
        liquidMonthlyContribution: initialMonthlyContribution,
        preFireMonthlyLiquidInflow:
          initialMonthlyContribution + settings.preFireAnnualSpending / 12,
        liquidAnnualReturn: settings.expectedAnnualReturn,
        fallbackAnnualWithdrawalRate: settings.withdrawalRate,
        preFireAnnualSpending: settings.preFireAnnualSpending,
        annualSpendingGoal: settings.annualSpendingGoal,
        fireNumber,
        projectionMonths: projectionMonthLimit,
        startingBalancePeriod: referencePeriod,
        system: settings.retirementSystem,
      }).monthsToFire;
    }

    return calculateRetirementMonthsToFireWithTemporaryContribution({
      currentNetWorth,
      fireNumber,
      reducedMonthlyContribution: initialMonthlyContribution,
      restoredMonthlyContribution,
      reducedContributionMonths: restoredAfterMonths,
      settings,
      currentAge,
      projectionMonthLimit,
      spendingStartAge,
      referencePeriod,
    });
  }

  if (currentNetWorth >= fireNumber) {
    return 0;
  }

  const monthlyReturnRate = toMonthlyReturnRate(settings.expectedAnnualReturn);
  let balance = currentNetWorth;

  for (let month = 1; month <= projectionMonthLimit; month += 1) {
    const contribution =
      restoredMonthlyContribution != null && month > restoredAfterMonths
        ? restoredMonthlyContribution
        : initialMonthlyContribution;
    balance = balance * (1 + monthlyReturnRate) + contribution;
    if (balance >= fireNumber) {
      return month;
    }
  }

  return null;
}

function createProjectionRestartSystem(
  system: RetirementSystemConfig,
  point: RetirementProjectionResult["projection"][number],
  referencePeriod: RetirementBalancePeriod,
): RetirementSystemConfig {
  return {
    ...system,
    balanceHistory: Object.entries(point.accountBalances).map(
      ([accountId, balance]) => ({
        year: referencePeriod.year,
        monthIndex: referencePeriod.monthIndex,
        accountId,
        balance,
      }),
    ),
  };
}

function shiftReferencePeriod(
  referencePeriod: RetirementBalancePeriod,
  months: number,
): RetirementBalancePeriod {
  const absoluteMonth =
    referencePeriod.year * 12 + referencePeriod.monthIndex + months;

  return {
    year: Math.floor(absoluteMonth / 12),
    monthIndex: absoluteMonth % 12,
  };
}

function calculateRetirementMonthsToFireWithTemporaryContribution({
  currentNetWorth,
  fireNumber,
  reducedMonthlyContribution,
  restoredMonthlyContribution,
  reducedContributionMonths,
  settings,
  currentAge,
  projectionMonthLimit,
  spendingStartAge,
  referencePeriod,
}: {
  currentNetWorth: number;
  fireNumber: number;
  reducedMonthlyContribution: number;
  restoredMonthlyContribution: number;
  reducedContributionMonths: number;
  settings: FireSettings;
  currentAge: number | null;
  projectionMonthLimit: number;
  spendingStartAge: number | null;
  referencePeriod: RetirementBalancePeriod | null;
}): number | null {
  const system = settings.retirementSystem;
  if (!system) {
    return null;
  }

  const temporaryMonths = Math.min(
    Math.max(reducedContributionMonths, 0),
    projectionMonthLimit,
  );
  const firstPhase = calculateRetirementProjection({
    currentNetWorth,
    currentAge,
    contributionStopAge: settings.retirementContributionStopAge,
    spendingStartAge,
    liquidMonthlyContribution: reducedMonthlyContribution,
    preFireMonthlyLiquidInflow:
      reducedMonthlyContribution + settings.preFireAnnualSpending / 12,
    liquidAnnualReturn: settings.expectedAnnualReturn,
    fallbackAnnualWithdrawalRate: settings.withdrawalRate,
    preFireAnnualSpending: settings.preFireAnnualSpending,
    annualSpendingGoal: settings.annualSpendingGoal,
    fireNumber,
    projectionMonths: temporaryMonths,
    startingBalancePeriod: referencePeriod,
    system,
  });

  if (firstPhase.monthsToFire != null) {
    return firstPhase.monthsToFire;
  }

  if (temporaryMonths >= projectionMonthLimit) {
    return null;
  }

  const restartPoint = firstPhase.projection[firstPhase.projection.length - 1];
  if (!restartPoint) {
    return null;
  }

  const nextReferencePeriod = shiftReferencePeriod(
    referencePeriod ?? getProjectionReferencePeriod(),
    temporaryMonths,
  );
  const resumedProjection = calculateRetirementProjection({
    currentNetWorth: restartPoint.totalBalance,
    currentAge: currentAge == null ? null : currentAge + temporaryMonths / 12,
    contributionStopAge: settings.retirementContributionStopAge,
    spendingStartAge,
    liquidMonthlyContribution: restoredMonthlyContribution,
    preFireMonthlyLiquidInflow:
      restoredMonthlyContribution + settings.preFireAnnualSpending / 12,
    liquidAnnualReturn: settings.expectedAnnualReturn,
    fallbackAnnualWithdrawalRate: settings.withdrawalRate,
    preFireAnnualSpending: settings.preFireAnnualSpending,
    annualSpendingGoal: settings.annualSpendingGoal,
    fireNumber,
    projectionMonths: projectionMonthLimit - temporaryMonths,
    startingBalancePeriod: nextReferencePeriod,
    system: createProjectionRestartSystem(
      system,
      restartPoint,
      nextReferencePeriod,
    ),
  });

  return resumedProjection.monthsToFire == null
    ? null
    : temporaryMonths + resumedProjection.monthsToFire;
}

export function calculateFireProjection(
  currentNetWorth: number,
  settings: FireSettings,
  snapshots?: {
    currentSnapshot?: FireProjectionSnapshot | null;
    previousSnapshots?: FireProjectionSnapshot[];
  },
): FireProjection {
  const normalizedSettings = sanitizeFireSettings(settings);
  const currentAge = getCurrentAgeFromDateOfBirth(
    normalizedSettings.dateOfBirth,
  );
  const firstPreviousSnapshot = snapshots?.previousSnapshots?.[0] ?? null;
  const observedMonthlyNetWorthChange =
    snapshots?.currentSnapshot && firstPreviousSnapshot
      ? snapshots.currentSnapshot.total - firstPreviousSnapshot.total
      : null;
  const fireNumber =
    normalizedSettings.withdrawalRate > 0
      ? normalizedSettings.annualSpendingGoal /
        (normalizedSettings.withdrawalRate / 100)
      : Number.POSITIVE_INFINITY;
  const projectionMonthLimit = getProjectionMonthLimit(
    normalizedSettings.dateOfBirth,
    normalizedSettings.predictedDeathAge,
    getProjectionReferenceDate(snapshots?.currentSnapshot),
  );
  const retirementSystem = normalizedSettings.retirementSystem;
  const inferredMonthlyContribution = inferMonthlyLiquidContribution(
    normalizedSettings,
    snapshots?.currentSnapshot ?? null,
    snapshots?.previousSnapshots ?? [],
  );
  const recurringMonthlyContribution = getRecurringMonthlyContribution(
    inferredMonthlyContribution,
    normalizedSettings.annualBonusAmount,
  );
  const currentMonthlyContribution = inferredMonthlyContribution;
  const hasJobLossScenario =
    normalizedSettings.jobLossMonthlySavingsReduction > 0 &&
    currentMonthlyContribution != null;
  const jobLossMonthlyContribution = hasJobLossScenario
    ? getReducedMonthlyContribution(
        currentMonthlyContribution,
        normalizedSettings.jobLossMonthlySavingsReduction,
      )
    : null;
  const jobLossReductionMonths = normalizeScenarioDurationMonths(
    normalizedSettings.jobLossMonthlySavingsReductionMonths,
  );
  const preFireMonthlySpending = normalizedSettings.preFireAnnualSpending / 12;
  const preFireMonthlyLiquidInflow =
    (currentMonthlyContribution ?? 0) + preFireMonthlySpending;
  const annualContribution = (currentMonthlyContribution ?? 0) * 12;
  const retirementProjection = retirementSystem
    ? calculateRetirementProjection({
        currentNetWorth,
        currentAge,
        contributionStopAge: normalizedSettings.retirementContributionStopAge,
        spendingStartAge: normalizedSettings.targetFireAge,
        liquidMonthlyContribution: currentMonthlyContribution ?? 0,
        preFireMonthlyLiquidInflow,
        liquidAnnualReturn: normalizedSettings.expectedAnnualReturn,
        fallbackAnnualWithdrawalRate: normalizedSettings.withdrawalRate,
        preFireAnnualSpending: normalizedSettings.preFireAnnualSpending,
        annualSpendingGoal: normalizedSettings.annualSpendingGoal,
        fireNumber,
        projectionMonths: projectionMonthLimit,
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
      projectionMonthLimit,
    );
  const targetYearsAway =
    currentAge != null &&
    normalizedSettings.targetFireAge != null &&
    normalizedSettings.targetFireAge > currentAge
      ? normalizedSettings.targetFireAge - currentAge
      : null;
  const estimatedMonthsToFireForDelay =
    currentMonthlyContribution == null
      ? null
      : calculateProjectedMonthsToFire(
          currentNetWorth,
          fireNumber,
          currentMonthlyContribution,
          normalizedSettings,
          currentAge,
          MAX_PROJECTION_MONTHS,
          null,
        );
  const jobLossMonthsToFire =
    jobLossMonthlyContribution == null
      ? null
      : calculateProjectedMonthsToFireForSchedule({
          currentNetWorth,
          fireNumber,
          initialMonthlyContribution: jobLossMonthlyContribution,
          restoredMonthlyContribution: currentMonthlyContribution,
          restoredContributionStartsAfterMonths: jobLossReductionMonths,
          settings: normalizedSettings,
          currentAge,
          projectionMonthLimit,
          spendingStartAge: null,
          referencePeriod: getProjectionReferencePeriod(
            snapshots?.currentSnapshot,
          ),
        });
  const estimatedJobLossMonthsToFireForDelay =
    jobLossMonthlyContribution == null
      ? null
      : calculateProjectedMonthsToFireForSchedule({
          currentNetWorth,
          fireNumber,
          initialMonthlyContribution: jobLossMonthlyContribution,
          restoredMonthlyContribution: currentMonthlyContribution,
          restoredContributionStartsAfterMonths: jobLossReductionMonths,
          settings: normalizedSettings,
          currentAge,
          projectionMonthLimit: MAX_PROJECTION_MONTHS,
          spendingStartAge: null,
          referencePeriod: getProjectionReferencePeriod(
            snapshots?.currentSnapshot,
          ),
        });
  const lowerBoundDelayMonths =
    jobLossMonthlyContribution != null &&
    jobLossMonthsToFire == null &&
    estimatedMonthsToFireForDelay != null
      ? Math.max(projectionMonthLimit - estimatedMonthsToFireForDelay, 0)
      : null;
  const jobLossDelayMonths =
    estimatedJobLossMonthsToFireForDelay == null
      ? lowerBoundDelayMonths
      : estimatedMonthsToFireForDelay == null
        ? null
        : Math.max(
            estimatedJobLossMonthsToFireForDelay -
              estimatedMonthsToFireForDelay,
            0,
          );
  const jobLossExceedsProjectionHorizon =
    jobLossMonthlyContribution != null && jobLossMonthsToFire == null;
  const jobLossDelayIsLowerBound =
    estimatedJobLossMonthsToFireForDelay == null &&
    lowerBoundDelayMonths != null;
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
          recurringMonthlyContribution ?? 0,
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
    inferredMonthlyContribution,
    recurringMonthlyContribution,
    currentMonthlyContribution,
    jobLossMonthlyContribution,
    jobLossMonthsToFire,
    jobLossYearsToFire:
      jobLossMonthsToFire == null ? null : jobLossMonthsToFire / 12,
    jobLossDelayMonths,
    jobLossExceedsProjectionHorizon,
    jobLossDelayIsLowerBound,
    observedMonthlyNetWorthChange,
    retirementProjection,
  };
}

function inferMonthlyLiquidContribution(
  settings: FireSettings,
  currentSnapshot: FireProjectionSnapshot | null,
  previousSnapshots: FireProjectionSnapshot[],
): number | null {
  if (!currentSnapshot || previousSnapshots.length === 0) {
    return null;
  }

  const normalizedSettings = sanitizeFireSettings(settings);
  const oldestPreviousSnapshot =
    previousSnapshots[previousSnapshots.length - 1] ?? null;
  const oneOffAmount = normalizedSettings.annualBonusAmount;
  const nonRecurringAmount = normalizedSettings.nonRecurringBonusAmount;
  const totalAdjustment = oneOffAmount + nonRecurringAmount;

  if (oldestPreviousSnapshot && totalAdjustment > 0) {
    const baseMonthlyContribution = inferMonthlyLiquidContributionForInterval(
      normalizedSettings,
      currentSnapshot,
      oldestPreviousSnapshot,
      Math.max(currentSnapshot.total - totalAdjustment, 0),
    );

    if (baseMonthlyContribution == null) {
      return null;
    }

    return (
      baseMonthlyContribution + getTtmOneOffMonthlyEquivalent(oneOffAmount)
    );
  }

  const intervalContributions: number[] = [];
  let intervalEndSnapshot = currentSnapshot;

  for (const previousSnapshot of previousSnapshots) {
    const intervalContribution = inferMonthlyLiquidContributionForInterval(
      settings,
      intervalEndSnapshot,
      previousSnapshot,
    );

    if (intervalContribution == null) {
      return null;
    }

    intervalContributions.push(intervalContribution);
    intervalEndSnapshot = previousSnapshot;
  }

  if (intervalContributions.length === 0) {
    return null;
  }

  const averageContribution =
    intervalContributions.reduce((sum, value) => sum + value, 0) /
    intervalContributions.length;
  return Number.isFinite(averageContribution) ? averageContribution : null;
}

function inferMonthlyLiquidContributionForInterval(
  settings: FireSettings,
  currentSnapshot: FireProjectionSnapshot,
  previousSnapshot: FireProjectionSnapshot,
  actualEndingBalance = currentSnapshot.total,
): number | null {
  const monthsBetween = getMonthsBetweenPeriods(
    currentSnapshot,
    previousSnapshot,
  );
  if (monthsBetween <= 0) {
    return null;
  }

  const normalizedSettings = sanitizeFireSettings(settings);
  const retirementSystem = normalizedSettings.retirementSystem;
  const monthlyReturnRate = toMonthlyReturnRate(
    normalizedSettings.expectedAnnualReturn,
  );

  if (!retirementSystem) {
    const baseline = projectBalance(
      previousSnapshot.total,
      0,
      monthlyReturnRate,
      monthsBetween,
    );
    return inferMonthlyContributionFromModeledDelta(
      baseline,
      actualEndingBalance,
      monthlyReturnRate,
      monthsBetween,
    );
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
    preFireMonthlyLiquidInflow: normalizedSettings.preFireAnnualSpending / 12,
    liquidAnnualReturn: normalizedSettings.expectedAnnualReturn,
    fallbackAnnualWithdrawalRate: normalizedSettings.withdrawalRate,
    preFireAnnualSpending: normalizedSettings.preFireAnnualSpending,
    projectionMonths: monthsBetween,
    snapshotFrequencyMonths: monthsBetween,
    startingBalancePeriod: previousSnapshot,
    system: retirementSystem,
  });
  const modeledTotal =
    baselineProjection.projection[baselineProjection.projection.length - 1]
      ?.totalBalance ?? previousSnapshot.total;
  return inferMonthlyContributionFromModeledDelta(
    modeledTotal,
    actualEndingBalance,
    monthlyReturnRate,
    monthsBetween,
  );
}

export function calculateMonthsToFire(
  currentNetWorth: number,
  fireNumber: number,
  monthlyContribution: number,
  expectedAnnualReturn: number,
  maxProjectionMonths = MAX_PROJECTION_MONTHS,
): number | null {
  if (currentNetWorth >= fireNumber) {
    return 0;
  }

  const monthlyReturnRate = toMonthlyReturnRate(expectedAnnualReturn);
  let balance = currentNetWorth;

  for (let month = 1; month <= maxProjectionMonths; month += 1) {
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
          spendingStartAge: normalizedSettings.targetFireAge,
          liquidMonthlyContribution: 0,
          preFireMonthlyLiquidInflow:
            normalizedSettings.preFireAnnualSpending / 12,
          liquidAnnualReturn: normalizedSettings.expectedAnnualReturn,
          fallbackAnnualWithdrawalRate: normalizedSettings.withdrawalRate,
          preFireAnnualSpending: normalizedSettings.preFireAnnualSpending,
          annualSpendingGoal: normalizedSettings.annualSpendingGoal,
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
        spendingStartAge: normalizedSettings.targetFireAge,
        liquidMonthlyContribution: monthlyContribution,
        preFireMonthlyLiquidInflow:
          monthlyContribution + normalizedSettings.preFireAnnualSpending / 12,
        liquidAnnualReturn: normalizedSettings.expectedAnnualReturn,
        fallbackAnnualWithdrawalRate: normalizedSettings.withdrawalRate,
        preFireAnnualSpending: normalizedSettings.preFireAnnualSpending,
        annualSpendingGoal: normalizedSettings.annualSpendingGoal,
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
