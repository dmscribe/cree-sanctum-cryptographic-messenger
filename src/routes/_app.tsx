import { Outlet, createFileRoute } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Landing } from "@/components/Landing";
import { Desktop } from "@/components/desk/Desktop";
import { SanctumProvider } from "@/components/SanctumProvider";
import { fetchSessionUser } from "@/lib/server/session";

export const Route = createFileRoute("/_app")({
  loader: () => fetchSessionUser(),
  component: AuthedShell,
});

function AuthedShell() {
  const ssrUser = Route.useLoaderData();
  const { user, isPending } = useCurrentUserState();
  const authed = user ?? ssrUser;
  if (!authed) {
    if (isPending) return <Landing showAuth={false} />;
    return <RedirectToSignIn />;
  }
  return (
    <SanctumProvider ssrUserId={ssrUser?.id ?? user?.id}>
      <Desktop />
      <div className="hidden">
        <Outlet />
      </div>
    </SanctumProvider>
  );
}
