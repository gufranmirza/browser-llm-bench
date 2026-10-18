#!/usr/bin/env python3
"""Align raw driver counter deltas with a real saved browser report.
No utilization conversion or interpolation at request/phase boundaries.
"""

import argparse, json, pathlib


def total(client):
    rows = client.get("usage")
    if not isinstance(rows, list):
        return None
    values = [x.get("accumulatedGPUTime") for x in rows]
    return sum(values) if all(isinstance(v, int) and v >= 0 for v in values) else None


def analyze(report, samples):
    p = report["profile"]
    start = p["startedEpochMs"]
    cal = p["clockCalibration"]
    offset = cal["performanceEpochMs"] - cal["wallEpochMs"]
    out = []
    for before, after in zip(samples, samples[1:]):
        left = before["epochMs"] + offset - start
        right = after["epochMs"] + offset - start
        old = {c["registryId"]: c for c in before["clients"]}
        new = {c["registryId"]: c for c in after["clients"]}
        delta = 0
        issues = []
        if old.keys() != new.keys():
            issues.append("GPU client set changed")
        for key, c in new.items():
            a = old.get(key)
            pid = str(c["pid"])
            if (
                not a
                or a["pid"] != c["pid"]
                or before["processStartIds"].get(pid)
                != after["processStartIds"].get(pid)
            ):
                issues.append("New or reused PID/client")
                continue
            x = total(a)
            y = total(c)
            if x is None or y is None or y < x:
                issues.append("Missing or regressed counter")
                continue
            if len(a.get("usage") or []) != len(c.get("usage") or []):
                issues.append("Queue set changed")
                continue
            delta += y - x
        phase = next(
            (
                e["phase"]
                for e in reversed(p["events"])
                if e["type"] == "phase" and e["tMs"] <= right
            ),
            "baseline",
        )
        boundary = any(
            e["type"] == "phase" and left < e["tMs"] < right for e in p["events"]
        )
        out.append(
            {
                "startMs": left,
                "endMs": right,
                "phaseAtEnd": phase,
                "crossesPhaseBoundary": boundary,
                "counterDeltaRaw": None if issues else delta,
                "issues": list(set(issues)),
                "insideBrowserRun": left >= 0 and right <= p["totalMs"],
            }
        )
    summary = {}
    for phase in sorted({x["phaseAtEnd"] for x in out}):
        selected = [
            x
            for x in out
            if x["insideBrowserRun"]
            and not x["crossesPhaseBoundary"]
            and x["phaseAtEnd"] == phase
            and x["counterDeltaRaw"] is not None
        ]
        summary[phase] = {
            "completeIntervals": len(selected),
            "observedMs": sum(x["endMs"] - x["startMs"] for x in selected),
            "counterDeltaRaw": sum(x["counterDeltaRaw"] for x in selected),
            "nonzeroIntervals": sum(x["counterDeltaRaw"] > 0 for x in selected),
        }
    return {
        "reportId": report["id"],
        "status": report["status"],
        "measuredRequests": len([s for s in report["samples"] if not s["warmup"]]),
        "units": "Raw undocumented driver counter; candidate nanoseconds, pending Metal trace comparison",
        "phaseSummary": summary,
        "intervals": out,
    }


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("directory")
    v = a.parse_args()
    d = pathlib.Path(v.directory)
    r = analyze(
        json.loads((d / "browser-report.json").read_text()),
        [json.loads(x) for x in (d / "gpu-clients.jsonl").read_text().splitlines()],
    )
    (d / "counter-analysis.json").write_text(json.dumps(r, indent=2) + "\n")
    print(json.dumps({k: v for k, v in r.items() if k != "intervals"}, indent=2))
