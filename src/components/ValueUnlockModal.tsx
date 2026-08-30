import { useState } from "react";
import { Eye, X } from "lucide-react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

interface Props {
  onUnlock: (password: string) => Promise<void>;
  onClose: () => void;
}

export default function ValueUnlockModal({ onUnlock, onClose }: Props) {
  useBodyScrollLock(true);

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleUnlock = async () => {
    const normalizedPassword = password.trim();

    if (!normalizedPassword) {
      setError("Enter the value lock password.");
      return;
    }

    setBusy(true);

    try {
      await onUnlock(normalizedPassword);
      setError(null);
      onClose();
    } catch (unlockError) {
      setError(
        unlockError instanceof Error
          ? unlockError.message
          : "Failed to unlock values.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 px-4 py-4 backdrop-blur-sm sm:items-center">
      <div className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Unlock Values
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto overscroll-contain px-6 py-5">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Enter the value lock password to reveal balances, charts, and
            exports for this session.
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Value lock password
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleUnlock();
                }
              }}
              placeholder="Enter password"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
            />
          </label>

          {error ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleUnlock()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-[#2CA01C] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#248814] disabled:cursor-not-allowed disabled:bg-[#9FD792]"
            >
              <Eye size={16} />
              {busy ? "Unlocking..." : "Show Values"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
