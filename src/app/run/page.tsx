import { JsonLd } from "../../components/JsonLd";
import { webPageData } from "../../lib/structured-data";
import { pageMetadata } from "../../lib/metadata";
import { RunnerView } from "../../features/runner/RunnerView";
const page = {
  title: "Run a browser LLM benchmark",
  description:
    "Benchmark a supported LLM privately on your device. Configure the model, quantization and workload, then inspect and download your report.",
  path: "/run/",
  image: "seo/run.png",
};
export const metadata = pageMetadata(page);
export default function Page() {
  return (
    <>
      <JsonLd data={webPageData(page.path, page.title, page.description)} />
      <RunnerView />
    </>
  );
}
