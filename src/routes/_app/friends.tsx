import { createFileRoute } from "@tanstack/react-router";
import { FriendsPanel } from "@/components/FriendsPanel";

export const Route = createFileRoute("/_app/friends")({
  component: FriendsPanel,
});
