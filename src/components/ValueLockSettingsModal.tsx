import { useState } from "react";
import { Lock, X } from "lucide-react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

interface Props {
  hasValueLockPassword: boolean;
  onSaveValueLockPassword: (password: string) => Promise<void>;
  onClearValueLockPassword: () => Promise<void>;
  onClose: () => void;
}

export default function ValueLockSettingsModal({
  hasValueLockPassword,
  onSaveValueLockPassword,
  onClearValueLockPassword,
  onClose,
}: Props) {
  useBodyScrollLock(true);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const handleSave = async () => {
    const normalizedPassword = password.trim();
    const normalizedConfirmation = confirmPassword.trim();

    if (normalizedPassword.length < 8) {
      setError("Value lock passwords must be at least 8 characters.");
      setNotice(null);
      return;
    }

    if (normalizedPassword !== normalizedConfirmation) {
      setError("Password confirmation does not match.");
      setNotice(null);
      return;
    }

    setBusyKey("save");

    try {
      await onSaveValueLockPassword(normalizedPassword);
      setPassword("");
      setConfirmPassword("");
      setNotice(
        hasValueLockPassword
          ? "Value lock password updated."
          : "Value lock password saved. Hidden values now require this password to unlock.",
      );
      setError(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save the value lock password.",
      );
      setNotice(null);
    } finally {
      setBusyKey(null);
    }
  };

  const handleClear = async () => {
    setBusyKey("clear");

    try {
      await onClearValueLockPassword();
      setPassword("");
      setConfirmPassword("");
      setNotice(
        "Value lock password removed. Set a new password before revealing values again.",
      );
      setError(null);
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "Failed to remove the value lock password.",
      );
      setNotice(null);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 px-4 py-4 backdrop-blur-sm sm:items-center">
      <div className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Value Lock</h2>
            <p className="mt-1 text-sm text-gray-500">
              {hasValueLockPassword
                ? "Update or remove the password that unlocks hidden balances."
                : "Set a password that unlocks hidden balances."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto overscroll-contain px-6 py-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              New password
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Confirm password
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleSave();
                }
              }}
              placeholder="Re-enter password"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
            />
          </label>

          {notice ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {notice}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            {hasValueLockPassword ? (
              <button
                onClick={() => void handleClear()}
                disabled={busyKey !== null}
                className="rounded-xl border border-red-200 px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyKey === "clear" ? "Removing..." : "Remove password"}
              </button>
            ) : (
              <span />
            )}

            <button
              onClick={() => void handleSave()}
              disabled={busyKey !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-[#2CA01C] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#248814] disabled:cursor-not-allowed disabled:bg-[#9FD792]"
            >
              <Lock size={16} />
              {busyKey === "save" ? "Saving..." : "Save password"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
