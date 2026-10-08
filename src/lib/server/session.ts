import { createServerFn } from "@tanstack/react-start";

export const fetchSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
  assertSameSiteRequest();
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const u = await getSessionUser();
  return u ? { id: u.id, displayName: u.name ?? null } : null;
});
