import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalModelRoute,
  leaderboardBack,
  modelSection,
} from "../../src/lib/model-route";

test("legacy model links preserve evidence selection and leaderboard filters", () => {
  for (const source of ["measured", "illustrative"]) {
    const params = new URLSearchParams({
      artifact: "SmolLM2-135M-Instruct-q0f16-MLC",
      source,
      cohort:
        source === "measured"
          ? "run:saved-report"
          : "fixture:0:Chrome 138:absent:short",
      back: "#/leaderboard?source=illustrative&sort=decode",
      section: "native-resources",
    });
    const route = canonicalModelRoute(`#/models-v2/smollm2-135m?${params}`);
    assert.ok(route.startsWith("#/models/smollm2-135m?"));
    const result = new URLSearchParams(route.split("?")[1]);
    for (const key of ["artifact", "source", "cohort", "back"]) {
      assert.equal(result.get(key), params.get(key));
    }
    assert.equal(result.get("section"), "resources");
    assert.equal(canonicalModelRoute(route), route);
  }
});

test("canonical links and other routes retain their selection", () => {
  for (const route of [
    "#/models/smollm2-135m",
    "#/models/missing?source=measured&cohort=run:missing",
    "#/leaderboard?source=illustrative",
  ]) {
    assert.equal(canonicalModelRoute(route), route);
  }
  assert.equal(modelSection("token-evidence"), "v2-requests");
  assert.equal(modelSection("speed"), "v2-performance");
  assert.equal(modelSection("variant-evidence"), "v2-configuration");
  assert.equal(modelSection("v2-resources"), "v2-resources");
  assert.equal(modelSection("unknown"), undefined);
});

test("back links only accept the local leaderboard route", () => {
  assert.equal(leaderboardBack("#/leaderboard?sort=decode"), "/?sort=decode");
  for (const value of [
    null,
    "https://example.com",
    "javascript:alert(1)",
    "#/leaderboard-extra",
  ]) {
    assert.equal(leaderboardBack(value), "/");
  }
});
