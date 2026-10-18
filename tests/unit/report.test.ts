import assert from "node:assert/strict";
import test from "node:test";
import { workload } from "../../src/benchmark/protocol/workloads";
import {
  MODEL,
  MODEL_URL,
  parseReports,
  PROTOCOL,
  REVISION,
} from "../../src/benchmark/schemas/report";
const report = {
  schema: "fieldwork-report-v1",
  id: "test",
  createdAt: "2026-10-17T00:00:00.000Z",
  source: "local",
  protocol: PROTOCOL,
  model: MODEL,
  revision: REVISION,
  modelUrl: MODEL_URL,
  quantization: "q0f16",
  runtime: "WebLLM 0.2.82",
  executionBackend: "webgpu",
  resourcePolicy: "browser-managed; no dedicated resource reservation",
  workload: "short",
  status: "complete",
  environment: {
    userAgent: "Test browser",
    platform: "Test OS",
    deviceLabel: "Test device",
    hardwareConcurrency: 8,
    webgpu: true,
    adapter: null,
  },
  settings: {
    temperature: 0,
    topP: 1,
    maxTokens: 64,
    contextWindow: 4096,
    warmups: 1,
    repeats: 1,
    seed: 42,
  },
  cache: "Unknown",
  loadMs: 100,
  firstPreparationMs: 10,
  downloadBytes: null,
  downloadMs: null,
  memory: { jsHeapBytes: null, gpuBytes: null, note: "Unavailable" },
  responsiveness: { maxEventLoopDelayMs: 0, samples: 1 },
  samples: [
    {
      prompt: "Hello",
      output: "Hello",
      inputTokens: 12,
      outputTokens: 2,
      firstOutputMs: 10,
      responseMs: 20,
      decodeTokensPerSecond: 100,
      finishReason: "stop",
      valid: true,
      warmup: false,
    },
  ],
  diagnostics: [],
};
test("local report roundtrip preserves null telemetry and tokenizer counts", () => {
  const parsed = parseReports(JSON.parse(JSON.stringify(report)));
  assert.equal(parsed[0].downloadBytes, null);
  assert.equal(parsed[0].samples[0].outputTokens, 2);
});
test("rejects fixtures, incompatible protocols, negative and nonfinite metrics", () => {
  for (const change of [
    { source: "illustrative" },
    { protocol: "other" },
    { loadMs: -2 },
    { loadMs: Infinity },
    { executionBackend: "cpu" },
  ])
    assert.throws(() => parseReports({ ...report, ...change }));
});
test("rejects oversized sample sets and missing measurement metadata", () => {
  assert.throws(() =>
    parseReports({ ...report, samples: Array(21).fill(report.samples[0]) }),
  );
  assert.throws(() => parseReports({ ...report, revision: undefined }));
});
test("context sweep grows input and repeated requests are identical", () => {
  const sweep = workload("context");
  assert.equal(sweep.length, 3);
  assert.ok(
    sweep[0].length < sweep[1].length && sweep[1].length < sweep[2].length,
  );
  assert.equal(new Set(workload("repeat")).size, 1);
  assert.equal(workload("repeat").length, 3);
});
