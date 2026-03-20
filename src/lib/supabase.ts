import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const magicLinkRedirectUrlOverride =
  import.meta.env.VITE_MAGIC_LINK_REDIRECT_URL?.trim() || null;
const supabaseConfigError =
  !supabaseUrl || !supabaseAnonKey
    ? "Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before starting the app."
    : null;

function normalizeRedirectUrl(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

const missingSupabaseClient = new Proxy(
  {},
  {
    get() {
      throw new Error(supabaseConfigError ?? "Supabase is not configured.");
    },
  },
) as ReturnType<typeof createClient>;

export const supabase = supabaseConfigError
  ? missingSupabaseClient
  : createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });

export function getSupabaseConfigError(): string | null {
  return supabaseConfigError;
}

export function getMagicLinkRedirectUrl(): string | undefined {
  if (magicLinkRedirectUrlOverride) {
    return normalizeRedirectUrl(magicLinkRedirectUrlOverride);
  }

  if (typeof window === "undefined") {
    return undefined;
  }

  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return normalizeRedirectUrl(url.toString());
}
export async function sendSignInEmail(email: string): Promise<void> {
  const normalizedEmail = email.trim();

  if (!normalizedEmail) {
    throw new Error("Enter an email address to receive a sign-in code.");
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: getMagicLinkRedirectUrl(),
    },
  });

  if (error) {
    throw error;
  }
}

export async function sendMagicLinkEmail(email: string): Promise<void> {
  await sendSignInEmail(email);
}

export async function verifyEmailOtpSignIn(
  email: string,
  token: string,
): Promise<void> {
  const normalizedEmail = email.trim();
  const normalizedToken = token.trim();

  if (!normalizedEmail) {
    throw new Error("Enter your email address before verifying the code.");
  }

  if (!normalizedToken) {
    throw new Error("Enter the sign-in code from your email.");
  }

  const { error } = await supabase.auth.verifyOtp({
    email: normalizedEmail,
    token: normalizedToken,
    type: "email",
  });

  if (error) {
    throw error;
  }
}
