"use client";
import { PublishedContentLoading } from "../../components/layout/PublishedContentLoading";
import type { ReactNode } from "react";
import { useReports } from "../../components/layout/AppProvider";
import { reportRow } from "./data";
import Leaderboard from "./Leaderboard";
export function LeaderboardView({ loading }: { loading: ReactNode }) {
  const { published, publishedReady } = useReports();
  if (!publishedReady)
    return <PublishedContentLoading>{loading}</PublishedContentLoading>;
  if (!published.length) return loading;
  return <Leaderboard allRows={published.map(reportRow)} />;
}
