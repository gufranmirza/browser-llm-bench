import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { planFor } from "../../src/benchmark/protocol/schedule";
import { runnableModels } from "../../src/benchmark/runtime/catalog";
import type { Report } from "../../src/benchmark/schemas/report";
import type { BrowserCapabilities } from "../../src/features/capabilities/detect";
import { detectBrowserCapabilities } from "../../src/features/capabilities/detect";
import { useBenchmark } from "../../src/features/runner/useBenchmark";
import "../../src/styles/base.css";
import type { Preset } from "./config";
import "./console.css";
type Status = {
  preset: Preset;
  saved: { id: string; model: string; file: string }[];
  fresh: boolean;
  remainingMs: number;
  jobDir: string;
};
function Console() {
  const [status, setStatus] = useState<Status | null>(null),
    [running, setRunning] = useState(false),
    [message, setMessage] = useState("Checking local harness…"),
    [index, setIndex] = useState(0),
    [capabilities, setCapabilities] = useState<BrowserCapabilities>(),
    [saving, setSaving] = useState(false);
  const busy = useRef(false),
    persisted = useRef(new Set<string>());
  const bench = useBenchmark((report) => {
    if (persisted.current.has(report.id)) return;
    persisted.current.add(report.id);
    setSaving(true);
    void save(report);
  });
  async function save(report: Report) {
    try {
      const response = await fetch("/__harness/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setMessage(
        `Saved ${report.model}: ${report.status}. Repository publishing is a separate command.`,
      );
      if (report.status !== "complete") setRunning(false);
      else setIndex((i) => i + 1);
    } catch (e) {
      setMessage(String(e));
      setRunning(false);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  useEffect(() => {
    void detectBrowserCapabilities().then(setCapabilities);
    const tick = () =>
      void fetch("/__harness/status")
        .then((r) => r.json())
        .then(setStatus)
        .catch((e) => setMessage(String(e)));
    tick();
    const timer = setInterval(tick, 3000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!running || !status || busy.current || saving) return;
    if (index >= status.preset.models.length) {
      setMessage(
        "Queue complete. Captures and reports are saved locally; review audits before publishing.",
      );
      setRunning(false);
      return;
    }
    if (
      status.preset.requirePower &&
      (!status.fresh ||
        status.remainingMs <
          planFor(status.preset.workload, status.preset.mode).totalLimitMs +
            5000)
    ) {
      setMessage(
        "Waiting for fresh power capture. Run npm run harness:capture in Terminal.",
      );
      return;
    }
    if (document.hidden) {
      setMessage(
        "Bring this dedicated Chrome tab to the foreground to start the next model.",
      );
      return;
    }
    busy.current = true;
    const p = status.preset;
    setMessage(`Running ${p.models[index]}`);
    bench.run(
      p.workload,
      p.mode,
      p.profiling,
      p.deviceLabel,
      p.models[index],
      p.settings,
      capabilities,
    );
  }, [running, status, index, saving]);
  return (
    <main className="harness-console">
      <p className="section-kicker">LOCAL NATIVE HARNESS</p>
      <h1>{status?.preset.name ?? "Browser benchmark"}</h1>
      <p>
        This console exists only on the loopback harness server. Runs save to
        artifacts; publishing requires a separate command.
      </p>
      <p role="status">{message}</p>
      <div className="panel">
        <strong>
          {bench.phase} · {bench.completed} measured requests
        </strong>
        <progress value={bench.progress} max={1} />
        <p>
          {bench.elapsed
            ? `${Math.round(bench.elapsed / 1000)} seconds elapsed`
            : "Ready"}
        </p>
        <button
          disabled={running || saving || !status}
          onClick={() => {
            setIndex(0);
            setRunning(true);
          }}
        >
          Start queue
        </button>{" "}
        <button
          disabled={!running}
          onClick={() => {
            setRunning(false);
            bench.stop();
          }}
        >
          Stop queue
        </button>
        <pre>{bench.output}</pre>
      </div>
      <ol>
        {status?.preset.models.map((id, i) => (
          <li key={id}>
            <strong>
              {runnableModels.find((m) => m.id === id)?.name ?? id}
            </strong>{" "}
            · {id} {i < index ? "✓ saved" : ""}
          </li>
        ))}
      </ol>
      <p>
        Output directory: <code>{status?.jobDir}</code>
      </p>
      <a href="/">Open static leaderboard</a>
    </main>
  );
}
createRoot(document.getElementById("harness-root")!).render(<Console />);
