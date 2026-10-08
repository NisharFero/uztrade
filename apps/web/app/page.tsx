import type { Metadata } from "next";
import { Suspense } from "react";
import Conversation from "../components/chat/conversation";

export const metadata: Metadata = {
  title: "UzOne Trade Platform",
  description: "Say what you are moving; the agents match the published procedure and take the case through it one step at a time.",
};

export const dynamic = "force-dynamic";

export default function Home() {
  // The conversation reads ?case= to know which case it is in, so it renders on the client.
  return (
    <Suspense fallback={null}>
      <Conversation />
    </Suspense>
  );
}
