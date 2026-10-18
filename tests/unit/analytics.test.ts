import assert from "node:assert/strict";
import test from "node:test";
import { analyticsPage, analyticsReferrer } from "../../src/lib/analytics";

test("analytics strips query strings and fragments from public page views", () => {
  assert.equal(
    analyticsPage("https://browserllm.dev/?search=private#resources"),
    "https://browserllm.dev/",
  );
  assert.equal(
    analyticsPage("https://browserllm.dev/models/qwen3-4b/?cohort=run:private"),
    "https://browserllm.dev/models/qwen3-4b/",
  );
  for (const route of ["methodology", "compatibility", "leaderboard"])
    assert.equal(
      analyticsPage(`https://browserllm.dev/${route}/`),
      `https://browserllm.dev/${route}/`,
    );
});

test("analytics excludes private reports, runner, harness, previews and localhost", () => {
  for (const path of [
    "local-report/?id=private",
    "local-results/",
    "run/",
    "__harness",
    "404.html",
  ])
    assert.equal(analyticsPage(`https://browserllm.dev/${path}`), null);
  for (const origin of [
    "http://127.0.0.1:4173",
    "https://browser-llm-bench.gufranmirza1.workers.dev",
    "http://browserllm.dev",
    "https://browserllm.dev.evil.example",
  ])
    assert.equal(analyticsPage(`${origin}/`), null);
  assert.equal(analyticsPage("invalid"), null);
});

test("analytics referrers never include query strings or private paths", () => {
  assert.equal(
    analyticsReferrer("https://browserllm.dev/local-report/?id=private"),
    "https://browserllm.dev/",
  );
  assert.equal(
    analyticsReferrer("https://google.com/search?q=private"),
    "https://google.com/",
  );
  assert.equal(analyticsReferrer(""), "");
});
