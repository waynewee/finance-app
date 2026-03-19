import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface Props {
  currentUsername: string | null;
  onSave: (input: { username: string; password?: string }) => Promise<void>;
  onClose: () => void;
}

export default function AccountAccessModal({
  currentUsername,
  onSave,
  onClose,
}: Props) {
  const [draftUsername, setDraftUsername] = useState(currentUsername ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraftUsername(currentUsername ?? "");
  }, [currentUsername]);

  const isInitialSetup = !currentUsername;

  const handleSave = async () => {
    const normalizedUsername = draftUsername.trim().toLowerCase();

    if (!normalizedUsername) {
      setError("Enter a username.");
      return;
    }

    if (isInitialSetup && !password) {
      setError("Enter a password to finish setting up this account.");
      return;
    }

    if (password || confirmPassword) {
      if (password.length < 8) {
        setError("Passwords must be at least 8 characters.");
        return;
      }

      if (password !== confirmPassword) {
        setError("Password confirmation does not match.");
        return;
      }
    }

    setBusy(true);

    try {
      await onSave({
        username: normalizedUsername,
        password: password || undefined,
      });
      setError(null);
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to update your login details.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-xl rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Account Credentials
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Update the username and password for this account.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            <p className="font-medium text-gray-900">Username-only login</p>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              This updates your current account. It does not create a second
              user or move any financial data.
            </p>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              Sign-in, account recovery, and shared-account invitations now use
              usernames instead of email links.
            </p>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Username
            </span>
            <input
              type="text"
              value={draftUsername}
              onChange={(event) =>
                setDraftUsername(event.target.value.toLowerCase())
              }
              placeholder="your_username"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
            />
            <p className="mt-2 text-xs leading-5 text-gray-500">
              Use 3-32 lowercase letters, numbers, or underscores.
            </p>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              {isInitialSetup ? "Password" : "New password"}
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={
                isInitialSetup
                  ? "Create a password"
                  : "Leave blank to keep your current password"
              }
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
              placeholder={
                isInitialSetup
                  ? "Re-enter your password"
                  : "Only needed when changing your password"
              }
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
              onClick={() => void handleSave()}
              disabled={busy}
              className="rounded-xl bg-[#2CA01C] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#248814] disabled:cursor-not-allowed disabled:bg-[#9FD792]"
            >
              {busy
                ? "Saving..."
                : isInitialSetup
                  ? "Enable username login"
                  : "Save login details"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
