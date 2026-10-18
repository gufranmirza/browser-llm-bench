import { pageMetadata } from "../../lib/metadata";
import { MethodologyView } from "../../features/methodology/MethodologyView";
export const metadata = pageMetadata({
  title: "Benchmark methodology",
  description:
    "How Browser LLM Bench measures speed, first-output latency, response time and resources, including protocol boundaries and measurement limitations.",
  path: "/methodology/",
  index: true,
});
export default function Page() {
  return <MethodologyView />;
}
