"use client";
import { ChevronRight, Monitor, Play } from "lucide-react";
import { useState } from "react";
import type { Report } from "../../benchmark/schemas/report";
import { SiteLink } from "../../components/SiteLink";
import { ProviderLogo } from "../../components/ProviderLogo";
import live from "../../benchmark/runtime/catalog";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";

import { Status } from "../../components/Status";
export function LocalReports({ reports }: { reports: Report[] }) {
  const [filter, setFilter] = useState("all");
  const filtered = reports.filter(
    (r) => filter === "all" || r.status === filter,
  );
  return (
    <>
      {!reports.length ? (
        <div className="empty local-empty">
          <div className="empty-icon">
            <Monitor size={30} />
          </div>
          <h2>No local reports yet</h2>
          <p>Run a benchmark on this device or import a saved JSON report.</p>
          <Button asChild>
            <SiteLink href="/run/">
              <Play size={15} />
              Run benchmark
            </SiteLink>
          </Button>
        </div>
      ) : (
        <>
          <div className="section-title">
            <div>
              <span className="section-number">01 /</span>
              <h2>Saved reports</h2>
            </div>
            <label>
              Status{" "}
              <Select
                label="Local result status"
                value={filter}
                onValueChange={setFilter}
                options={[
                  "all",
                  "complete",
                  "failed",
                  "cancelled",
                  "interrupted",
                  "unsupported",
                ].map((value) => ({
                  value,
                  label:
                    value === "all"
                      ? "All outcomes"
                      : value[0].toUpperCase() + value.slice(1),
                }))}
              />
            </label>
          </div>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Model / device</th>
                  <th>Workload</th>
                  <th>Model load</th>
                  <th>First-output latency¹</th>
                  <th>Generation speed¹</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const s = r.samples.find((s) => !s.warmup);
                  const model = live.models.find((m) => m.id === r.model);
                  return (
                    <tr key={r.id}>
                      <td>
                        <SiteLink
                          className="model-link"
                          href={`/local-report/${r.id}`}
                        >
                          <ProviderLogo
                            family={model?.family ?? "Model"}
                            model={model?.name}
                          />
                          <span>
                            <strong>{model?.name ?? r.model}</strong>
                            <small>{r.environment.deviceLabel}</small>
                            <small>
                              {new Date(r.createdAt).toLocaleString()} ·{" "}
                              {r.id.slice(0, 8)}
                            </small>
                          </span>
                        </SiteLink>
                      </td>
                      <td>{r.workload}</td>
                      <td>
                        {r.loadMs === null
                          ? "—"
                          : (r.loadMs / 1000).toFixed(2) + " s"}
                      </td>
                      <td>{s?.firstOutputMs?.toFixed(0) ?? "—"} ms</td>
                      <td>
                        {s?.decodeTokensPerSecond?.toFixed(1) ?? "—"} tok/s
                      </td>
                      <td>
                        <Status value={r.status} />
                      </td>
                      <td>
                        <Button variant="ghost" size="icon" asChild>
                          <SiteLink
                            href={`/local-report/${r.id}`}
                            aria-label={`View ${model?.name ?? "model"} report ${r.id.slice(0, 8)}`}
                          >
                            <ChevronRight size={16} />
                          </SiteLink>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="table-footer">
              ¹ First measured request, not an aggregate. Inspect each run for
              all samples and exact environment.
            </div>
          </div>
          {!filtered.length && (
            <div className="empty">No reports with this status.</div>
          )}
        </>
      )}
    </>
  );
}
