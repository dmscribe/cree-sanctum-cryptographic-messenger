import { createFileRoute } from "@tanstack/react-router";
import { AlgorithmConsole } from "@/components/AlgorithmConsole";

export const Route = createFileRoute("/_app/console")({
  component: AlgorithmConsole,
});
