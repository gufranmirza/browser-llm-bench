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
          This report is not saved in this browser. Open the browser where you
          ran it, or import a downloaded JSON report from Local reports.
        </p>
        <SiteLink href="/local-results/">Open local reports</SiteLink>
      </div>
    );
  const row = reportRow(report);
  return (
    <>
      <p className="notice">
        Private report · saved in this browser only.{" "}
        <SiteLink href="/run/">Run another benchmark</SiteLink>
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
