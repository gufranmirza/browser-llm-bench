# Local harness

## Workflow

1. Build the website with `npm run build`.
2. Start `npm run harness`; the console is http://127.0.0.1:4173/__harness/.
3. Run `npm run harness:launch`. This opens a fresh dedicated Chrome profile and writes `artifacts/current-session.json` with PID and kernel start identity.
4. Run `npm run harness:capture` in your own Terminal. Enter an administrator password there if requested. Only the powermetrics process is privileged.
5. Start the queue in the dedicated Chrome console. Keep the console foreground for request startup. Hidden-page periods are recorded and may affect timing.
6. Review the browser report, merged report and session audit under the displayed `artifacts/runs/JOB/RUN/` directory.
7. Explicitly publish approved 60-request reports with `npm run harness:publish -- FILE`, rebuild and commit the report changes.

The public Run page always saves privately. Only the local harness console writes capture files, and only the publication command updates the curated report manifest.

## Presets

`harness/presets/comparison.json` queues the existing ten 4-bit artifacts, sequentially. Set `deviceLabel` to your actual machine description before collecting new published evidence. The label is user supplied, not independently verified hardware detection.

Each comparison session loads once, warms up, completes 20 requests, idles for 90 seconds, completes another 20, idles for 90 seconds, then completes the final 20. No deliberate pauses occur within request windows. Output length, seed and sampling are fixed by the preset. Slower models have longer request windows, subject to the configured request timeout and 30-minute session safety bound. Timeouts remain incomplete outcomes.

`smoke.json` runs three measured requests on the small control model and does not require power. It is diagnostic evidence, not eligible for the comparison leaderboard.

Controller options:

```sh
npm run harness -- --port 4173 --out out --preset harness/presets/comparison.json --session artifacts/current-session.json
npm run harness:launch -- --url http://127.0.0.1:4173/__harness/ --chrome '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
```

If the console is refreshed, use **Resume remaining models**. Completed reports
in the current job are skipped; failed or incomplete models remain eligible to
retry. Refreshing during an active model interrupts that model, so only refresh
when the console is idle.

After a controller restart, restore the same job explicitly:

```sh
npm run harness -- --preset harness/presets/webllm-expansion.json --resume-job artifacts/runs/JOB
```

Use the original preset and capture session. The controller validates the saved
report identities before restoring completion state. The expansion preset adds
eight pinned 4-bit WebLLM artifacts using the same 3 × 20 request schedule.

## Capture lifecycle

Power capture and its native collector share a one-hour maximum. Each invocation creates a new capture directory and STOP marker scope; it refuses to overwrite prior evidence or overlap an active capture. The queue waits for fresh power and enough remaining capture time for the next session's full safety bound. Restart capture between sessions when the prior capture expires; rerun `harness:capture` after stopping it.

Stop capture with Ctrl-C in its Terminal, or create a `STOP` file in the directory named by `artifacts/current-capture.json`. Stopping the queue cancels inference but leaves the collector running until explicitly stopped or its deadline expires. Closing Chrome is not a valid substitute for confirmed model unload.

Unprivileged capture:

```sh
npm run harness:capture -- --no-power
# A shorter native-only diagnostic:
python3 -m harness.controller.capture --max-seconds 120
```

Power stays unavailable in native-only captures. No zero or substitute estimate is inserted. Run a preset with `requirePower: false` for this mode.

## Signals and limits

- CPU and accounted memory cover the verified Chrome process tree, including helpers. CPU capacity is normalized by host logical CPU count.
- Chrome GPU time uses experimental, undocumented Apple driver counters. It includes rendering and command-buffer overhead, allows overlapping queues, and is not shader occupancy or model-only GPU utilization.
- GPU activity, thermal pressure, swap and CPU/GPU/ANE power are host-wide signals.
- Worker WASM memory and tracked GPU buffers are allocation accounting, not physical RAM/VRAM. Do not add them to native process footprint.
- First observations, reused PIDs, changed clients/queues, counter regressions, clock jumps and gaps remain missing intervals.

Metal validation tools live in `harness/validation`. They consume exported trace tables and raw counter snapshots; they do not enable profiling privileges or claim portable counter accuracy.

## Evidence and publication

Each merged report has an immutable telemetry snapshot, original browser JSON, full combined JSON, compact combined JSON and audit. Raw files are hashed in compact provenance. Browser-only sessions can still be inspected and downloaded; missing native or power coverage is reported explicitly.

Publication requires a schema-valid, complete session with exactly three windows of 20 valid measured responses, full idle gaps and confirmed unload. It retains one current curated report per artifact. `--dry-run` validates without writing. Publication does not claim that absent power was captured; inspect coverage separately before making resource comparisons.

Collectors and the loopback server are not shipped as public website endpoints. All profiles, logs, raw traces and administrative capture state remain ignored under `artifacts/`.
