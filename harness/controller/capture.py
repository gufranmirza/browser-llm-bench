"""Bounded, unprivileged native capture when host power is not requested."""

import argparse, json, time, types, os
from harness.collectors.macos.prepare_native_capture import prepare
from harness.collectors.macos.native_collector import collect
from harness.collectors.macos.power_capture import capture_seconds


def capture(session_path, max_seconds):
    output = prepare(session_path)
    session = json.loads((output / "session.json").read_text())
    control = {
        "status": "recording",
        "mode": "native-only",
        "capturePid": os.getpid(),
        "startedEpochMs": time.time() * 1000,
        "maxSeconds": max_seconds,
        "lastPowerFrameEpochMs": None,
    }
    (output / "capture-control.json").write_text(json.dumps(control, indent=2) + "\n")
    print("Fresh native-only capture: " + str(output), flush=True)
    try:
        collect(
            types.SimpleNamespace(
                pid=session["rootPid"],
                profile=session["profilePath"],
                output=str(output),
                max_seconds=max_seconds,
            )
        )
    finally:
        control["status"] = "finished"
        (output / "capture-control.json").write_text(
            json.dumps(control, indent=2) + "\n"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--session", default="artifacts/current-session.json")
    parser.add_argument("--max-seconds", type=capture_seconds, default=3600)
    args = parser.parse_args()
    capture(args.session, args.max_seconds)
