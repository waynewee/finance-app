import {
  calculateFireVelocity,
  type FireProjectionSnapshot,
} from "../src/lib/fire.ts";
import { DEFAULT_FIRE_SETTINGS } from "../src/lib/netWorthRepository.ts";

// Monthly net worth totals supplied by the user (Jan 2025 - Jul 2026).
const totals2025 = [
  322711, 333169, 334952, 366686, 369606, 384235, 491267, 502411, 504105,
  530437, 540218, 541660,
];
const totals2026 = [533770, 545563, 569448, 556505, 614658, 655014, 662324];

const snapshotsAsc: FireProjectionSnapshot[] = [
  ...totals2025.map((total, i) => ({ year: 2025, monthIndex: i, total })),
  ...totals2026.map((total, i) => ({ year: 2026, monthIndex: i, total })),
];

// calculateFireVelocity expects newest-first ordering.
const orderedSnapshotsDesc = [...snapshotsAsc].reverse();

console.log("Snapshots (newest first):");
orderedSnapshotsDesc.forEach((s, i) =>
  console.log(
    `  [${i}] ${s.year}-${String(s.monthIndex + 1).padStart(2, "0")} = ${s.total}`,
  ),
);

const anchorIndex = 0; // Jul 2026 = latest recorded month. Screenshot confirms
// "Current Progress" card uses Jul 2026's $662,324 as "net worth today",
// so the anchor is the latest snapshot, not the previous month.
const realSettings = {
  ...DEFAULT_FIRE_SETTINGS,
  annualSpendingGoal: 120_000, // FIRE Number $3,000,000 / 4% => confirmed by screenshot
  withdrawalRate: 4,
  expectedAnnualReturn: 4, // confirmed by user
};
const result = calculateFireVelocity(
  orderedSnapshotsDesc,
  anchorIndex,
  realSettings,
);

console.log("\nSettings used:", realSettings);

console.log("\nAll 12 window points (monthIndex 11=newest .. 0=oldest):");
result.points.forEach((p) =>
  console.log(`  monthIndex=${p.monthIndex}  monthsToFire=${p.monthsToFire}`),
);

console.log("\nValid point count:", result.validPointCount);
console.log("Slope:", result.slope);
console.log("Velocity (-slope):", result.velocity);
