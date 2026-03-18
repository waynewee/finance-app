export type FireSnapshotPreference = "current" | "previous";

const FIRE_SNAPSHOT_PREFERENCE_KEY_PREFIX =
  "finance_app_fire_snapshot_preference";

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

function buildFireSnapshotPreferenceKey(
  scope: string | null | undefined,
): string {
  return scope
    ? `${FIRE_SNAPSHOT_PREFERENCE_KEY_PREFIX}:${scope}`
    : FIRE_SNAPSHOT_PREFERENCE_KEY_PREFIX;
}
