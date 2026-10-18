#!/usr/bin/env python3
"""Snapshot and audit native evidence. Publication is a separate explicit step."""

import json, pathlib, time, sys, copy
from harness.processing.merge_native_report import combine, compact_report, integrate

ROOT = pathlib.Path(__file__).resolve().parents[2]


def read_json(p):
    p = pathlib.Path(p)
    for attempt in range(20):
        try:
            return json.loads(p.read_text())
        except json.JSONDecodeError:
            if attempt == 19:
                raise
            time.sleep(0.05)


def lines(p):
    if not p.exists():
        return []
    data = p.read_text().splitlines(keepends=True)
    result = []
    for i, line in enumerate(data):
        if not line.strip():
            continue
        try:
            result.append(json.loads(line))
        except json.JSONDecodeError:
            if i != len(data) - 1 or line.endswith("\n"):
                raise
    return result


def finalize(report_path, capture_path):
    report = read_json(report_path)
    source = pathlib.Path(capture_path).resolve()
    target = pathlib.Path(report_path).resolve().parent / "capture"
    existing = target.parent / "session-audit.json"
    if existing.exists():
        return read_json(existing)
    target.mkdir(exist_ok=True)
    p = report["profile"]
    cal = p.get("clockCalibration")
    offset = cal["performanceEpochMs"] - cal["wallEpochMs"] if cal else 0
    start = p["startedEpochMs"] - offset
    end = start + p["totalMs"]
    for name in [
        "collector-metadata.json",
        "processes.json",
        "session.json",
        "gpu-probe-metadata.json",
    ]:
        if (source / name).exists():
            (target / name).write_text(
                json.dumps(read_json(source / name), indent=2) + "\n"
            )
    for name in ["native-samples.jsonl", "power-samples.jsonl", "gpu-clients.jsonl"]:
        rows = [
            x
            for x in lines(source / name)
            if start - 10000 <= x["epochMs"] <= end + 3000
        ]
        (target / name).write_text(
            "".join(json.dumps(x, separators=(",", ":")) + "\n" for x in rows)
        )
    (target / "power-capture.json").write_text(
        json.dumps(
            {
                "status": "immutable per-report snapshot",
                "sourceCapture": str(source),
                "capturedAt": time.time() * 1000,
                "control": read_json(source / "capture-control.json"),
            },
            indent=2,
        )
        + "\n"
    )
    merged = combine(copy.deepcopy(report), target)
    (target.parent / "combined-report-full.json").write_text(
        json.dumps(merged, indent=2) + "\n"
    )
    compact = compact_report(merged, target)
    # Public provenance uses repository-relative evidence paths, not user home paths.
    provenance = compact["nativeTrace"]["provenance"]
    provenance["capturePath"] = str(target.relative_to(ROOT))
    for evidence in provenance.get("rawEvidenceFiles", {}).values():
        evidence["path"] = str(pathlib.Path(evidence["path"]).relative_to(ROOT))
    measured = [s for s in report["samples"] if not s["warmup"]]
    phases = [e for e in p["events"] if e["type"] == "phase" and e["phase"] == "active"]
    windows = []
    for i, phase in enumerate(phases):
        stop = (
            phases[i + 1]["tMs"]
            if i + 1 < len(phases)
            else p["activeEndedMs"] or p["totalMs"]
        )
        rows = [s for s in measured if phase["tMs"] <= s.get("startedMs", -1) < stop]
        windows.append(
            {
                "completed": len(rows),
                "valid": sum(s["valid"] for s in rows),
                "maxInternalGapMs": max(
                    [
                        rows[j]["startedMs"] - rows[j - 1]["endedMs"]
                        for j in range(1, len(rows))
                    ]
                    or [0]
                ),
            }
        )
    gaps = [
        measured[i + 1]["startedMs"] - measured[i]["endedMs"]
        for i in [19, 39]
        if len(measured) > i + 1
    ]
    native = compact["nativeTrace"]
    power = [x for x in native["power"] if x["combinedWatts"] is not None]
    points = native["points"]
    _, covered = integrate(power, 0, p["totalMs"])
    coverage_percent = 100 * covered / p["totalMs"] if p["totalMs"] else 0
    coverage = coverage_percent >= 99 and bool(
        power
        and points
        and min(x["tMs"] for x in power) <= 1000
        and max(x["tMs"] for x in power) >= p["totalMs"] - 3000
        and max(x["tMs"] for x in points) >= p["totalMs"] - 3000
    )
    audited = (
        report["status"] == "complete"
        and p["unloadConfirmed"]
        and len(measured) == 60
        and len(windows) == 3
        and all(w["valid"] == 20 for w in windows)
        and len(gaps) == 2
        and min(gaps) >= 90000
    )
    audit = {
        "reportId": report["id"],
        "model": report["model"],
        "status": report["status"],
        "windows": windows,
        "idleGapMs": gaps,
        "validMeasured": sum(s["valid"] for s in measured),
        "unloadConfirmed": p["unloadConfirmed"],
        "protocolPassed": audited,
        "nativeAndPowerFullSpan": coverage,
        "nativeSamples": len(points),
        "powerSamples": len(power),
        "observedPowerCoveragePercent": coverage_percent,
    }
    (target.parent / "session-audit.json").write_text(
        json.dumps(audit, indent=2) + "\n"
    )
    (target.parent / "combined-report.json").write_text(
        json.dumps(compact, indent=2) + "\n"
    )
    return audit


if __name__ == "__main__":
    print(json.dumps(finalize(sys.argv[1], sys.argv[2])))
