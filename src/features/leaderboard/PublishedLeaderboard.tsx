import {
  protocolLabel,
  summarizeResources,
} from "../../benchmark/metrics/resources";
import { SiteLink } from "../../components/SiteLink";
import { ProviderLogo } from "../../components/ProviderLogo";
import { readPublishedReports } from "../../lib/published-reports.server";
import { comparisonGroups } from "./comparison";
import { primaryMeasuredRows, reportRow } from "./data";

export async function PublishedLeaderboard() {
  const group = comparisonGroups(
    (await readPublishedReports()).map(reportRow),
  )[0];
  const rows = primaryMeasuredRows(group?.rows ?? []).sort(
    (a, b) => (b.decode ?? -Infinity) - (a.decode ?? -Infinity),
  );
  const number = (n: number | null, digits = 1) =>
    n === null ? "Not measured" : n.toFixed(digits);
  return (
    <div className="lb-page" data-published-snapshot="leaderboard">
      <section className="lb-intro">
        <div className="lb-intro-top">
          <div className="lb-intro-title">
            <h1>Browser LLM leaderboard</h1>
            <div className="lb-intro-actions">
              <SiteLink href="/methodology/">Measurement methodology</SiteLink>
            </div>
          </div>
          <div className="lb-intro-copy">
            <p>
              Compare browser LLMs by generation speed, first-output latency,
              response time, memory and resource use.
            </p>
            <p>
              Results describe the recorded device, browser and workload. Answer
              accuracy is not tested; output lengths differ across models.
            </p>
          </div>
        </div>
      </section>
      <section className="lb-table-section" aria-label="Published comparison">
        <h2>Compare models</h2>
        <p>
          {rows.length} measured configurations ·{" "}
          {group ? protocolLabel(group.rows[0]) : "No published comparison yet"}
        </p>
        <div className="panel table-wrap">
          <table>
            <caption>
              Published browser LLM measurements, excluding warmup
            </caption>
            <thead>
              <tr>
                <th>Model</th>
                <th>Generation speed (tok/s)</th>
                <th>First-output latency (ms)</th>
                <th>Response time (s)</th>
                <th>Peak browser memory (GB)</th>
                <th>Completed requests</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <SiteLink
                      href={`/models/${row.artifact.model.slug}/?artifact=${encodeURIComponent(row.artifact.model_id)}&cohort=${encodeURIComponent(row.cohort)}`}
                    >
                      <ProviderLogo
                        family={row.artifact.model.family}
                        model={row.artifact.model.name}
                      />
                      {row.artifact.model.name}
                    </SiteLink>
                    <small>
                      {row.artifact.encoding} · {row.runtime}
                    </small>
                  </td>
                  <td>{number(row.decode)}</td>
                  <td>{number(row.firstOutputMs)}</td>
                  <td>
                    {number(
                      row.responseMs === null ? null : row.responseMs / 1000,
                      2,
                    )}
                  </td>
                  <td>
                    {number(summarizeResources(row.report).peakMemory, 2)}
                  </td>
                  <td>{row.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Request metrics are medians. Peak memory is a sampled sum of Chrome
          process footprints, not deduplicated RAM. Missing readings stay
          unavailable.{" "}
          <SiteLink href="/methodology/">Measurement definitions</SiteLink>
        </p>
      </section>
    </div>
  );
}
