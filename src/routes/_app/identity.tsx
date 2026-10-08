import { createFileRoute } from "@tanstack/react-router";
import { IdentityPanel } from "@/components/IdentityPanel";

export const Route = createFileRoute("/_app/identity")({
  component: IdentityPanel,
});
