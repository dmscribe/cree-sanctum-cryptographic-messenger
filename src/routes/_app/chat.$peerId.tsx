import { createFileRoute } from "@tanstack/react-router";
import { ChatThread } from "@/components/ChatThread";

export const Route = createFileRoute("/_app/chat/$peerId")({
  component: ChatPage,
});

function ChatPage() {
  const { peerId } = Route.useParams();
  return <ChatThread peerId={peerId} />;
}
