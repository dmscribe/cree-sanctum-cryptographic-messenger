import { createFileRoute } from "@tanstack/react-router";
import { DiscoverPanel } from "@/components/DiscoverPanel";

export const Route = createFileRoute("/_app/discover")({
  component: DiscoverPanel,
});
