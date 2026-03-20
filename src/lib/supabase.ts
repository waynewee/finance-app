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

const nestedRedirectParamKeys = new Set([
  "url",
  "redirect",
  "redirect_to",
  "redirectto",
  "target",
  "target_url",
  "targeturl",
  "href",
  "link",
  "destination",
  "dest",
  "next",
  "to",
  "u",
  "uri",
]);

function getHashParams(url: URL): URLSearchParams {
  return new URLSearchParams(
    url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
  );
}

function getFirstUrlSubstring(value: string): string | null {
  const match = value.match(/https?:\/\/[^\s"'<>]+/i);
  return match?.[0] ?? null;
}

function decodeUrlCandidate(value: string): string | null {
  const directUrl = getFirstUrlSubstring(value);

  if (directUrl) {
    return directUrl;
  }

  let decodedValue = value;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      decodedValue = decodeURIComponent(decodedValue);
    } catch {
      break;
    }

    const decodedUrl = getFirstUrlSubstring(decodedValue);

    if (decodedUrl) {
      return decodedUrl;
    }
  }

  return null;
}

function getNestedUrlCandidates(url: URL): string[] {
  const candidates = new Set<string>();
  const params = [url.searchParams, getHashParams(url)];

  for (const paramSet of params) {
    for (const [key, value] of paramSet.entries()) {
      const normalizedKey = key.trim().toLowerCase();
      const decodedCandidate = decodeUrlCandidate(value);

      if (nestedRedirectParamKeys.has(normalizedKey) && decodedCandidate) {
        candidates.add(decodedCandidate);
        continue;
      }

      if (decodedCandidate) {
        candidates.add(decodedCandidate);
      }
    }
  }

  const hrefCandidate = decodeUrlCandidate(url.href);

  if (hrefCandidate && hrefCandidate !== url.href) {
    candidates.add(hrefCandidate);
  }

  return [...candidates];
}

function getResolvableAuthCallbackUrl(rawValue: string): URL | null {
  const initialCandidate = decodeUrlCandidate(rawValue) ?? rawValue.trim();
  const queue = [initialCandidate];
  const visited = new Set<string>();

  while (queue.length > 0 && visited.size < 10) {
    const currentValue = queue.shift();

    if (!currentValue || visited.has(currentValue)) {
      continue;
    }

    visited.add(currentValue);

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(currentValue);
    } catch {
      continue;
    }

    const hashParams = getHashParams(parsedUrl);

    if (
      parsedUrl.searchParams.has("code") ||
      hashParams.has("access_token") ||
      hashParams.has("refresh_token") ||
      parsedUrl.searchParams.has("token_hash") ||
      hashParams.has("token_hash")
    ) {
      return parsedUrl;
    }

    queue.push(...getNestedUrlCandidates(parsedUrl));
  }

  return null;
}

function getOtpType(value: string | null): SupportedOtpType | null {
  if (!value || !supportedOtpTypes.has(value as SupportedOtpType)) {
    return null;
  }

  return value as SupportedOtpType;
}

export async function completeMagicLinkSignIn(
  callbackUrl: string,
): Promise<void> {
  const trimmedUrl = callbackUrl.trim();

  if (!trimmedUrl) {
    throw new Error("Paste the full sign-in link from the email.");
  }

  const parsedUrl = getResolvableAuthCallbackUrl(trimmedUrl);

  if (!parsedUrl) {
    throw new Error(
      "That link does not contain a supported Supabase sign-in callback. If Brevo click tracking is enabled, copy the final redirect URL or disable click tracking for auth emails.",
    );
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
    "That link does not contain a supported Supabase sign-in callback. If Brevo click tracking is enabled, copy the final redirect URL or disable click tracking for auth emails.",
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
