#!/usr/bin/env python3
"""Merge an exported real browser report with an actual native capture directory."""

import argparse, json, pathlib, hashlib, copy
from harness.collectors.macos import gpu_time


def read_lines(path):
    return (
        [json.loads(x) for x in path.read_text().splitlines() if x.strip()]
        if path.exists()
        else []
    )


def phase_at(t, events):
    return next(
        (
            e["phase"]
            for e in reversed(events)
            if e["type"] == "phase" and e["tMs"] <= t
        ),
        "pre-run baseline",
    )


def integrate(power, start, end):
    energy = covered = 0
    covered_end = start
    for p in sorted(power, key=lambda row: row["tMs"]):
        if p["combinedWatts"] is None:
            continue
        interval_end = min(end, p["tMs"])
        overlap = max(
            0, interval_end - max(start, covered_end, p["tMs"] - p["intervalMs"])
        )
        energy += p["combinedWatts"] * overlap / 1000
        covered += overlap
        if overlap:
            covered_end = interval_end
    return (energy if covered else None), covered


def combine(report, capture):
    profile = report["profile"]
    start = profile["startedEpochMs"]
    end = profile["totalMs"]
    cal = profile.get("clockCalibration")
    offset = cal["performanceEpochMs"] - cal["wallEpochMs"] if cal else 0
    meta = json.loads((capture / "collector-metadata.json").read_text())
    process_data = json.loads((capture / "processes.json").read_text())
    raw = [
        x
        for x in read_lines(capture / "native-samples.jsonl")
        if -5000 <= x["epochMs"] + offset - start <= end + 3000
    ]
    rawpower = [
        x
        for x in read_lines(capture / "power-samples.jsonl")
        if -6000 <= x["epochMs"] + offset - start <= end + 3000
    ]
    if not raw:
        raise ValueError(
            "No native samples overlap this report; refusing to attach another session"
        )
    points = []
    for x in raw:
        t = x["epochMs"] + offset - start
        h = x["host"]
        complete = x["incompleteCpuIntervals"] == 0
        points.append(
            {
                "tMs": t,
                "epochMs": x["epochMs"],
                "phase": phase_at(t, profile["events"]),
                "cpuOneCorePercent": x["cpuOneCorePercent"] if complete else None,
                "cpuCapacityPercent": x["cpuCapacityPercent"] if complete else None,
                "footprintBytes": x["footprintBytes"],
                "rssSumBytes": x["rssSumBytes"],
                "processCount": x["processCount"],
                "incompleteCpuIntervals": x["incompleteCpuIntervals"],
                "collectorCostMs": x["collectorCostMs"],
                **{
                    k: h.get(k)
                    for k in [
                        "hostGpuUtilizationPercent",
                        "hostGpuAllocatedBytes",
                        "hostSwapUsedBytes",
                        "hostMemoryPressureLevel",
                        "hostThermalState",
                    ]
                },
            }
        )
    power = [
        {
            k: x.get(k)
            for k in [
                "epochMs",
                "intervalMs",
                "cpuWatts",
                "gpuWatts",
                "aneWatts",
                "combinedWatts",
            ]
        }
        | {"tMs": x["epochMs"] + offset - start}
        for x in rawpower
    ]
    # A diagnostic sidecar has its own cadence. Keep it separate from CPU and
    # host GPU samples; do not join nearest timestamps or invent missing values.
    gpu_meta_path = capture / "gpu-probe-metadata.json"
    gpu_meta = json.loads(gpu_meta_path.read_text()) if gpu_meta_path.exists() else None
    if gpu_meta and (
        gpu_meta["rootPid"] != meta["rootPid"]
        or gpu_meta["rootStartId"] != meta["rootStartId"]
    ):
        raise ValueError("GPU capture belongs to a different browser process identity")
    gpu_raw = (
        read_lines(capture / "gpu-clients.jsonl")
        if gpu_meta
        else [
            x["gpuSnapshot"]
            for x in read_lines(capture / "native-samples.jsonl")
            if "gpuSnapshot" in x
        ]
    )
    gpu = gpu_time.aligned_series(gpu_raw, start, offset, end)
    base_energy, base_covered = integrate(power, -5000, 0)
    baseline = base_energy / (base_covered / 1000) if base_covered else None
    active_energy, covered = integrate(
        power, profile["activeStartedMs"] or 0, profile["activeEndedMs"] or 0
    )
    covariance = []

    def signal(id, label, scope, source, unit, available, reason):
        covariance.append(
            {
                "id": id,
                "label": label,
                "scope": scope,
                "source": source,
                "unit": unit,
                "status": "available" if available else "unavailable",
                "reason": reason,
            }
        )

    signal(
        "native-cpu",
        "Browser process-tree CPU",
        "Dedicated Chrome process tree",
        "libproc own CPU ticks → mach_timebase_info → interval delta",
        "percent (100 = one logical CPU)",
        any(p["cpuOneCorePercent"] is not None for p in points),
        meta["cpuNormalization"]
        + " Incomplete process intervals are null in charts; raw partial values retained.",
    )
    signal(
        "native-footprint",
        "Accounted process footprint",
        "Dedicated Chrome process tree",
        "libproc ri_phys_footprint / ri_resident_size",
        "bytes",
        any(p["footprintBytes"] is not None for p in points),
        meta["memorySemantics"],
    )
    signal(
        "host-gpu",
        "GPU activity",
        "Whole host",
        "ioreg AGXAccelerator Device Utilization %",
        "percent",
        any(p["hostGpuUtilizationPercent"] is not None for p in points),
        "Driver-reported device activity across all applications; sampling window is driver-defined. Not benchmark-only GPU use.",
    )
    signal(
        "chrome-gpu-time",
        "Chrome GPU time (experimental)",
        "Dedicated Chrome process tree",
        gpu_time.SOURCE,
        "milliseconds per elapsed second",
        any(
            p["gpuTimeMs"] is not None
            and p["startMs"] is not None
            and p["startMs"] >= 0
            and p["tMs"] <= end
            for p in gpu
        ),
        gpu_time.SEMANTICS
        if gpu
        else "This capture has no per-process GPU counters. The whole-machine reading cannot substitute for this signal; a fresh native capture is required.",
    )
    signal(
        "host-thermal",
        "Thermal pressure",
        "Whole host",
        "NSProcessInfo.thermalState",
        "category",
        any(p["hostThermalState"] is not None for p in points),
        "0 nominal, 1 fair, 2 serious, 3 critical. This is pressure, not temperature in degrees.",
    )
    signal(
        "host-memory",
        "Memory pressure and swap",
        "Whole host",
        "sysctl and vm_stat",
        "raw level / bytes",
        any(p["hostSwapUsedBytes"] is not None for p in points),
        "Host pressure level is a raw kernel category; swap is host-wide. Free pages are not total available/reclaimable memory.",
    )
    haspower = any(p["combinedWatts"] is not None for p in power)
    signal(
        "host-power",
        "Estimated CPU / GPU / ANE power",
        "Whole host subsystems",
        "powermetrics explicit mW/W output",
        "watts",
        haspower,
        "Estimated subsystem power across all applications, never model watts. Energy integrates observed interval overlap only."
        if haspower
        else "No usable powermetrics samples overlap this run. Requires administrator-authenticated bounded capture; absence is not zero watts.",
    )
    trace = {
        "version": "macos-native-trace-v1",
        "rootPid": meta["rootPid"],
        "logicalCpus": meta["logicalCpus"],
        "startedEpochMs": meta["startedEpochMs"],
        "endedEpochMs": meta.get("endedEpochMs", raw[-1]["epochMs"]),
        "clockAlignment": {
            "method": "Shared host epoch, calibrated browser performance clock, monotonic native interval deltas",
            "browserOffsetMs": offset,
            "maxNativeWallClockDriftMs": max(abs(x["wallClockDriftMs"]) for x in raw),
            "notes": "Browser phase/request times share the calibrated epoch. Power timestamps are line-buffered CLI header receipt times; delivery adds uncertainty. Native samples use actual timestamps, not assumed one-second spacing.",
        },
        "coverage": covariance,
        "points": points,
        "power": power,
        "energy": {
            "scope": "Host CPU+GPU+ANE subsystem estimate; not device wall power or model-attributed energy",
            "baselinePowerWatts": baseline,
            "activeEnergyJoules": active_energy,
            "coveredActiveMs": covered,
            "activeAboveBaselineJoules": active_energy - baseline * covered / 1000
            if active_energy is not None and baseline is not None
            else None,
            "note": "Five seconds of observed pre-run baseline when available. Integrate power over overlap with active time; missing intervals are not filled. Above-baseline energy is a host change, not causal attribution to the model.",
        },
        "provenance": {
            "collector": meta,
            "capturePath": str(capture),
            "powerCapture": json.loads((capture / "power-capture.json").read_text())
            if (capture / "power-capture.json").exists()
            else {"status": "capture not finalized"},
            "browserReportSha256": hashlib.sha256(
                json.dumps(report, sort_keys=True).encode()
            ).hexdigest(),
        },
        "rawSamples": raw,
        "rawPower": rawpower,
        "processes": process_data["processes"],
        "processEvents": process_data["events"],
    }
    trace["gpu"] = gpu
    trace["provenance"]["gpuTimeSemantics"] = gpu_time.SEMANTICS
    trace["provenance"]["gpuCapture"] = gpu_meta or {
        "source": "native-samples gpuSnapshot" if gpu_raw else "not captured"
    }
    trace["provenance"]["rawGpuSnapshots"] = [
        x for x in gpu_raw if -10000 <= x["epochMs"] + offset - start <= end + 3000
    ]
    validation_path = capture / "gpu-validation.json"
    if validation_path.exists():
        validation = json.loads(validation_path.read_text())
        if (
            validation["reportId"] != report["id"]
            or validation["rootPid"] != meta["rootPid"]
            or validation["rootStartId"] != meta["rootStartId"]
        ):
            raise ValueError("Metal validation belongs to a different browser capture")
        trace["gpuValidation"] = {
            k: validation[k]
            for k in [
                "source",
                "reportId",
                "targetPid",
                "counterMs",
                "commandBufferEnvelopeMs",
                "relativeDifference",
                "correlation",
                "note",
            ]
        }
        trace["provenance"]["gpuValidation"] = validation
    report["nativeTrace"] = trace
    return report


