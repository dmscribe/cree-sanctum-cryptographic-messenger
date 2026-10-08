import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { runPreSignInSignOut, runSignOut } from "../../../scripts/sign-out-plan.mjs";
import { OAUTH_PROVIDERS } from "./providers";

export const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
});

export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";

export { OAUTH_PROVIDERS };

const HOLD_KEY = "sanctum-landing-hold";
const READY_KEY = "sanctum-throwaway-ready";
const FORCE_LANDING_KEY = "sanctum-force-landing";

function readStoredHold(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.sessionStorage.getItem(HOLD_KEY) === "1" ||
      Boolean(window.sessionStorage.getItem(READY_KEY))
    );
  } catch {
    return false;
  }
}

let landingHold = readStoredHold();
const landingHoldListeners = new Set<() => void>();

export function setLandingHold(on: boolean): void {
  landingHold = on;
  if (typeof window !== "undefined") {
    try {
      if (on) window.sessionStorage.setItem(HOLD_KEY, "1");
      else {
        window.sessionStorage.removeItem(HOLD_KEY);
        window.sessionStorage.removeItem(READY_KEY);
      }
    } catch {
      // private mode
    }
  }
  landingHoldListeners.forEach((fn) => fn());
}

export function getLandingHold(): boolean {
  return landingHold;
}

export function subscribeLandingHold(listener: () => void): () => void {
  landingHoldListeners.add(listener);
  return () => {
    landingHoldListeners.delete(listener);
  };
}

export function markForceLanding(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.sessionStorage.setItem(FORCE_LANDING_KEY, "1");
    else window.sessionStorage.removeItem(FORCE_LANDING_KEY);
  } catch {
    // private mode
  }
}

export function shouldForceLanding(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(FORCE_LANDING_KEY) === "1") return true;
    return new URLSearchParams(window.location.search).has("signedout");
  } catch {
    return false;
  }
}

export function persistThrowawayReady(file: { name: string; text: string } | null): void {
  if (typeof window === "undefined") return;
  try {
    if (file) {
      window.sessionStorage.setItem(READY_KEY, JSON.stringify(file));
      window.sessionStorage.setItem(HOLD_KEY, "1");
      landingHold = true;
      landingHoldListeners.forEach((fn) => fn());
    } else {
      window.sessionStorage.removeItem(READY_KEY);
    }
  } catch {
    // private mode
  }
}

export function readThrowawayReady(): { name: string; text: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(READY_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { name?: unknown; text?: unknown };
    if (typeof value?.name === "string" && typeof value?.text === "string") {
      return { name: value.name, text: value.text };
    }
  } catch {
    // ignore malformed storage
  }
  return null;
}

export async function signIn(
  providerId: string,
  opts: { callbackURL?: string; errorCallbackURL?: string } = {},
): Promise<void> {
  const callbackURL = opts.callbackURL ?? "/";
  const errorCallbackURL = opts.errorCallbackURL ?? "/";

  await runPreSignInSignOut({
    livePreview: false,
    hasBearer: false,
    requestSignOut: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? "Sign-out failed");
    },
    clearToken: () => {},
  });

  const { data, error } = await authClient.signIn.oauth2({
    providerId,
    callbackURL,
    errorCallbackURL,
  });
  if (error) throw new Error(error.message ?? "Sign-in failed");
  if (data?.url) window.location.href = data.url;
}

export async function signOut(redirectTo = "/?signedout=1"): Promise<void> {
  markForceLanding(true);
  setLandingHold(false);
  persistThrowawayReady(null);
  await runSignOut({
    livePreview: false,
    hasBearer: false,
    requestSignOut: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? "Sign-out failed");
    },
    clearToken: () => {},
    redirect: () => {
      window.location.replace(redirectTo);
    },
  });
}