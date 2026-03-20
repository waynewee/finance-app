import { supabase } from "./supabase";

export interface AccessibleAccount {
  userId: string;
  accountName: string;
  role: "owner" | "collaborator";
}

export interface AccountCollaborator {
  userId: string;
  email: string;
  createdAt: string;
}

export interface AccountInvitation {
  id: string;
  inviteeEmail: string;
  createdAt: string;
  claimedAt: string | null;
}

export interface AccessibleAccountActivity {
  hasCategories: boolean;
  hasMonthlyValues: boolean;
  hasFireSettings: boolean;
}

interface AccountCollaboratorRow {
  owner_user_id: string;
  collaborator_user_id: string;
  collaborator_email: string;
  created_at: string;
}

interface AccountInvitationRow {
  id: string;
  owner_user_id: string;
  invitee_email: string;
  claimed_at: string | null;
  created_at: string;
}

const DEFAULT_ACCOUNT_NAME = "My Household";

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

function dedupe<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export async function ensureAccountProfile(userId: string): Promise<void> {
  const { error } = await supabase.from("account_profiles").upsert(
    {
      user_id: userId,
      account_name: DEFAULT_ACCOUNT_NAME,
    },
    {
      onConflict: "user_id",
      ignoreDuplicates: true,
    },
  );

  if (error) {
    throw error;
  }
}

export async function claimPendingInvitations(
  userId: string,
  email: string | null | undefined,
): Promise<string[]> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return [];
  }

  const { data: invitations, error: invitationsError } = await supabase
    .from("account_invitations")
    .select("id, owner_user_id, invitee_email, claimed_at, created_at")
    .eq("invitee_email", normalizedEmail)
    .is("claimed_at", null);

  if (invitationsError) {
    throw invitationsError;
  }

  const pendingInvitations = (invitations ?? []).filter(
    (invitation) => invitation.owner_user_id !== userId,
  );

  if (pendingInvitations.length === 0) {
    return [];
  }

  const collaboratorRows = pendingInvitations.map((invitation) => ({
    owner_user_id: invitation.owner_user_id,
    collaborator_user_id: userId,
    collaborator_email: normalizedEmail,
  }));

  const { error: collaboratorsError } = await supabase
    .from("account_collaborators")
    .upsert(collaboratorRows, {
      onConflict: "owner_user_id,collaborator_user_id",
    });

  if (collaboratorsError) {
    throw collaboratorsError;
  }

  const { error: claimError } = await supabase
    .from("account_invitations")
    .update({
      claimed_by_user_id: userId,
      claimed_at: new Date().toISOString(),
    })
    .in(
      "id",
      pendingInvitations.map((invitation) => invitation.id),
    );

  if (claimError) {
    throw claimError;
  }

  return dedupe(
    pendingInvitations.map((invitation) => invitation.owner_user_id),
  );
}

export async function loadAccessibleAccounts(
  userId: string,
): Promise<AccessibleAccount[]> {
  const { data: collaboratorRows, error: collaboratorsError } = await supabase
    .from("account_collaborators")
    .select(
      "owner_user_id, collaborator_user_id, collaborator_email, created_at",
    )
    .eq("collaborator_user_id", userId);

  if (collaboratorsError) {
    throw collaboratorsError;
  }

  const accessibleIds = dedupe([
    userId,
    ...(collaboratorRows ?? []).map((row) => row.owner_user_id),
  ]);

  const { data: profileRows, error: profilesError } = await supabase
    .from("account_profiles")
    .select("user_id, account_name")
    .in("user_id", accessibleIds);

  if (profilesError) {
    throw profilesError;
  }

  const profileMap = new Map(
    (profileRows ?? []).map((row) => [row.user_id, row.account_name]),
  );

  const accounts = accessibleIds.map((accessibleId) => ({
    userId: accessibleId,
    accountName:
      profileMap.get(accessibleId) ??
      (accessibleId === userId ? DEFAULT_ACCOUNT_NAME : "Shared Household"),
    role: accessibleId === userId ? "owner" : "collaborator",
  })) satisfies AccessibleAccount[];

  return accounts.sort((left, right) => {
    if (left.role !== right.role) {
      return left.role === "owner" ? -1 : 1;
    }

    return left.accountName.localeCompare(right.accountName);
  });
}

