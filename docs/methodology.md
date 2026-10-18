# Measurement methodology

The website's `/methodology/` page is the complete user-facing explanation. Protocol definitions and formulas are implemented under `src/benchmark`; this document describes their boundaries for contributors.

## Comparable sessions

The primary comparison preset uses one load, one warmup and 60 measured requests in three windows of 20. Requests are sequential and back-to-back, with 90-second loaded-idle gaps after responses 20 and 40. Conversation history resets before each request. The same model and worker remain loaded until final unload.

The prompt, tokenizer input/output counts, output budget, sampling settings, seed, exact model revision, runtime, browser/device evidence, observed cache state, timeouts and stage boundaries are saved. Compare matching device/protocol/workload/settings/cache groups. Three windows in one session are not independent experiments.

## Performance

- First-output latency: worker request start to first non-empty streamed text. A chunk can contain several tokens; this is not exact first-token or on-screen latency.
- Generation speed: runtime-reported autoregressive decode tokens per second, using tokenizer accounting.
- Response duration: worker request start through completed stream; excludes model load, chat reset and rendering.
- Summaries: valid measured samples only; warmups and missing readings excluded. Within-run percentiles describe observations, not confidence intervals across independent trials.
- Sequential batch throughput, when derived, divides completed requests or output tokens by the union of request-window durations. Reset/dispatch overhead within those windows counts; idle gaps do not.

## Resources

Every value needs a scope, interval and observed coverage. Resource integration only uses complete eligible intervals; boundary crossings and gaps are omitted rather than replaced with zero. Memory peaks are sampled maxima and can miss brief spikes.

CPU is a process-tree capacity share; memory is summed kernel-accounted footprint. Chrome GPU time is an experimental command-buffer counter; host GPU activity and subsystem power are separate whole-machine measurements. These signals must not be presented as reserved GPU cores, model-only watts or deduplicated physical RAM.

Preserve legacy energy definitions. Existing `activeEnergyJoules` integrates the first-to-last request-window span, including intervening idle gaps. It must not be relabeled inference-only energy. Future per-request efficiency requires integrating the union of request windows and accounting for coverage before division.

## Quality and scores

Basic output validity checks for usable output and token counts. It does not evaluate factual accuracy, reasoning, task success or intelligence. No overall quality/suitability score is assigned. Future scores require a versioned task suite, explicit resource budgets, weights and missing-data policy before results are ranked.
