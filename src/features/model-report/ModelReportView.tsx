"use client";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useReports } from "../../components/layout/AppProvider";
import { reportRow } from "../leaderboard/data";
import ModelReport from "./ModelReport";
export function ModelReportView({
  slug,
  loading,
}: {
  slug: string;
  loading: ReactNode;
}) {
  const params = useSearchParams();
  const { published, publishedReady, inspect } = useReports();
  if (!publishedReady || !published.length) return loading;
  return (
    <ModelReport
      slug={slug}
      params={new URLSearchParams(params.toString())}
      allRows={published.map(reportRow)}
      onReport={inspect}
    />
  );
}
