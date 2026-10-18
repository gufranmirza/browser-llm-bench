import type { Sample } from "../../src/benchmark/schemas/report";
import type { Row } from "../../src/features/leaderboard/data";
import { artifacts } from "../../src/features/leaderboard/data";
import { models as fixtureBases } from "./synthetic-models";
export const fixtureDevices = [
  "MacBook Air · M2 · 16 GB",
  "Windows laptop · RTX 4060 · 16 GB",
  "Android phone · 8 GB",
];
export function makeFixtures(): Row[] {
  return fixtureDevices.flatMap((device, di) =>
    ["Chrome 138", "Firefox 141"].flatMap((browser) =>
      (["absent", "present"] as const).flatMap((cache) =>
        ["short", "repeat"].flatMap((work) =>
          artifacts
            .filter((a) => fixtureBases.some((m) => m.name === a.model.name))
            .map((a) => {
              const b = fixtureBases.find((m) => m.name === a.model.name)!;
              const recorded = a.encoding === b.quant;
              const factor = [1, 1.25, 0.43][di];
              const status =
                !recorded || browser === "Firefox 141"
                  ? "untested"
                  : di === 2 && a.model.parameters === 3
                    ? "failed"
                    : "complete";
              const good = status === "complete";
              const input = 128,
                output = 128,
                latency = Math.round(b.ttft / factor),
                speed = +(b.speed * factor).toFixed(1),
                count = work === "repeat" ? 3 : 1;
              const sample: Sample = {
                prompt:
                  "Illustrative workload: synthetic 128-input-token exchange. No executed prompt.",
                output: "Illustrative output; no inference was performed.",
                inputTokens: input,
                outputTokens: output,
                firstOutputMs: latency,
                responseMs: latency + (output / speed) * 1000,
                decodeTokensPerSecond: speed,
                finishReason: "illustrative",
                valid: true,
                warmup: false,
              };
              const cohort = `fixture:${di}:${browser}:${cache}:${work}`;
              return {
                id: `${cohort}:${a.model_id}`,
                artifact: a,
                source: "illustrative" as const,
                cohort,
                device,
                gpu: [
                  "Apple M2 (illustrative)",
                  "NVIDIA RTX 4060 (illustrative)",
                  "Not specified (illustrative)",
                ][di],
                browser,
                runtime: "WebLLM 0.2.82",
                workload: work,
                protocol: "illustrative-v1 / 128 input · 128 output",
                cache,
                status,
                revision: null,
                payloadBytes: recorded ? b.size * 1e6 : null,
                loadMs: good
                  ? ((cache === "absent" ? b.download : 0) + b.init / factor) *
                    1000
                  : null,
                downloadMs:
                  good && cache === "absent" ? b.download * 1000 : null,
                initMs: good ? (b.init / factor) * 1000 : null,
                firstOutputMs: good ? latency : null,
                decode: good ? speed : null,
                responseMs: good ? sample.responseMs : null,
                heapBytes: null,
                testedInput: good ? 128 : null,
                inputTokens: good ? Array(count).fill(input) : [],
                outputTokens: good ? Array(count).fill(output) : [],
                samples: good
                  ? Array.from({ length: count }, () => ({ ...sample }))
                  : [],
                attempts: status === "untested" ? 0 : 1,
                completed: good ? 1 : 0,
              };
            }),
        ),
      ),
    ),
  );
}
export const fixtureRows = makeFixtures();
