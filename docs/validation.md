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


# WebLLM expansion — October 19, 2026

Seven completed 4-bit configurations are added to the curated reports. Gemma 4 E2B remains pending and is not included in this publication. The original eleven reports are preserved, for eighteen published configurations.

All seven ran sequentially in dedicated Chrome on an Apple M5 Pro with 48 GB RAM. Each session loaded once, warmed up once, and completed three windows of twenty requests with no added delay within windows and two full 90-second loaded-idle gaps. The preset is `harness/presets/webllm-expansion.json`. Every session confirmed model unload.

| Artifact | Valid requests | Observed power coverage | Requests overlapping a hidden page | Missing CPU intervals |
| --- | ---: | ---: | ---: | ---: |
| `SmolLM2-1.7B-Instruct-q4f16_1-MLC` | 60 / 60 | 99.92% | 19 | 0 / 410 |
| `gemma-2-2b-it-q4f16_1-MLC` | 60 / 60 | 99.90% | 60 | 2 / 497 |
| `Qwen3.5-0.8B-q4f16_1-MLC` | 60 / 60 | 99.90% | 54 | 4 / 328 |
| `Qwen3.5-2B-q4f16_1-MLC` | 60 / 60 | 99.92% | 60 | 8 / 445 |
| `Phi-4-mini-instruct-q4f16_1-MLC` | 60 / 60 | 99.91% | 40 | 2 / 589 |
| `Ministral-3-3B-Instruct-2512-BF16-q4f16_1-MLC` | 60 / 60 | 99.93% | 60 | 6 / 609 |
| `Qwen3.5-4B-q4f16_1-MLC` | 60 / 60 | 99.92% | 60 | 11 / 664 |

## Data checks and limits

- All 420 measured responses have token counts, first-output latency, response duration, generation speed, and ordered start/end timestamps. Warmup is excluded.
- Each run passed the shared report schema and protocol audit: three valid 20-request windows, both idle gaps, and confirmed unload.
- Native memory and host power cover the full session. Maximum observed spacing is 1.009 seconds for native samples and 1.051 seconds for power samples. Observed power coverage exceeds 99.90% for every run; the small remainder is not filled with estimates.
- All 42 referenced raw-evidence files match their recorded SHA-256 hashes and byte lengths. Raw telemetry and browser profiles stay in ignored local artifacts; compact reports retain the measurements, diagnostics, and evidence provenance.
- Some CPU intervals cannot be calculated when Chrome helper processes start or disappear. These are retained as null with incomplete-process accounting, rather than treated as zero. Memory remains present during those intervals.
- Each run has two unavailable Chrome GPU-counter intervals, during loading and after unload when the driver queue set changes. There are no missing GPU-counter intervals during inference.
- Hidden-page periods remain in lifecycle events. These runs are not exclusively foreground measurements; browser scheduling and other host activity can affect comparisons. Host power is whole-machine subsystem power, not model-only power.
- Worker JS heap and physical GPU residency remain unavailable where browser APIs do not expose them. WASM memory and tracked GPU buffers are allocation measurements, not substitutes for those values.

Publication adds the seven compact JSON files and their manifest entries. It does not overwrite earlier artifacts, include private browser runs, or claim that unavailable signals were measured.
