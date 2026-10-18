# Browser LLM Bench

A static Next.js site for comparing measured browser LLM performance and resources, with a local macOS harness for dedicated Chrome captures.

The leaderboard reads curated, versioned reports from this repository. Visitors can run benchmarks privately in their own browser, inspect the result and download JSON. Private runs never publish to the leaderboard.

## Website

Requirements: Node.js 22 LTS or later and npm. Inference requires a browser with a usable WebGPU adapter; available memory and model compatibility still apply.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. To test the deployable static files:

```sh
npm run build
npm run verify:export
npm run preview
```

Open http://127.0.0.1:4173. Deploy the generated `out/` directory to a static host. No Next.js server, database, model API, or native collector is required by the public site.

## Local native harness

Requirements: macOS, Google Chrome, Python 3.9+, and Xcode Command Line Tools. The collectors use the installed macOS SDK and standard library; there are no Python runtime package dependencies.

```sh
npm run build
npm run harness
```

In another terminal:

```sh
npm run harness:launch
npm run harness:capture
```

The launcher opens a fresh dedicated Chrome profile at the local harness console. Start the queue there. Only `powermetrics` requests administrator authentication; collectors and processing run as your ordinary user. The default capture is bounded to one hour. For unprivileged CPU/memory/GPU-counter capture, use `npm run harness:capture -- --no-power`.

For a short validation queue, use `npm run harness -- --preset harness/presets/smoke.json`. Reports and raw evidence save under ignored `artifacts/`. Review a complete comparison report, then explicitly promote it:

```sh
npm run harness:publish -- artifacts/runs/JOB/RUN/combined-report.json --dry-run
npm run harness:publish -- artifacts/runs/JOB/RUN/combined-report.json
npm run build
```

Publishing validates a completed 60-request session before updating the report manifest. It does not commit or push automatically. See [the harness guide](docs/harness.md) for capture lifecycle and missing signals.

## Validation

```sh
npm run check
npm run build
npm run verify:export
```

Checks cover report compatibility, timing boundaries, missing data, exact schedules, private storage, publication gates, native parsing, static serving, formatting and unused files/dependencies. Real GPU inference is a manual hardware check; CI does not fabricate measurements or run GPU benchmarks on shared runners.

## Repository

- `src/app`: Next.js pages and layout.
- `src/features`: leaderboard, model reports, runner, capabilities and local results.
- `src/benchmark`: shared protocol, runtime catalog, worker, metrics and report schemas.
- `src/components`: shared shadcn/Radix components, charts, layout and logos.
- `catalog`: exact runtime/artifact pins and clearly marked research candidates.
- `public/reports`: curated reports and manifest; `public/providers`: attributed local logos.
- `harness`: Chrome controller, macOS collectors, processing, publication and diagnostics.
- `tests`: correctness tests and small, explicitly identified fixtures.
- `artifacts`: ignored local runs, captures, Chrome profiles and validation output.

See [architecture](docs/architecture.md), [methodology](docs/methodology.md), [deployment](docs/deployment.md), and [migration notes](docs/migration.md).
