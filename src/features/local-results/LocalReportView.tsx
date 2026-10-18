"use client";
import { useSearchParams } from "next/navigation";
import { useReports } from "../../components/layout/AppProvider";
import { SiteLink } from "../../components/SiteLink";
import { reportRow } from "../leaderboard/data";
import ModelReport from "../model-report/ModelReport";
export function LocalReportView() {
  const params = useSearchParams();
  const { local, localReady, inspect } = useReports();
  if (!localReady) return <p role="status">Loading local measurements…</p>;
  const report = local.find((r) => r.id === params.get("id"));
  if (!report)
    return (
      <div className="empty">
        <h1>Local report unavailable</h1>
        <p>
          This report belongs to the browser where it was run. Download it there
          to keep a copy.
        </p>
        <SiteLink href="/run/">Run a benchmark</SiteLink>
      </div>
    );
  const row = reportRow(report);
  return (
    <>
      <p className="notice">
        Private browser result · not published to the leaderboard.{" "}
        <SiteLink href="/run/">Configure another run</SiteLink>
      </p>
      <ModelReport
        localReportId={report.id}
        slug={row.artifact.model.slug}
        params={
          new URLSearchParams({
            artifact: report.model,
            source: "measured",
            cohort: `run:${report.id}`,
            back: "/local-results/",
            section: params.get("section") ?? "performance",
          })
        }
        allRows={[row]}
        onReport={inspect}
      />
    </>
  );
}
