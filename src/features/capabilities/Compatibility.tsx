"use client";
import { ArrowUpRight, Info } from "lucide-react";
import type { Report } from "../../benchmark/schemas/report";
import { Button } from "../../components/ui/button";

import { Status } from "../../components/Status";
export type CompatibilityEvidence = Pick<
  Report,
  "model" | "runtime" | "status"
> & { environment: Pick<Report["environment"], "deviceLabel"> };
export function Compatibility({
  reports,
  onRun,
}: {
  reports: CompatibilityEvidence[];
  onRun: () => void;
}) {
  const local = reports[0];
  return (
    <>
      <div className="section-kicker">CAPABILITY IS NOT A GUARANTEE</div>
      <div className="page-heading">
        <div>
          <h1>Will it run?</h1>
          <p>Keep unsupported, untested and failed configurations distinct.</p>
        </div>
        <Button onClick={onRun}>
          Test this browser <ArrowUpRight size={15} />
        </Button>
      </div>
      <div className="dataset-notice">
        <Info size={16} />
        <span>
          This matrix shows implementation coverage. Browser and device
          compatibility requires an actual local run.
        </span>
      </div>
      <div className="panel table-wrap compatibility">
        <table>
          <thead>
            <tr>
              <th>Runtime / model</th>
              <th>Latest saved report</th>
              <th>Other desktop browsers</th>
              <th>Mobile browsers</th>
              <th>Runner</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>{local?.runtime ?? "WebLLM / WebGPU"}</strong>
                <small>{local?.model ?? "Pinned WebGPU artifacts"}</small>
              </td>
              <td>
                <Status value={local ? local.status : "Untested"} />
                <small>
                  {local
                    ? local.environment.deviceLabel + " · inspect environment"
                    : "No recorded run"}
                </small>
              </td>
              <td>
                <Status value="Untested" />
              </td>
              <td>
                <Status value="Untested" />
              </td>
              <td>
                <span className="badge green">Implemented</span>
              </td>
            </tr>
            {["Transformers.js / ONNX · WebGPU"].map((n) => (
              <tr key={n}>
                <td>
                  <strong>{n}</strong>
                  <small>Future runtime adapter</small>
                </td>
                <td>
                  <Status value="Untested" />
                </td>
                <td>
                  <Status value="Untested" />
                </td>
                <td>
                  <Status value="Untested" />
                </td>
                <td>
                  <span className="badge">Planned</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="definition-grid">
        {[
          [
            "Complete",
            "A run finished and passed basic output validity checks. This is not a task-accuracy score.",
          ],
          [
            "Unsupported",
            "A required capability is absent. For this artifact, that includes WebGPU and shader-f16.",
          ],
          [
            "Untested",
            "No evidence exists for this exact configuration. It is not assumed to work or fail.",
          ],
          [
            "Failed",
            "A supported configuration was attempted but initialization, generation, or output validation failed.",
          ],
        ].map(([t, d]) => (
          <section className="panel" key={t}>
            <Status value={t} />
            <p>{d}</p>
          </section>
        ))}
      </div>
      <section className="panel prompt-panel">
        <h2>The environment is part of the result.</h2>
        <p>
          Compare exact model revision, quantization, runtime version, browser
          version, OS, device and protocol together. A successful run on one
          machine does not establish support on another. Device labels are user
          supplied; browser and OS identity are recorded using the browser’s
          user agent and may be reduced.
        </p>
      </section>
    </>
  );
}
