import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getCookie } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { emailAndPasswordEnabled } from "./email-password";
import { pgliteDialect } from "./pglite-dialect";

void ensureDbReady();

const globalAuthRef = globalThis as typeof globalThis & {
  __sanctumAuthDevSecret__?: string;
};

function devAuthSecret(): string {
  globalAuthRef.__sanctumAuthDevSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__sanctumAuthDevSecret__;
}

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

export const authEnabled = env("VITE_AUTH_ENABLED") !== "false";
export const authConfigured = authEnabled && emailAndPasswordEnabled;

const explicitBaseURL = env("BETTER_AUTH_URL") ?? "http://127.0.0.1:8080";
const localDevOrigins = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
];
const trustedOrigins = [...new Set([explicitBaseURL, ...localDevOrigins])];
const secureCookies = /^https:\/\//i.test(explicitBaseURL);

const databaseUrl = env("DATABASE_URL");
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

export const SESSION_TOKEN_COOKIE = "sanctum-auth.session_token";

export const auth = betterAuth({
  baseURL: explicitBaseURL,
  secret: env("BETTER_AUTH_SECRET") ?? devAuthSecret(),
  database,
  trustedOrigins,
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: [],
      requireLocalEmailVerified: false,
    },
  },
  session: { cookieCache: { enabled: true, maxAge: 300 } },
  ...(authConfigured ? { emailAndPassword: { enabled: true } } : {}),
  advanced: {
    useSecureCookies: false,
    defaultCookieAttributes: { secure: secureCookies, sameSite: "lax", path: "/" },
    cookies: {
      session_token: { name: SESSION_TOKEN_COOKIE },
      session_data: { name: "sanctum-auth.session_data" },
      account_data: { name: "sanctum-auth.account_data" },
      dont_remember: { name: "sanctum-auth.dont_remember" },
    },
  },
  plugins: [tanstackStartCookies()],
});

export function readSessionToken(): string | null {
  return getCookie(SESSION_TOKEN_COOKIE) ?? null;
}