import { createFileRoute } from "@tanstack/react-router";
import { AshenGate } from "@/game/AshenGate";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <AshenGate />;
}
