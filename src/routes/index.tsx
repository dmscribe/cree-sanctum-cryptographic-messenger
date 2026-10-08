import { createFileRoute } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getLandingHold, subscribeLandingHold, shouldForceLanding } from "@/lib/auth/client";
import { Landing } from "@/components/Landing";
import { Desktop } from "@/components/desk/Desktop";
import { SanctumProvider } from "@/components/SanctumProvider";
import { fetchSessionUser } from "@/lib/server/session";

export const Route = createFileRoute("/")({
  loader: () => fetchSessionUser(),
  component: Home,
});

function readForceLanding() {
  return shouldForceLanding();
}

function Home() {
  const ssrUser = Route.useLoaderData();
  const { user } = useCurrentUserState();
  const held = useSyncExternalStore(subscribeLandingHold, getLandingHold, () => false);
  const forced = useSyncExternalStore(subscribeLandingHold, readForceLanding, () => false);
  const authed = user ?? ssrUser;
  if (forced || !authed || held) return <Landing showAuth />;
  return (
    <SanctumProvider ssrUserId={ssrUser?.id ?? user?.id}>
      <Desktop />
    </SanctumProvider>
  );
}