export async function loadAccessibleAccountActivity(
  userIds: string[],
): Promise<Record<string, AccessibleAccountActivity>> {
  const uniqueUserIds = dedupe(userIds);
  if (uniqueUserIds.length === 0) {
    return {};
  }

  const [
    { data: categoryRows, error: categoriesError },
    { data: monthlyValueRows, error: monthlyValuesError },
    { data: fireSettingsRows, error: fireSettingsError },
  ] = await Promise.all([
    supabase.from("categories").select("user_id").in("user_id", uniqueUserIds),
    supabase
      .from("monthly_values")
      .select("user_id")
      .in("user_id", uniqueUserIds),
    supabase
      .from("fire_settings")
      .select("user_id")
      .in("user_id", uniqueUserIds),
  ]);

  const error = categoriesError ?? monthlyValuesError ?? fireSettingsError;
  if (error) {
    throw error;
  }

  const categoryUserIds = new Set(
    (categoryRows ?? []).map((row) => row.user_id as string),
  );
  const monthlyValueUserIds = new Set(
    (monthlyValueRows ?? []).map((row) => row.user_id as string),
  );
  const fireSettingsUserIds = new Set(
    (fireSettingsRows ?? []).map((row) => row.user_id as string),
  );

  return uniqueUserIds.reduce<Record<string, AccessibleAccountActivity>>(
    (result, currentUserId) => {
      result[currentUserId] = {
        hasCategories: categoryUserIds.has(currentUserId),
        hasMonthlyValues: monthlyValueUserIds.has(currentUserId),
        hasFireSettings: fireSettingsUserIds.has(currentUserId),
      };
      return result;
    },
    {},
  );
}

export async function loadAccountCollaborators(
  ownerUserId: string,
): Promise<AccountCollaborator[]> {
  const { data, error } = await supabase
    .from("account_collaborators")
    .select(
      "owner_user_id, collaborator_user_id, collaborator_email, created_at",
    )
    .eq("owner_user_id", ownerUserId)
    .order("created_at");

  if (error) {
    throw error;
  }

  return ((data ?? []) as AccountCollaboratorRow[]).map((row) => ({
    userId: row.collaborator_user_id,
    email: row.collaborator_email,
    createdAt: row.created_at,
  }));
}

export async function loadPendingAccountInvitations(
  ownerUserId: string,
): Promise<AccountInvitation[]> {
  const { data, error } = await supabase
    .from("account_invitations")
    .select("id, owner_user_id, invitee_email, claimed_at, created_at")
    .eq("owner_user_id", ownerUserId)
    .is("claimed_at", null)
    .order("created_at");

  if (error) {
    throw error;
  }

  return ((data ?? []) as AccountInvitationRow[]).map((row) => ({
    id: row.id,
    inviteeEmail: row.invitee_email,
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
  }));
}

export async function renameAccount(
  ownerUserId: string,
  accountName: string,
): Promise<void> {
  const trimmedName = accountName.trim();
  if (!trimmedName) {
    throw new Error("Enter an account name.");
  }

  const { error } = await supabase
    .from("account_profiles")
    .update({ account_name: trimmedName })
    .eq("user_id", ownerUserId);

  if (error) {
    throw error;
  }
}

export async function inviteAccountCollaborator(
  ownerUserId: string,
  inviteeEmail: string,
): Promise<void> {
  const normalizedEmail = normalizeEmail(inviteeEmail);
  if (!normalizedEmail) {
    throw new Error("Enter an email address to invite.");
  }

  const { error } = await supabase.from("account_invitations").upsert(
    {
      owner_user_id: ownerUserId,
      invitee_email: normalizedEmail,
      invited_by_user_id: ownerUserId,
      claimed_by_user_id: null,
      claimed_at: null,
    },
    {
      onConflict: "owner_user_id,invitee_email",
    },
  );

  if (error) {
    throw error;
  }
}

export async function removeAccountCollaborator(
  ownerUserId: string,
  collaboratorUserId: string,
): Promise<void> {
  const { error } = await supabase
    .from("account_collaborators")
    .delete()
    .eq("owner_user_id", ownerUserId)
    .eq("collaborator_user_id", collaboratorUserId);

  if (error) {
    throw error;
  }
}

export async function cancelAccountInvitation(
  ownerUserId: string,
  invitationId: string,
): Promise<void> {
  const { error } = await supabase
    .from("account_invitations")
    .delete()
    .eq("owner_user_id", ownerUserId)
    .eq("id", invitationId);

  if (error) {
    throw error;
  }
}
