"""Launch a new dedicated Chrome profile and record verifiable process identity."""

import argparse, datetime, json, pathlib, subprocess, sys, time, uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]


def launch(url, chrome):
    if sys.platform != "darwin":
        raise RuntimeError(
            "This native collector currently supports macOS. Use the website for browser-only runs elsewhere."
        )
    from harness.collectors.macos.native_collector import (
        process_args,
        usage,
        process_table,
    )

    if not pathlib.Path(chrome).is_file():
        raise RuntimeError(
            "Chrome executable not found; pass --chrome with its installed path"
        )
    directory = (
        ROOT
        / "artifacts"
        / "sessions"
        / (datetime.datetime.now().strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6])
    )
    directory.mkdir(parents=True)
    profile = directory / "chrome-profile"
    profile.mkdir()
    bundle = pathlib.Path(chrome).parents[2]
    subprocess.run(
        [
            "/usr/bin/open",
            "-n",
            "-a",
            str(bundle),
            "--args",
            "--user-data-dir=" + str(profile),
            "--no-first-run",
            "--no-default-browser-check",
            "--new-window",
            url,
        ],
        check=True,
    )
    for _ in range(100):
        for pid, entry in process_table().items():
            if entry["executable"] == chrome and "--user-data-dir=" + str(
                profile
            ) in process_args(pid):
                data = {
                    "rootPid": pid,
                    "rootStartId": usage(pid)["startId"],
                    "profilePath": str(profile),
                    "createdAt": datetime.datetime.now(
                        datetime.timezone.utc
                    ).isoformat(),
                    "url": url,
                }
                (directory / "session.json").write_text(
                    json.dumps(data, indent=2) + "\n"
                )
                (ROOT / "artifacts/current-session.json").write_text(
                    json.dumps(data, indent=2) + "\n"
                )
                return data
        time.sleep(0.1)
    raise RuntimeError("Could not verify dedicated Chrome identity")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:4173/__harness/")
    parser.add_argument(
        "--chrome",
        default="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    )
    args = parser.parse_args()
    try:
        print(json.dumps(launch(args.url, args.chrome), indent=2))
    except RuntimeError as e:
        parser.exit(2, str(e) + "\n")
