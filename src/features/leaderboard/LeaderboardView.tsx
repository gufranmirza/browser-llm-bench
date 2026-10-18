"use client";
import { useReports } from "../../components/layout/AppProvider";
import { reportRow } from "./data";
import Leaderboard from "./Leaderboard";
export function LeaderboardView() {
  const { published, publishedReady } = useReports();
  if (!publishedReady)
    return <p role="status">Loading published measurements…</p>;
  return <Leaderboard allRows={published.map(reportRow)} />;
}
