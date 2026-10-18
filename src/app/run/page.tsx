import { pageMetadata } from "../../lib/metadata";
import { RunnerView } from "../../features/runner/RunnerView";
export const metadata = pageMetadata({
  title: "Run a browser LLM benchmark",
  description:
    "Benchmark a supported LLM privately on your device. Configure the model, quantization and workload, then inspect and download your report.",
  path: "/run/",
  index: true,
});
export default function Page() {
  return <RunnerView />;
}
