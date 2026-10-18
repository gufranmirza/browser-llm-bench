import { readPublishedReports } from "../../lib/published-reports.server";
import { JsonLd } from "../../components/JsonLd";
import { webPageData } from "../../lib/structured-data";
import { pageMetadata } from "../../lib/metadata";
import { CompatibilityView } from "../../features/capabilities/CompatibilityView";
const page = {
  title: "Browser compatibility",
  description:
    "Understand WebGPU requirements, runtime support and captured browser compatibility evidence before running a local LLM benchmark.",
  path: "/compatibility/",
  image: "seo/compatibility.png",
};
export const metadata = pageMetadata(page);
export default async function Page() {
  const latest = (await readPublishedReports()).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )[0];
  const initialEvidence = latest
    ? [
        {
          model: latest.model,
          runtime: latest.runtime,
          status: latest.status,
          environment: { deviceLabel: latest.environment.deviceLabel },
        },
      ]
    : [];
  return (
    <>
      <JsonLd data={webPageData(page.path, page.title, page.description)} />
      <CompatibilityView initialEvidence={initialEvidence} />
    </>
  );
}
