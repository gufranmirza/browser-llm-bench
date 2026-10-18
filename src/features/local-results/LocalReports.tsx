"use client";
import { ChevronRight, Monitor, Play, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { Report } from "../../benchmark/schemas/report";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";

import { Status } from "../../components/Status";
export function LocalReports({
  reports,
  onSelect,
  onRun,
}: {
  reports: Report[];
  onSelect: (r: Report) => void;
  onRun: () => void;
}) {
  const [filter, setFilter] = useState("all");
  const filtered = reports.filter(
    (r) => filter === "all" || r.status === filter,
  );
  return (
    <>
      <div className="dataset-notice local">
        <ShieldCheck size={16} />
        <span>
          <strong>Saved benchmark evidence.</strong> Published reports load from
          the repository automatically. Local and imported reports stay on your
          device. No metrics are pooled across devices or workloads.
        </span>
      </div>
      {!reports.length ? (
        <div className="empty local-empty">
          <div className="empty-icon">
            <Monitor size={30} />
          </div>
          <span className="section-kicker">A CLEAN SLATE</span>
          <h2>Your first measurement starts here.</h2>
          <p>
            Choose a pinned WebLLM model to run in this browser,
            <br />
            or import a compatible JSON report from another device.
          </p>
          <Button onClick={onRun}>
            <Play size={15} />
            Run your first benchmark
          </Button>
        </div>
      ) : (
        <>
          <div className="section-title">
            <div>
              <span className="section-number">01 /</span>
              <h2>Your measurement log</h2>
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
                  <th>Run / device</th>
                  <th>Workload</th>
                  <th>Engine ready</th>
                  <th>First output¹</th>
                  <th>Decode¹</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const s = r.samples.find((s) => !s.warmup);
                  return (
                    <tr key={r.id}>
                      <td>
                        <button
                          className="model-link"
                          onClick={() => onSelect(r)}
                        >
                          <span>
                            <strong>{r.environment.deviceLabel}</strong>
                            <small>
                              {new Date(r.createdAt).toLocaleString()} ·{" "}
                              {r.id.slice(0, 8)}
                            </small>
                          </span>
                        </button>
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
                        <button
                          className="icon-button"
                          aria-label={`Inspect run ${r.id.slice(0, 8)}`}
                          onClick={() => onSelect(r)}
                        >
                          <ChevronRight size={16} />
                        </button>
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
