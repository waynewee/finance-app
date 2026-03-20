import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const magicLinkRedirectUrlOverride =
  import.meta.env.VITE_MAGIC_LINK_REDIRECT_URL?.trim() || null;
const supabaseConfigError =
  !supabaseUrl || !supabaseAnonKey
    ? "Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before starting the app."
    : null;

type SupportedOtpType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email";

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

const supportedOtpTypes = new Set<SupportedOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function getHashParams(url: URL): URLSearchParams {
  return new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
}

function getOtpType(value: string | null): SupportedOtpType | null {
  if (!value || !supportedOtpTypes.has(value as SupportedOtpType)) {
    return null;
  }

  return value as SupportedOtpType;
}

export async function completeMagicLinkSignIn(callbackUrl: string): Promise<void> {
  const trimmedUrl = callbackUrl.trim();

  if (!trimmedUrl) {
    throw new Error("Paste the full sign-in link from the email.");
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    throw new Error("Paste the full sign-in link from the email.");
  }

  const hashParams = getHashParams(parsedUrl);
  const code = parsedUrl.searchParams.get("code");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      throw error;
    }

    return;
  }

  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      throw error;
    }

    return;
  }

  const tokenHash =
    parsedUrl.searchParams.get("token_hash") ?? hashParams.get("token_hash");
  const otpType =
    getOtpType(parsedUrl.searchParams.get("type")) ??
    getOtpType(hashParams.get("type"));

  if (tokenHash && otpType) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });

    if (error) {
      throw error;
    }

    return;
  }

  throw new Error(
    "That link does not contain a supported Supabase sign-in callback. Copy the full link from the email and try again.",
  );
}

export async function sendMagicLinkEmail(email: string): Promise<void> {
  const normalizedEmail = email.trim();

  if (!normalizedEmail) {
    throw new Error("Enter an email address to receive a sign-in link.");
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
