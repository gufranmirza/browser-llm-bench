import { PublishedContentLoading } from "../../../components/layout/PublishedContentLoading";
import { Suspense } from "react";
import { PublishedModelSummary } from "../../../features/model-report/PublishedModelSummary";
import { pageMetadata } from "../../../lib/metadata";
import { catalog } from "../../../features/leaderboard/data";
import { ModelReportView } from "../../../features/model-report/ModelReportView";
import { JsonLd } from "../../../components/JsonLd";
import { readPublishedReports } from "../../../lib/published-reports.server";
import { publicUrl } from "../../../lib/metadata";
import { webPageData } from "../../../lib/structured-data";
import live from "../../../benchmark/runtime/catalog";
export const dynamicParams = false;
export function generateStaticParams() {
  return catalog.map((m) => ({ slug: m.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const name = catalog.find((m) => m.slug === slug)?.name ?? "Model";
  const ids = live.models.filter((m) => m.slug === slug).map((m) => m.id);
  const measured = (await readPublishedReports()).some((r) =>
    ids.includes(r.model),
  );
  return pageMetadata({
    title: `${name} browser ${measured ? "benchmark" : "configuration"}`,
    description: measured
      ? `Explore ${name} browser LLM measurements: generation speed, latency, response time, runtime configuration and resource usage.`
      : `Explore ${name} pinned WebGPU model artifacts, encodings and runtime requirements. No measured benchmark report is published yet.`,
    path: `/models/${slug}/`,
    image: `seo/models/${slug}.png`,
  });
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const model = catalog.find((m) => m.slug === slug)!;
  const ids = live.models.filter((m) => m.slug === slug).map((m) => m.id);
  const reports = (await readPublishedReports()).filter((r) =>
    ids.includes(r.model),
  );
  const path = `/models/${slug}/`;
  const data = webPageData(
    path,
    `${model.name} browser configuration and benchmarks`,
    `Pinned artifacts and published browser inference measurements for ${model.name}.`,
  );
  const datasets = reports.map((report) => ({
    "@type": "Dataset",
    "@id": publicUrl(path) + `#report-${report.id}`,
    name: `${model.name} · ${report.quantization} · browser benchmark ${report.id}`,
    description: `Recorded ${report.runtime} inference timing and scoped resource evidence for ${report.model}. Warmup is excluded from performance summaries. No task quality score is measured. See the saved protocol and environment before comparing.`,
    url: publicUrl(path),
    dateCreated: report.createdAt,
    version: report.protocol,
    variableMeasured: [
      "First-output latency",
      "Runtime-reported decode tokens per second",
      "Actual response duration",
    ],
    measurementTechnique:
      "Worker-timestamped WebLLM/WebGPU inference; optional scoped native collectors are identified in the report.",
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: publicUrl(`reports/${report.id}.json`),
      },
    ],
  }));
  const loading = <PublishedModelSummary slug={slug} />;
  return (
    <>
      <JsonLd data={{ ...data, "@graph": [...data["@graph"], ...datasets] }} />
      <Suspense
        fallback={<PublishedContentLoading>{loading}</PublishedContentLoading>}
      >
        <ModelReportView slug={slug} loading={loading} />
      </Suspense>
    </>
  );
}
