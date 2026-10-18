import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { makeProfile } from "../../src/benchmark/metrics/browser-profiler";
import { planFor } from "../../src/benchmark/protocol/schedule";
import {
  defaultRunSettings,
  generationOptions,
  runSettingsSchema,
} from "../../src/benchmark/protocol/settings";
import { parseReports } from "../../src/benchmark/schemas/report";

import candidates from "../../catalog/candidates.json";
import live from "../../src/benchmark/runtime/catalog";
import { reportRow } from "../../src/features/leaderboard/data";

test("generation, warmup and safety overrides reach request options and the saved plan", () => {
  const settings = runSettingsSchema.parse({
    ...defaultRunSettings("repeat"),
    temperature: 0.7,
    topP: 0.85,
    maxTokens: 128,
    seed: 7,
    warmups: 3,
    warmupTokens: 32,
    contextWindow: 2048,
    requestLimitMs: 180000,
    thinking: true,
  });
  assert.deepEqual(generationOptions(settings, false, true), {
    temperature: 0.7,
    top_p: 0.85,
    seed: 7,
    max_tokens: 128,
    extra_body: { enable_thinking: true },
  });
  assert.equal(generationOptions(settings, true, false).max_tokens, 32);
  assert.equal(generationOptions(settings, false, false).extra_body, undefined);
  const plan = planFor("repeat", "session-count", settings);
  assert.equal(plan.requestLimitMs, 180000);
  assert.match(plan.resetPolicy, /seed 7/);
  assert.deepEqual(plan.countSchedule, {
    bursts: 3,
    requestsPerBurst: 20,
    betweenMs: 90000,
    requestGapMs: 0,
  });
});
test("settings reject invalid token budgets, nonfinite values and unbounded timeouts", () => {
  const d = defaultRunSettings("repeat");
  for (const change of [
    { maxTokens: 4096 },
    { maxTokens: 512, contextWindow: 512 },
    { topP: 0 },
    { temperature: NaN },
    { warmups: 6 },
    { seed: -1 },
    { requestLimitMs: Infinity },
    { requestLimitMs: 600001 },
  ])
    assert.equal(
      runSettingsSchema.safeParse({ ...d, ...change }).success,
      false,
    );
  assert.equal(defaultRunSettings("long-output").maxTokens, 256);
});
test("every runner artifact roundtrips through reports and can render a detail page", () => {
  const base = JSON.parse(
    readFileSync("tests/fixtures/profile-repeat.json", "utf8"),
  );
  for (const pin of live.models) {
    const report = {
      ...base,
      model: pin.id,
      revision: pin.revision,
      quantization: pin.quantization,
      modelUrl: pin.modelUrl,
      runtime: pin.runtime,
      modelLib: pin.modelLib,
      schema: "browser-inference-bench-report-v2",
      protocol: "browser-inference-bench-v2",
      status: "cancelled",
      samples: [],
      profile: makeProfile(planFor("repeat", "smoke"), true),
    };
    const parsed = parseReports(report)[0];
    assert.equal(reportRow(parsed).artifact.model.slug, pin.slug);
    assert.equal(pin.modelUrl.includes(pin.revision), true);
    assert.ok(pin.artifact.weightShardBytes > 0);
    if (pin.quantization.includes("f16"))
      assert.ok(pin.requiredFeatures.includes("shader-f16"));
    if (pin.quantization.includes("f32"))
      assert.ok(!pin.requiredFeatures.includes("shader-f16"));
  }
});
test("research candidates only offer runnable selections with a verified package and runtime", () => {
  assert.equal(candidates.length, 33);
  for (const c of candidates) {
    assert.ok(c.parameters <= 8);
    for (const id of c.artifactIds)
      assert.ok(
        live.models.some((m) => m.id === id),
        id,
      );
  }
  assert.equal(
    live.models.filter((m) => m.runtime === "WebLLM 0.2.86").length,
    13,
  );
});
