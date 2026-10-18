# Migration record

The original Vite workspace was preserved outside this repository. This repository contains the Next.js static site, reusable benchmark code, local harness, curated reports and small correctness fixtures.

## Preserved

- Eleven curated measured reports and their original IDs, settings, timings and resource series.
- The 60-request schedule, exact prompt, chat resets, warmup handling, 90-second gaps and unload observation.
- Versioned legacy/v2 report compatibility and IndexedDB migration behavior.
- Exact artifact revisions and the paired WebLLM 0.2.82 / 0.2.86 runtimes.
- Native signal semantics, interval/gap handling and Metal comparison tools.

Local user-home path strings in published metadata were redacted. Measured numeric data was not changed. Historical provenance hashes continue to identify the original evidence, before metadata redaction.

## Cleanup

Removed the unused legacy leaderboard, profiling-plan page, retired UI helpers and unused model-size UI. Synthetic benchmark data lives only in test fixtures. Consolidated runtime pins into `catalog/models.json` and removed the duplicate snapshot catalog. Removed Vite and its batch middleware, unused dependencies, duplicate logos, dated launch paths and machine-specific device labels. Split the combined Pages module into feature folders; replaced the hash router with generated Next.js routes and a private report query route. Consolidated shared styles and removed unused imports.

The local harness no longer publishes automatically. Capture and merge write only under ignored `artifacts/`; explicit publication validates through the shared TypeScript report schema.

## Capture archive

Approximately 24 GB of old validation material remains in the original workspace's `browser-bench/validation/` directory. It was not copied into Git or deleted. Historical compact reports retain raw-evidence hashes and legacy relative paths; those paths are provenance labels, not downloadable public URLs. Keep the original archive when independently verifying those runs. New captures use `artifacts/` and are similarly excluded from Git.

Model weights, browser profiles, generated worker bundles, build output and caches are excluded from source control. The worker bundle is rebuilt from the lockfile during development, export and CI.
