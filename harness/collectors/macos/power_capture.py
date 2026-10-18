#!/usr/bin/env python3
"""Read a bounded powermetrics pipe as the ordinary user; retain raw frames.

The privileged process is powermetrics only. A STOP file or Ctrl-C finalizes
both collectors gracefully, including when no power data has arrived yet.
"""

import argparse, json, os, pathlib, re, select, signal, subprocess, sys, time

MAX_CAPTURE_SECONDS = 3600


def capture_seconds(value):
    try:
        seconds = int(value)
    except ValueError:
        raise argparse.ArgumentTypeError(
            "Capture duration must be an integer number of seconds"
        )
    if not 1 <= seconds <= MAX_CAPTURE_SECONDS:
        raise argparse.ArgumentTypeError(
            f"Capture duration must be between 1 and {MAX_CAPTURE_SECONDS} seconds"
        )
    return seconds


def parse_frame(lines, end_epoch_ms):
    raw = "".join(lines)
    m = re.search(r"\(([\d.]+)\s*ms elapsed\)", raw)
    if not m:
        return None
    result = {
        "epochMs": end_epoch_ms,
        "intervalMs": float(m[1]),
        "cpuWatts": None,
        "gpuWatts": None,
        "aneWatts": None,
        "combinedWatts": None,
        "raw": raw,
    }
    for label, key in [
        ("CPU", "cpuWatts"),
        ("GPU", "gpuWatts"),
        ("ANE", "aneWatts"),
        ("Combined Power (CPU + GPU + ANE)", "combinedWatts"),
    ]:
        pattern = (
            r"^"
            + re.escape(label)
            + (r" Power" if key != "combinedWatts" else "")
            + r":\s*([\d.]+)\s*(mW|W)\s*$"
        )
        hit = re.search(pattern, raw, re.M)
        if hit:
            result[key] = float(hit[1]) / (1000 if hit[2] == "mW" else 1)
    if result["combinedWatts"] is None and all(
        result[k] is not None for k in ["cpuWatts", "gpuWatts", "aneWatts"]
    ):
        result["combinedWatts"] = sum(
            result[k] for k in ["cpuWatts", "gpuWatts", "aneWatts"]
        )
        result["combinedDerivedFromComponents"] = True
    return result


def prepare_output(out):
    out.mkdir(parents=True, exist_ok=True)
    protected = [
        "STOP",
        "capture-control.json",
        "power-raw.log",
        "power-samples.jsonl",
        "power-capture.json",
        "native-samples.jsonl",
        "collector-metadata.json",
        "collector.log",
    ]
    if any((out / name).exists() for name in protected):
        raise ValueError(
            "Refusing to reuse an existing capture or STOP marker. Run the launcher to create a fresh capture directory."
        )


def pipe_lines(stream, stop_requested, deadline):
    """Poll the pipe without a watcher thread that sends signals during setup."""
    pending = b""
    while not stop_requested() and time.monotonic() < deadline:
        ready, _, _ = select.select(
            [stream], [], [], min(0.2, max(0, deadline - time.monotonic()))
        )
        if not ready:
            continue
        chunk = os.read(stream.fileno(), 65536)
        if not chunk:
            break
        pending += chunk
        while b"\n" in pending:
            line, pending = pending.split(b"\n", 1)
            yield line.decode(errors="replace") + "\n"
    if pending:
        yield pending.decode(errors="replace")


