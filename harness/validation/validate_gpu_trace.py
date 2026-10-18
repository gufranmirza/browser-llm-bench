#!/usr/bin/env python3
"""Compare actual PID-scoped counters with exported Metal GPU intervals.

Usage: python3 scripts/validate_gpu_trace.py CAPTURE_DIRECTORY
Inputs: trace-toc.xml, time-info.xml, gpu-intervals.xml, gpu-clients.jsonl,
gpu-probe-metadata.json and browser-report.json. Export the XML with xctrace.
This compares command-buffer envelopes, not shader busy time or GPU capacity.
"""

import argparse
import hashlib
import json
import math
import pathlib
import xml.etree.ElementTree as E
from decimal import Decimal
from harness.collectors.macos.gpu_time import interval


def gpu_rows(path, pid):
    cache = {}

    def decode(e):
        if e.get("ref"):
            return cache[e.get("ref")]
        v = {"text": e.text, "fmt": e.get("fmt"), "tag": e.tag}
        children = [decode(c) for c in e]
        if e.tag == "process":
            v["pid"] = next((c["text"] for c in children if c["tag"] == "pid"), None)
        if e.get("id"):
            cache[e.get("id")] = v
        return v

    # XML references reuse prior objects. Decode every row, including rows from
    # other applications, but retain only the explicitly attached GPU PID.
    for _, e in E.iterparse(path, events=["end"]):
        if e.tag != "row":
            continue
        v = [decode(c) for c in e]
        if v[10].get("pid") == str(pid) and v[7]["fmt"] == "Active":
            yield {
                "start": int(v[0]["text"]),
                "duration": int(v[1]["text"]),
                "commandBuffer": v[15]["text"],
            }
        e.clear()


def validate(directory):
    toc = E.parse(directory / "trace-toc.xml").getroot()
    pid = int(toc.find("./run/info/target/process").get("pid"))
    duration_ns = float(toc.findtext("./run/info/summary/duration")) * 1e9
    epoch_ns = int(
        Decimal(E.parse(directory / "time-info.xml").findtext(".//time-since-epoch"))
        * 10**9
    )
    rows = list(gpu_rows(directory / "gpu-intervals.xml", pid))
    envelopes = {}
    for r in rows:
        if r["commandBuffer"] is None:
            raise ValueError("Missing command-buffer identity")
        start, end = r["start"], r["start"] + r["duration"]
        old = envelopes.get(r["commandBuffer"], (start, end))
        envelopes[r["commandBuffer"]] = (min(start, old[0]), max(end, old[1]))
    report = json.loads((directory / "browser-report.json").read_text())
    meta = json.loads((directory / "gpu-probe-metadata.json").read_text())
    raw = [
        json.loads(s)
        for s in (directory / "gpu-clients.jsonl").read_text().splitlines()
        if s.strip()
    ]
    # Validate exactly the traced process; another Chrome window, WindowServer,
    # and Codex appear in Metal's export and must not contribute to these totals.
    for r in raw:
        r["clients"] = [c for c in r["clients"] if c["pid"] == pid]
    pairs = []
    for before, after in zip(raw, raw[1:]):
        value = interval(before, after)
        left = float(Decimal(str(before["epochMs"])) * 10**6 - epoch_ns)
        right = float(Decimal(str(after["epochMs"])) * 10**6 - epoch_ns)
        if left < 0 or right > duration_ns or value["gpuTimeMs"] is None:
            continue
        overlap = sum(
            max(0, min(right, end) - max(left, start))
            for start, end in envelopes.values()
        )
        pairs.append(
            {
                "traceStartNs": left,
                "traceEndNs": right,
                "counterNs": value["gpuTimeMs"] * 1e6,
                "metalCommandBufferEnvelopeNs": overlap,
            }
        )
    if not pairs or not rows:
        raise ValueError(
            "No common complete counter intervals or attributed Metal work"
        )
    x = [p["counterNs"] for p in pairs]
    y = [p["metalCommandBufferEnvelopeNs"] for p in pairs]
    counter = sum(x)
    reference = sum(y)
    if not reference:
        raise ValueError("No reference GPU time in common intervals")
    meanx, meany = counter / len(x), reference / len(y)
    covariance = sum((a - meanx) * (b - meany) for a, b in zip(x, y))
    variance = math.sqrt(
        sum((a - meanx) ** 2 for a in x) * sum((b - meany) ** 2 for b in y)
    )
    summary = {
        "source": "Metal System Trace",
        "reportId": report["id"],
        "rootPid": meta["rootPid"],
        "rootStartId": meta["rootStartId"],
        "targetPid": pid,
        "counterMs": counter / 1e6,
        "commandBufferEnvelopeMs": reference / 1e6,
        "relativeDifference": abs(counter - reference) / reference,
        "correlation": covariance / variance if variance else None,
        "gpuIntervalCount": len(rows),
        "commandBufferCount": len(envelopes),
        "completeCounterIntervals": len(pairs),
        "encoderActiveSumMs": sum(r["duration"] for r in rows) / 1e6,
        "note": "One local capture on an M5 Pro: the driver counter approximately tracks command-buffer spans, including gaps and overhead, rather than active encoder execution. This does not establish model-only attribution, exact accuracy, or portability to other machines.",
        "sha256": {
            name: hashlib.sha256((directory / name).read_bytes()).hexdigest()
            for name in (
                "trace-toc.xml",
                "time-info.xml",
                "gpu-intervals.xml",
                "gpu-clients.jsonl",
                "browser-report.json",
            )
        },
    }
    (directory / "gpu-validation.json").write_text(json.dumps(summary, indent=2) + "\n")
    (directory / "validated-comparison-bins.json").write_text(
        json.dumps(pairs, indent=2) + "\n"
    )
    return summary


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("directory")
    args = a.parse_args()
    print(json.dumps(validate(pathlib.Path(args.directory)), indent=2))
