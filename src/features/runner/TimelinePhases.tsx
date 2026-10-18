"use client";
import { phaseLabels, timelineWindow } from "../../benchmark/metrics/timeline";
import type { Profile } from "../../benchmark/schemas/profile";

export function TimelinePhases({
  profile,
  live = false,
}: {
  profile: Profile;
  live?: boolean;
}) {
  const window = timelineWindow(profile, live);
  return (
    <div className="timeline-context">
      <p>
        <strong>0s = browser run started.</strong> Every resource graph uses the
        same 0–{window.end.toFixed(2)}s axis, including setup, inference and
        cleanup{live ? " so far" : " until the browser run stopped"}.
      </p>
      <ol className="profile-phases" aria-label="Browser run phase intervals">
        {window.phases.map((p, i) => (
          <li
            key={i}
            style={{
              borderTop: `3px solid ${p.phase === "active" ? "var(--chart-1)" : p.phase === "warmup" ? "var(--chart-3)" : "var(--chart-grid)"}`,
            }}
          >
            <strong>{phaseLabels[p.phase]}</strong>
            <span>
              {(p.startMs / 1000).toFixed(2)}–{(p.endMs / 1000).toFixed(2)}s
            </span>
          </li>
        ))}
      </ol>
      <p className="metric-footnote">
        Blue shading marks measured inference; violet marks warmup. Baseline,
        model loading and cleanup are outside the measured inference duration.
      </p>
    </div>
  );
}
