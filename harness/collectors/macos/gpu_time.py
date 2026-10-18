"""Experimental AGX driver-accounted GPU time, scoped to verified processes.

AppUsage is an undocumented driver property. Its counter behaves approximately
like nanoseconds of command-buffer spans on the locally traced M5 Pro. It is
not active shader time, GPU capacity, or model-only utilization. Preserve raw
values, and invalidate intervals when identities or counters are discontinuous.
"""

import plistlib
import re
import subprocess
import time

SOURCE = "ioreg AGXDeviceUserClient AppUsage.accumulatedGPUTime (experimental)"
SEMANTICS = (
    "Driver-accounted command-buffer time for the dedicated Chrome process tree, "
    "including browser rendering. Approximate nanosecond accounting, not shader "
    "occupancy, reserved GPU cores, or model-only utilization. Concurrent queues "
    "may overlap, so time per second is not a capacity percentage. Undocumented "
    "Apple driver property: availability and semantics may change. Client/PID "
    "changes, queue changes, regressions and read failures create gaps. AppUsage "
    "has no stable queue identifiers; positional continuity checks are best effort."
)


def scoped_clients(entries, identities):
    result = []
    for client in entries:
        creator = client.get("IOUserClientCreator", "")
        match = re.match(r"pid (\d+),", creator)
        if not match or match[1] not in identities:
            continue
        result.append(
            {
                "registryId": str(client["IORegistryEntryID"]),
                "pid": int(match[1]),
                "creator": creator,
                "usage": client.get("AppUsage"),
            }
        )
    return result


def snapshot(identities, verify_identity=None):
    begin = time.monotonic_ns()
    error = None
    clients = []
    try:
        p = subprocess.run(
            ["/usr/sbin/ioreg", "-a", "-r", "-c", "AGXDeviceUserClient"],
            capture_output=True,
            timeout=3,
            check=True,
        )
        clients = scoped_clients(plistlib.loads(p.stdout), identities)
        if verify_identity:
            for pid in {c["pid"] for c in clients}:
                if verify_identity(pid) != identities[str(pid)]:
                    raise ValueError("GPU process identity changed during driver read")
    except Exception as e:
        error = "GPU driver read failed: " + str(e)
    end = time.monotonic_ns()
    return {
        "epochMs": time.time() * 1000,
        "monotonicNs": str(end),
        "collectionCostMs": (end - begin) / 1e6,
        "clients": clients,
        "processStartIds": identities,
        "error": error,
    }


def interval(before, after):
    result = {
        "epochMs": after["epochMs"],
        "startEpochMs": before["epochMs"] if before else None,
        "intervalMs": None,
        "gpuTimeMs": None,
        "clientCount": len(after["clients"]),
        "collectionCostMs": after["collectionCostMs"],
        "issues": [],
    }
    issues = result["issues"]
    if not before:
        issues.append("First observation; no complete counter interval")
        return result
    elapsed = (int(after["monotonicNs"]) - int(before["monotonicNs"])) / 1e6
    result["intervalMs"] = elapsed if elapsed > 0 else None
    if elapsed <= 0 or elapsed > 5000:
        issues.append("Invalid or missed sampling interval")
    if abs(after["epochMs"] - before["epochMs"] - elapsed) > 50:
        issues.append("Wall clock discontinuity")
    if before.get("error") or after.get("error"):
        issues.append(before.get("error") or after["error"])
    old = {c["registryId"]: c for c in before["clients"]}
    new = {c["registryId"]: c for c in after["clients"]}
    if old.keys() != new.keys():
        issues.append("GPU client set changed")
    delta = 0
    counters = 0
    for key, c in new.items():
        a = old.get(key)
        pid = str(c["pid"])
        identity = after["processStartIds"].get(pid)
        if (
            not a
            or a["pid"] != c["pid"]
            or not identity
            or before["processStartIds"].get(pid) != identity
        ):
            issues.append("New or reused GPU PID/client")
            continue
        left, right = a.get("usage"), c.get("usage")
        if not isinstance(left, list) or not isinstance(right, list):
            issues.append("GPU accounting property unavailable")
            continue
        if len(left) != len(right):
            issues.append("GPU queue set changed")
            continue
        for x, y in zip(left, right):
            # No queue ID is provided. Check API, both monotonic counters and
            # positional continuity; do not silently subtract different queues.
            fields = ("accumulatedGPUTime", "lastSubmittedTime")
            if (
                not x.get("API")
                or x.get("API") != y.get("API")
                or any(
                    type(r.get(f)) is not int or r[f] < 0
                    for r in (x, y)
                    for f in fields
                )
                or any(y[f] < x[f] for f in fields)
            ):
                issues.append("Missing, regressed or reordered GPU queue counter")
                continue
            delta += y["accumulatedGPUTime"] - x["accumulatedGPUTime"]
            counters += 1
    if not counters:
        issues.append("No continuous GPU accounting counters exposed")
    result["issues"] = sorted(set(issues))
    if not issues:
        result["gpuTimeMs"] = delta / 1e6
    return result


def aligned_series(samples, browser_start, offset, duration):
    """Keep actual interval boundaries; never interpolate at run/phase edges."""
    out = []
    previous = None
    for row in samples:
        value = interval(previous, row)
        previous = row
        t = value["epochMs"] + offset - browser_start
        if -5000 <= t <= duration + 3000:
            start = value.pop("startEpochMs")
            out.append(
                {
                    **value,
                    "tMs": t,
                    "startMs": start + offset - browser_start
                    if start is not None
                    else None,
                }
            )
    return out