def main(args):
    stopped = False

    def stop_handler(*_):
        nonlocal stopped
        stopped = True

    signal.signal(signal.SIGTERM, stop_handler)
    signal.signal(signal.SIGINT, stop_handler)
    out = pathlib.Path(args.output)
    prepare_output(out)
    session = json.loads(pathlib.Path(args.session).read_text())
    if session.get("rootStartId"):
        from harness.collectors.macos.native_collector import usage

        if usage(session["rootPid"])["startId"] != session["rootStartId"]:
            raise ValueError(
                "Dedicated Chrome process identity changed after capture preparation"
            )
    started = time.time() * 1000
    control = {
        "powerCapturePid": os.getpid(),
        "rootPid": session["rootPid"],
        "startedEpochMs": started,
        "maxSeconds": args.max_seconds,
        "sampleCount": 0,
        "status": "waiting-for-power",
    }

    def write_control():
        (out / "capture-control.json").write_text(json.dumps(control, indent=2) + "\n")

    write_control()
    command = [
        sys.executable,
        "-m",
        "harness.collectors.macos.native_collector",
        "--pid",
        str(session["rootPid"]),
        "--profile",
        session["profilePath"],
        "--output",
        str(out),
        "--max-seconds",
        str(args.max_seconds),
    ]
    collector = None
    frame = []
    end = None
    count = 0
    reason = "pipe-closed"
    deadline = time.monotonic() + args.max_seconds
    stop_requested = lambda: stopped or (out / "STOP").exists()
    try:
        with (out / "collector.log").open("w") as log:
            collector = subprocess.Popen(command, stdout=log, stderr=log)
        with (
            (out / "power-raw.log").open("w", buffering=1) as rawlog,
            (out / "power-samples.jsonl").open("w", buffering=1) as parsed,
        ):

            def flush():
                nonlocal count
                p = parse_frame(frame, end)
                if p:
                    parsed.write(json.dumps(p, separators=(",", ":")) + "\n")
                    count += 1
                    control.update(
                        {
                            "sampleCount": count,
                            "lastPowerFrameEpochMs": end,
                            "status": "recording",
                        }
                    )
                    write_control()

            for line in pipe_lines(sys.stdin, stop_requested, deadline):
                rawlog.write(line)
                if "Sampled system activity" in line:
                    if frame:
                        flush()
                    frame = [line]
                    end = time.time() * 1000
                elif frame:
                    frame.append(line)
                if (
                    collector.poll() is not None
                    and not stop_requested()
                    and time.monotonic() < deadline
                ):
                    raise RuntimeError(
                        "Native collector exited early; inspect collector.log before running the benchmark"
                    )
            if frame:
                flush()
            reason = (
                "stop-requested"
                if stop_requested()
                else "safety-duration"
                if time.monotonic() >= deadline
                else "pipe-closed"
            )
    except KeyboardInterrupt:
        reason = "interrupted"
    except Exception:
        reason = "capture-error"
        raise
    finally:
        if collector and collector.poll() is None:
            collector.send_signal(signal.SIGTERM)
            collector.wait(timeout=10)
        control.update(
            {"sampleCount": count, "status": "finished", "stopReason": reason}
        )
        write_control()
        metadata = {
            "source": "powermetrics text with explicit W/mW units",
            "scope": "Host CPU/GPU/ANE subsystem estimates; other applications remain active. Not per-model watts.",
            "timestamp": "Host wall clock on receipt of line-buffered sample header; CLI/pipe delivery adds timestamp uncertainty.",
            "sampleCount": count,
            "maxSeconds": args.max_seconds,
            "stopReason": reason,
            "startedEpochMs": started,
            "finishedEpochMs": time.time() * 1000,
            "startedNativeCollector": collector is not None,
            "nativeCollectorExitCode": collector.returncode if collector else None,
            "commandExpected": f"sudo powermetrics --samplers cpu_power,gpu_power,ane_power,thermal -i 1000 -n {args.max_seconds} -b 1 -f text",
        }
        (out / "power-capture.json").write_text(json.dumps(metadata, indent=2) + "\n")
        print(f"Captured {count} power frames; native data in {out}", file=sys.stderr)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--output", required=True)
    p.add_argument("--session", required=True)
    p.add_argument(
        "--max-seconds",
        type=capture_seconds,
        default=MAX_CAPTURE_SECONDS,
        metavar="SECONDS",
        help="Capture safety limit: 1–3600 seconds (default: one hour)",
    )
    try:
        main(p.parse_args())
    except (ValueError, RuntimeError) as e:
        p.exit(2, str(e) + "\n")
