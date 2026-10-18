import assert from "node:assert/strict";
import test from "node:test";
import { leaderboardBack } from "../../src/lib/model-route";
import { appUrl } from "../../src/lib/urls";
test("static links normalize private IDs and legacy hash routes", () => {
  assert.equal(
    appUrl("#/local-report/abc?section=resources"),
    "/local-report/?id=abc&section=resources",
  );
  assert.equal(appUrl("#/reports"), "/local-results/");
  assert.equal(appUrl("#/leaderboard?search=qwen"), "/?search=qwen");
  assert.equal(
    appUrl("/models/qwen3-4b?artifact=x"),
    "/models/qwen3-4b/?artifact=x",
  );
  assert.equal(appUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(leaderboardBack("/?search=qwen"), "/?search=qwen");
  assert.equal(leaderboardBack("//example.com"), "/");
});
