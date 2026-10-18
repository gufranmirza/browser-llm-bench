import { pageMetadata } from "../../../lib/metadata";
import { catalog } from "../../../features/leaderboard/data";
import { ModelReportView } from "../../../features/model-report/ModelReportView";
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
  return pageMetadata({
    title: `${name} browser benchmark`,
    description: `Explore ${name} browser LLM benchmark reports: generation speed, first-output latency, response time, runtime configuration and resource measurements.`,
    path: `/models/${slug}/`,
  });
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ModelReportView slug={slug} />;
}
