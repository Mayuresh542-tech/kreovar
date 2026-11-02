import { supabase } from "../supabase";

export function googleCallbackUrl(origin: string): string {
  const url = new URL(origin);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Google sign-in requires a secure connection.");
  }
  return `${url.origin}/auth/callback`;
}

/** Use the existing browser client's session/cookie handling and PKCE flow. */
export async function startGoogleSignIn(origin: string): Promise<void> {
  const redirectTo = googleCallbackUrl(origin);
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not connect to sign-in. Please try again.");
  const settings = await response.json();
  if (settings.external?.google !== true) {
    throw new Error("Google sign-in is not available yet. Please use your email to continue.");
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, queryParams: { prompt: "select_account" } },
  });
  if (error) throw new Error("Could not start Google sign-in. Please try again.");
}

/** Do not reflect provider descriptions, credentials or URLs into the page. */
export function googleReturnError(url: string): string | undefined {
  const parsed = new URL(url), fragment = new URLSearchParams(parsed.hash.slice(1));
  const code = parsed.searchParams.get("error") || fragment.get("error");
  if (!code && !parsed.searchParams.has("error_description") && !fragment.has("error_description")) return;
  return code === "access_denied"
    ? "Google sign-in was cancelled. You can try again or sign in with email."
    : "Google sign-in could not be completed. Please try again or use email.";
}
