export type FireSnapshotPreference = "current" | "previous";
export type FireSavingsAveragePreference = 3 | 6;

const FIRE_SNAPSHOT_PREFERENCE_KEY_PREFIX =
  "finance_app_fire_snapshot_preference";
const FIRE_SAVINGS_AVERAGE_PREFERENCE_KEY_PREFIX =
  "finance_app_fire_savings_average_preference";
const SUMMARY_SNAPSHOT_PREFERENCE_KEY_PREFIX =
  "finance_app_summary_snapshot_preference";

export function getStoredFireSnapshotPreference(
  scope: string | null | undefined,
): FireSnapshotPreference {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return "current";
  }

  const storageKey = buildFireSnapshotPreferenceKey(scope);
  const value = window.localStorage.getItem(storageKey);
  return value === "previous" ? "previous" : "current";
}

export function setStoredFireSnapshotPreference(
  scope: string | null | undefined,
  preference: FireSnapshotPreference,
): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }

  window.localStorage.setItem(
    buildFireSnapshotPreferenceKey(scope),
    preference,
  );
}

export function getStoredFireSavingsAveragePreference(
  scope: string | null | undefined,
): FireSavingsAveragePreference {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return 3;
  }

  const storageKey = buildFireSavingsAveragePreferenceKey(scope);
  const value = window.localStorage.getItem(storageKey);
  return value === "6" ? 6 : 3;
}

export function setStoredFireSavingsAveragePreference(
  scope: string | null | undefined,
  preference: FireSavingsAveragePreference,
): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }

  window.localStorage.setItem(
    buildFireSavingsAveragePreferenceKey(scope),
    String(preference),
  );
}

export function getStoredSummarySnapshotPreference(
  scope: string | null | undefined,
): FireSnapshotPreference {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return "current";
  }

  const storageKey = buildSummarySnapshotPreferenceKey(scope);
  const value = window.localStorage.getItem(storageKey);
  return value === "previous" ? "previous" : "current";
}

export function setStoredSummarySnapshotPreference(
  scope: string | null | undefined,
  preference: FireSnapshotPreference,
): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }

  window.localStorage.setItem(
    buildSummarySnapshotPreferenceKey(scope),
    preference,
  );
}

function buildFireSnapshotPreferenceKey(
  scope: string | null | undefined,
): string {
  return scope
    ? `${FIRE_SNAPSHOT_PREFERENCE_KEY_PREFIX}:${scope}`
    : FIRE_SNAPSHOT_PREFERENCE_KEY_PREFIX;
}

function buildFireSavingsAveragePreferenceKey(
  scope: string | null | undefined,
): string {
  return scope
    ? `${FIRE_SAVINGS_AVERAGE_PREFERENCE_KEY_PREFIX}:${scope}`
    : FIRE_SAVINGS_AVERAGE_PREFERENCE_KEY_PREFIX;
}

function buildSummarySnapshotPreferenceKey(
  scope: string | null | undefined,
): string {
  return scope
    ? `${SUMMARY_SNAPSHOT_PREFERENCE_KEY_PREFIX}:${scope}`
    : SUMMARY_SNAPSHOT_PREFERENCE_KEY_PREFIX;
}
