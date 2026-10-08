import { createFileRoute } from "@tanstack/react-router";
import { ViewsPanel } from "@/components/ViewsPanel";

export const Route = createFileRoute("/_app/views")({
  component: ViewsPanel,
});
