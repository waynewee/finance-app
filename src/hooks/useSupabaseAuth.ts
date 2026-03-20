import { useCallback, useEffect, useState } from "react";
import { type Session, type User } from "@supabase/supabase-js";
import {
  sendSignInEmail,
  supabase,
  verifyEmailOtpSignIn,
} from "../lib/supabase";

export function useSupabaseAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const hydrateSession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (sessionError) {
        setError(sessionError.message);
      } else {
        setSession(data.session);
        setUser(data.session?.user ?? null);
        setError(null);
      }

      setIsLoading(false);
    };

    void hydrateSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsLoading(false);
      setError(null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const sendSignInEmailLink = useCallback(async (email: string) => {
    try {
      await sendSignInEmail(email);
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : "Failed to send the sign-in email.",
      );
      throw signInError;
    }

    setError(null);
  }, []);

  const verifyEmailOtp = useCallback(async (email: string, token: string) => {
    try {
      await verifyEmailOtpSignIn(email, token);
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : "Failed to verify the sign-in code.",
      );
      throw signInError;
    }

    setError(null);
  }, []);

  const signOut = useCallback(async () => {
    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      setError(signOutError.message);
      throw signOutError;
    }

    setError(null);
  }, []);

  return {
    session,
    user,
    isLoading,
    error,
    sendSignInEmail: sendSignInEmailLink,
    verifyEmailOtp,
    signOut,
  };
}
