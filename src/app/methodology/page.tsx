import { JsonLd } from "../../components/JsonLd";
import { webPageData } from "../../lib/structured-data";
import { pageMetadata } from "../../lib/metadata";
import { MethodologyView } from "../../features/methodology/MethodologyView";
const page = {
  title: "Benchmark methodology",
  description:
    "How Browser LLM Bench measures speed, first-output latency, response time and resources, including protocol boundaries and measurement limitations.",
  path: "/methodology/",
  image: "seo/methodology.png",
};
export const metadata = pageMetadata(page);
export default function Page() {
  return (
    <>
      <JsonLd data={webPageData(page.path, page.title, page.description)} />
      <MethodologyView />
    </>
  );
}
