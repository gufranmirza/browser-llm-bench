"use client";
import type { ReactNode } from "react";
import { useReports } from "../../components/layout/AppProvider";
import { reportRow } from "./data";
import Leaderboard from "./Leaderboard";
export function LeaderboardView({ loading }: { loading: ReactNode }) {
  const { published, publishedReady } = useReports();
  if (!publishedReady || !published.length) return loading;
  return <Leaderboard allRows={published.map(reportRow)} />;
}
