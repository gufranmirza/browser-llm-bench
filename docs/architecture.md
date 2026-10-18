# Architecture

## Static website

Next.js App Router exports HTML, JavaScript, CSS, fonts and report JSON into `out/`. Model routes are enumerated from the pinned catalog at build time. Local reports use `/local-report/?id=UUID`, because their IDs exist only in the visitor's browser. Client components read browser capabilities and IndexedDB after mounting.

The website has no filesystem-writing API or native capture endpoint. The report provider keeps published and private collections separate. Public pages use the published collection; local result pages use IndexedDB. Report imports are private, schema-validated and size-bounded.

The browser worker is built separately with esbuild. The worker imports the exact WebLLM runtime matching the selected artifact: 0.2.82 and 0.2.86 remain separate pinned dependencies. Engine chunks are loaded only when inference starts, and are never imported into the leaderboard route. Model weights remain upstream assets, outside this repository.

## Shared benchmark core

`src/benchmark/protocol` owns prompts, schedules, settings and safety bounds. `schemas` validates saved reports and their consistency with artifact pins. `metrics` owns transformations and boundary handling used by the UI. Feature components present data; they do not redefine the benchmark protocol.

`catalog/models.json` is the authoritative list of runnable artifacts. Each pin carries its runtime version, model revision, encoding, required features and published package details. `catalog/candidates.json` contains research-only selections; availability of GGUF/ONNX files alone does not enable this WebLLM runner. Research inputs are retained under `catalog/research` for reproducibility.

## Local harness

The loopback controller serves the already exported site plus a local-only console. Its queue uses the same worker, settings validation and schedule as the public runner. The macOS launcher records the dedicated Chrome PID, kernel start identity and fresh profile path. Collectors verify that identity before capture.

Collectors produce raw telemetry under `artifacts/`. Processing aligns signals with browser clock calibration and creates an immutable per-report snapshot and audit. Publishing is an explicit TypeScript command that applies the shared report schema and 60-request gate before changing `public/reports`.

The local controller binds to 127.0.0.1. Host and mutation-origin checks restrict its write endpoints. Static preview disables those endpoints entirely. It accepts only queued artifacts and bounded JSON bodies; capture paths must remain under the local artifacts directory.

## UI and assets

Shared shadcn/Radix components retain centralized styling. Global foundations and shared component styles live under `src/styles`; page-specific styles live beside their feature. Logos and fonts are local static assets. Brand attribution and third-party licenses are retained.
