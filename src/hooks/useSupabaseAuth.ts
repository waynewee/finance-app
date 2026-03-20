import { useCallback, useEffect, useState } from "react";
import { type Session, type User } from "@supabase/supabase-js";
import {
  completeMagicLinkSignIn,
  sendMagicLinkEmail,
  supabase,
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

  const sendMagicLink = useCallback(async (email: string) => {
    try {
      await sendMagicLinkEmail(email);
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : "Failed to send the sign-in link.",
      );
      throw signInError;
    }

    setError(null);
  }, []);

  const completeSignInFromUrl = useCallback(async (callbackUrl: string) => {
    try {
      await completeMagicLinkSignIn(callbackUrl);
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : "Failed to complete sign-in.",
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
    sendMagicLink,
    completeSignInFromUrl,
    signOut,
  };
}
