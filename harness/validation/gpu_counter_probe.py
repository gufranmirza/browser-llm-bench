#!/usr/bin/env python3
"""Bounded read-only AGX counter capture for one verified Chrome process tree.
Driver counters are raw evidence; they are not GPU capacity percentages.
"""

import argparse, json, pathlib, plistlib, re, time
from harness.collectors.macos.native_collector import (
    command,
    usage,
    process_table,
    descendant_pids,
    process_args,
)


def read_clients(allowed):
    t0 = time.monotonic_ns()
    clients = plistlib.loads(
        command(["/usr/sbin/ioreg", "-a", "-r", "-c", "AGXDeviceUserClient"])
    )
    result = []
    for client in clients:
        creator = client.get("IOUserClientCreator", "")
        match = re.match(r"pid (\d+),", creator)
        if not match or int(match[1]) not in allowed:
            continue
        result.append(
            {
                "registryId": str(client["IORegistryEntryID"]),
                "pid": int(match[1]),
                "creator": creator,
                "usage": client.get("AppUsage"),
            }
        )
    t1 = time.monotonic_ns()
    return {
        "epochMs": time.time() * 1000,
        "monotonicNs": str((t0 + t1) // 2),
        "collectionCostMs": (t1 - t0) / 1e6,
        "clients": result,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--pid", type=int, required=True)
    p.add_argument("--profile", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--seconds", type=int, default=110)
    a = p.parse_args()
    if "--user-data-dir=" + str(pathlib.Path(a.profile).resolve()) not in process_args(
        a.pid
    ):
        raise RuntimeError("Root is not the dedicated profile")
    start_id = usage(a.pid)["startId"]
    out = pathlib.Path(a.output)
    out.mkdir(parents=True, exist_ok=True)
    meta = {
        "source": "ioreg AGXDeviceUserClient",
        "rootPid": a.pid,
        "rootStartId": start_id,
        "startedEpochMs": time.time() * 1000,
        "semantics": "Raw undocumented AppUsage accumulatedGPUTime, not GPU capacity or model-only utilization. Counter units to be validated against Metal System Trace.",
        "sampleIntervalMs": 500,
    }
    (out / "gpu-probe-metadata.json").write_text(json.dumps(meta, indent=2) + "\n")
    start = time.monotonic()
    tick = 0
    with (out / "gpu-clients.jsonl").open("w", buffering=1) as f:
        while time.monotonic() - start < a.seconds and not (out / "STOP-GPU").exists():
            if usage(a.pid)["startId"] != start_id:
                raise RuntimeError("Root PID reused")
            ids = descendant_pids(process_table(), a.pid, {})
            row = read_clients(ids)
            row["processStartIds"] = {str(pid): usage(pid)["startId"] for pid in ids}
            f.write(json.dumps(row, separators=(",", ":")) + "\n")
            tick += 1
            time.sleep(max(0, start + tick * 0.5 - time.monotonic()))
    meta["endedEpochMs"] = time.time() * 1000
    meta["samples"] = tick
    (out / "gpu-probe-metadata.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps(meta), flush=True)


if __name__ == "__main__":
    main()
