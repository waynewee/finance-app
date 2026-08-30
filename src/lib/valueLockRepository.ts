import { apiGet, apiPost } from "./apiClient";

export async function hasValueLockPassword(): Promise<boolean> {
  const response = await apiGet<{ hasPassword: boolean }>("/api/value-lock");
  return response.hasPassword;
}

export async function setValueLockPassword(password: string): Promise<void> {
  const normalizedPassword = password.trim();
  if (!normalizedPassword) {
    throw new Error("Enter a password.");
  }

  await apiPost("/api/value-lock?action=set", { password: normalizedPassword });
}

export async function clearValueLockPassword(): Promise<void> {
  await apiPost("/api/value-lock?action=clear");
}

export async function verifyValueLockPassword(
  password: string,
): Promise<boolean> {
  const normalizedPassword = password.trim();
  if (!normalizedPassword) {
    throw new Error("Enter the value lock password.");
  }

  const response = await apiPost<{ valid: boolean }>(
    "/api/value-lock?action=verify",
    { password: normalizedPassword },
  );
  return response.valid;
}
