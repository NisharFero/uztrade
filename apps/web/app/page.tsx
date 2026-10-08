import { Suspense } from "react";
import Conversation from "../components/chat/conversation";
import Landing from "../components/layout/landing";

export default async function Home({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Keep bookmarked case and chat URLs opening their original workspace.
  if (params.case || params.chat) return <Suspense fallback={null}><Conversation /></Suspense>;
  return <Landing />;
}