def compact_report(report, capture):
    """Preserve every plotted measurement; keep bulky raw evidence on disk.

    Long powermetrics text and per-process snapshots exceed browser storage.
    The full merged export and the raw capture remain the audit record.
    """
    result = copy.deepcopy(report)
    trace = result["nativeTrace"]
    trace["provenance"]["rawEvidenceFiles"] = {
        name: {
            "path": str((capture / name).resolve()),
            "sha256": hashlib.sha256((capture / name).read_bytes()).hexdigest(),
            "bytes": (capture / name).stat().st_size,
        }
        for name in [
            "native-samples.jsonl",
            "power-samples.jsonl",
            "power-raw.log",
            "collector-metadata.json",
            "processes.json",
            "power-capture.json",
            "gpu-clients.jsonl",
        ]
        if (capture / name).exists()
    }
    trace["provenance"]["browserStorageCopy"] = {
        "omittedRawNativeSamples": len(trace["rawSamples"]),
        "omittedRawPowerFrames": len(trace["rawPower"]),
        "omittedRawGpuSnapshots": len(trace["provenance"].get("rawGpuSnapshots", [])),
        "note": "Every chart point and interval is retained. Raw process snapshots, GPU counters and powermetrics text remain in the hashed local capture files; this browser-storage copy omits their duplicate raw payloads.",
    }
    trace["rawSamples"] = []
    trace["rawPower"] = []
    trace["provenance"].pop("rawGpuSnapshots", None)
    return result


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("report")
    a.add_argument("capture")
    a.add_argument("output")
    a.add_argument(
        "--compact",
        action="store_true",
        help="Keep all measured series, referencing hashed raw files instead of duplicating them in browser storage",
    )
    args = a.parse_args()
    capture = pathlib.Path(args.capture)
    r = combine(json.loads(pathlib.Path(args.report).read_text()), capture)
    if args.compact:
        r = compact_report(r, capture)
    pathlib.Path(args.output).write_text(json.dumps(r, indent=2) + "\n")
    print(
        json.dumps(
            {
                "id": r["id"],
                "status": r["status"],
                "nativeSamples": len(r["nativeTrace"]["points"]),
                "powerSamples": len(r["nativeTrace"]["power"]),
                "output": args.output,
            }
        )
    )
