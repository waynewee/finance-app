import { useEffect, useState } from "react";
import { Mail, PencilLine, UserRoundPlus, Users, X } from "lucide-react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import {
  type AccountCollaborator,
  type AccountInvitation,
} from "../lib/accountCollaborationRepository";

interface InviteResult {
  emailSent: boolean;
  emailError: string | null;
}

interface Props {
  accountName: string;
  isOwner: boolean;
  collaborators: AccountCollaborator[];
  invitations: AccountInvitation[];
  isLoading: boolean;
  onRenameAccount: (accountName: string) => Promise<void>;
  onInvite: (email: string) => Promise<InviteResult>;
  onRemoveCollaborator: (collaboratorUserId: string) => Promise<void>;
  onCancelInvitation: (invitationId: string) => Promise<void>;
  onClose: () => void;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ShareAccountModal({
  accountName,
  isOwner,
  collaborators,
  invitations,
  isLoading,
  onRenameAccount,
  onInvite,
  onRemoveCollaborator,
  onCancelInvitation,
  onClose,
}: Props) {
  useBodyScrollLock(true);

  const [draftAccountName, setDraftAccountName] = useState(accountName);
  const [inviteEmail, setInviteEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    setDraftAccountName(accountName);
  }, [accountName]);

  const handleRename = async () => {
    setBusyKey("rename");

    try {
      await onRenameAccount(draftAccountName);
      setNotice("Account name saved.");
      setError(null);
    } catch (renameError) {
      setError(
        renameError instanceof Error
          ? renameError.message
          : "Failed to rename account.",
      );
      setNotice(null);
    } finally {
      setBusyKey(null);
    }
  };

  const handleInvite = async () => {
    setBusyKey("invite");

    try {
      const result = await onInvite(inviteEmail);
      setInviteEmail("");
      setNotice(
        result.emailSent
          ? "Invitation saved and sign-in link emailed. The collaborator can open the link to join this shared account."
          : `Invitation saved, but the sign-in link email could not be sent${result.emailError ? `: ${result.emailError}` : "."} The collaborator can still sign in manually with that email.`,
      );
      setError(null);
    } catch (inviteError) {
      setError(
        inviteError instanceof Error
          ? inviteError.message
          : "Failed to invite collaborator.",
      );
      setNotice(null);
    } finally {
      setBusyKey(null);
    }
  };

  const handleRemoveCollaborator = async (collaboratorUserId: string) => {
    setBusyKey(`remove:${collaboratorUserId}`);

    try {
      await onRemoveCollaborator(collaboratorUserId);
      setNotice("Collaborator removed.");
      setError(null);
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Failed to remove collaborator.",
      );
      setNotice(null);
    } finally {
      setBusyKey(null);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    setBusyKey(`cancel:${invitationId}`);

    try {
      await onCancelInvitation(invitationId);
      setNotice("Invitation canceled.");
      setError(null);
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "Failed to cancel invitation.",
      );
      setNotice(null);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 px-4 py-4 backdrop-blur-sm sm:items-center">
      <div className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Shared Account
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Invite another person to view and edit the same net worth data.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto overscroll-contain px-6 py-5">
          <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-white p-3 text-[#1E7A18] shadow-sm">
                <Users size={18} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900">
                  Account Name
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {isOwner
                    ? "Use a shared label like Smith Household so collaborators know which data set they are editing."
                    : "You are viewing a shared account. Only the account owner can rename it or manage invites."}
                </p>

                {isOwner ? (
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <input
                      value={draftAccountName}
                      onChange={(event) =>
                        setDraftAccountName(event.target.value)
                      }
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                    />
                    <button
                      onClick={() => void handleRename()}
                      disabled={busyKey === "rename"}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:text-gray-400"
                    >
                      <PencilLine size={16} />
                      {busyKey === "rename" ? "Saving..." : "Save name"}
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-800">
                    {accountName}
                  </div>
                )}
              </div>
            </div>
          </section>

          {isOwner ? (
            <section className="rounded-2xl border border-[#9FD792] bg-[#EEF9EA]/70 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-white p-3 text-[#1E7A18] shadow-sm">
                  <UserRoundPlus size={18} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Invite Collaborator
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Enter the collaborator's email to save the invite and send a
                    sign-in link. After they sign in, the invitation will be
                    claimed automatically.
                  </p>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                      <Mail
                        size={16}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            void handleInvite();
                          }
                        }}
                        placeholder="partner@example.com"
                        className="w-full rounded-xl border border-gray-300 py-3 pl-11 pr-4 text-sm outline-none focus:border-[#2CA01C] focus:ring-2 focus:ring-[#2CA01C]/15"
                      />
                    </div>
                    <button
                      onClick={() => void handleInvite()}
                      disabled={busyKey === "invite"}
                      className="rounded-xl bg-[#2CA01C] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#248814] disabled:cursor-not-allowed disabled:bg-[#9FD792]"
                    >
                      {busyKey === "invite" ? "Sending..." : "Send Invite"}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

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

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  Active Collaborators
                </h3>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                  {collaborators.length}
                </span>
              </div>

              {isLoading ? (
                <p className="text-sm text-gray-500">
                  Loading collaborators...
                </p>
              ) : collaborators.length === 0 ? (
                <p className="text-sm text-gray-500">No collaborators yet.</p>
              ) : (
                <div className="space-y-3">
                  {collaborators.map((collaborator) => (
                    <div
                      key={collaborator.userId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {collaborator.email}
                        </p>
                        <p className="text-xs text-gray-500">
                          Joined {formatDate(collaborator.createdAt)}
                        </p>
                      </div>
                      {isOwner ? (
                        <button
                          onClick={() =>
                            void handleRemoveCollaborator(collaborator.userId)
                          }
                          disabled={busyKey === `remove:${collaborator.userId}`}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  Pending Invitations
                </h3>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                  {invitations.length}
                </span>
              </div>

              {isLoading ? (
                <p className="text-sm text-gray-500">Loading invitations...</p>
              ) : invitations.length === 0 ? (
                <p className="text-sm text-gray-500">No pending invitations.</p>
              ) : (
                <div className="space-y-3">
                  {invitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {invitation.inviteeEmail}
                        </p>
                        <p className="text-xs text-gray-500">
                          Invited {formatDate(invitation.createdAt)}
                        </p>
                      </div>
                      {isOwner ? (
                        <button
                          onClick={() =>
                            void handleCancelInvitation(invitation.id)
                          }
                          disabled={busyKey === `cancel:${invitation.id}`}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
