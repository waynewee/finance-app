export type FireSavingsAveragePreference = 3 | 6;

const FIRE_SAVINGS_AVERAGE_PREFERENCE_KEY_PREFIX =
  "finance_app_fire_savings_average_preference";

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

function buildFireSavingsAveragePreferenceKey(
  scope: string | null | undefined,
): string {
  return scope
    ? `${FIRE_SAVINGS_AVERAGE_PREFERENCE_KEY_PREFIX}:${scope}`
    : FIRE_SAVINGS_AVERAGE_PREFERENCE_KEY_PREFIX;
}
