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
  return {
    title: catalog.find((m) => m.slug === slug)?.name ?? "Model report",
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ModelReportView slug={slug} />;
}
