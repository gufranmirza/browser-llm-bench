#!/usr/bin/env python3
"""Prepare a fresh capture for the existing, verified dedicated Chrome."""

import argparse, datetime, json, pathlib, tempfile, time
from harness.collectors.macos.native_collector import process_args, usage


def prepare(session_path):
    session_path = pathlib.Path(session_path).resolve()
    session = json.loads(session_path.read_text())
    profile = str(pathlib.Path(session["profilePath"]).resolve())
    if "--user-data-dir=" + profile not in process_args(session["rootPid"]):
        raise ValueError(
            "Dedicated Chrome PID no longer uses the expected profile; refusing capture"
        )
    identity = usage(session["rootPid"])["startId"]
    pointer = session_path.parent / "current-capture.json"
    if pointer.exists():
        prior = json.loads(pointer.read_text())
        control = pathlib.Path(prior["capturePath"]) / "capture-control.json"
        if control.exists():
            status = json.loads(control.read_text())
            if status["status"] != "finished":
                try:
                    args = process_args(
                        status.get("powerCapturePid") or status.get("capturePid", 0)
                    )
                except RuntimeError:
                    args = ""
                if ("power_capture" in args and prior["capturePath"] in args) or (
                    "harness.controller.capture" in args and status.get("capturePid")
                ):
                    raise ValueError(
                        "A capture is already active. Finish it before starting another."
                    )
    parent = session_path.parent / "captures"
    parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-")
    out = pathlib.Path(tempfile.mkdtemp(prefix="capture-" + stamp, dir=parent))
    session.update(
        {
            "rootStartId": identity,
            "preparedEpochMs": time.time() * 1000,
            "capturePath": str(out),
        }
    )
    (out / "session.json").write_text(json.dumps(session, indent=2) + "\n")
    pointer.write_text(json.dumps(session, indent=2) + "\n")
    return out


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--session", required=True)
    args = a.parse_args()
    try:
        print(prepare(args.session))
    except (ValueError, RuntimeError, OSError) as e:
        a.exit(2, str(e) + "\n")
