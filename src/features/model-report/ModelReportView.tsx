"use client";
import { useSearchParams } from "next/navigation";
import { useReports } from "../../components/layout/AppProvider";
import { reportRow } from "../leaderboard/data";
import ModelReport from "./ModelReport";
export function ModelReportView({ slug }: { slug: string }) {
  const params = useSearchParams();
  const { published, publishedReady, inspect } = useReports();
  if (!publishedReady)
    return <p role="status">Loading published measurements…</p>;
  return (
    <ModelReport
      slug={slug}
      params={new URLSearchParams(params.toString())}
      allRows={published.map(reportRow)}
      onReport={inspect}
    />
  );
}
