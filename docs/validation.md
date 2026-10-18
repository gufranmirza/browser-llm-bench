# Migration validation — October 18, 2026

## Automated checks

- TypeScript type checking, 58 unit tests, 21 Python harness checks and static-server integration tests.
- Report-schema validation for all eleven curated reports.
- Formatting, unused-file/dependency checks and npm vulnerability audit.
- Production static export: 28 generated pages and referenced static assets checked over HTTP.
- Repository-subpath export: `/browser-llm-bench/`, including client navigation, logos and report loading.
- Static preview rejects write requests and does not expose local harness endpoints.

GitHub Actions repeats validation on clean Linux and macOS runners. Hosted machines may lack GPU counters; deterministic tests preserve missing-data behavior, and hardware-specific checks run only on macOS.

## Actual browser inference

These are short migration diagnostics, excluded from the public leaderboard.

| Path                                            | Model / runtime              | Measured requests | Result                     |
| ----------------------------------------------- | ---------------------------- | ----------------- | -------------------------- |
| Exported website, private run                   | Qwen3.5 0.8B / WebLLM 0.2.86 | 3                 | Complete; unload confirmed |
| Dedicated Chrome, sequential queue first model  | SmolLM2 135M / WebLLM 0.2.82 | 3                 | Complete; unload confirmed |
| Dedicated Chrome, sequential queue second model | Qwen3.5 0.8B / WebLLM 0.2.86 | 3                 | Complete; unload confirmed |

The sequential queue saved both runs automatically to local artifacts, with 58 and 77 native sample points respectively. Their GPU series contained 56 and 74 usable driver-counter intervals. The same verified dedicated Chrome root was retained across the queue; the first model unloaded before the second loaded.

Private JSON download, report viewing, resource-section navigation, prompt dialogs and persistence after refresh were checked in the browser. The private report ID was absent from the public manifest.

All non-text fields in the eleven existing published reports were compared with the original workspace and remained unchanged. Only local user-home strings in metadata were redacted. No migration smoke result replaced a curated report.

## Power and remaining scope

Live powermetrics capture was not repeated because administrator authentication was unavailable in this session. The bounded launcher, parser, stop behavior and missing-power handling were checked; native-only captures honestly contain no power samples. Future power capture uses the documented Terminal authentication flow.

The full ten-model, 60-request benchmark suite was not repeated during migration. Its existing reports were preserved. Schedule correctness is covered by shared-protocol tests and validation of the existing complete comparison reports. Hardware validation here covers the two pinned runtime paths, not every selectable artifact or browser/device combination.

Raw validation reports, screenshots and telemetry are retained locally under ignored `artifacts/validation`, `artifacts/runs` and `artifacts/captures`.
