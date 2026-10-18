import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseReports } from "../../src/benchmark/schemas/report";
import {
  detectBrowserCapabilities,
  reportedBrowser,
  supportsSimd,
} from "../../src/features/capabilities/detect";

test("browser identity does not confuse Edge with its Chrome compatibility token", () => {
  assert.equal(
    reportedBrowser("Chrome/155.0.0.0 Safari/537.36 Edg/155.0.1.2"),
    "Edge 155.0.1.2",
  );
  assert.equal(
    reportedBrowser("Version/26.0 Mobile Safari/605.1.15"),
    "Safari 26.0",
  );
  assert.equal(reportedBrowser("Unknown"), "Not exposed");
  assert.equal(supportsSimd(), true);
});
test("missing or denied browser APIs remain unknown and capability metadata survives report parsing", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      userAgent: "Chrome/155.0.0.0",
      platform: "MacIntel",
      hardwareConcurrency: 0,
      storage: {
        estimate: async () => {
          throw Error("Denied");
        },
        persisted: async () => {
          throw Error("Denied");
        },
      },
    },
  });
  try {
    const result = await detectBrowserCapabilities();
    assert.equal(result.platform, "macOS");
    assert.equal(result.memoryGiB, null);
    assert.equal(result.logicalCpus, null);
    assert.deepEqual(result.storage, {
      usageBytes: null,
      quotaBytes: null,
      persisted: null,
    });
    assert.equal(result.gpu.label, "Not exposed");
    assert.equal(
      result.features.find((x) => x.name === "WebGPU")?.status,
      "unavailable",
    );
    const report = JSON.parse(
      readFileSync("tests/fixtures/profile-repeat.json", "utf8"),
    );
    report.environment.browserCapabilities = result;
    assert.deepEqual(
      parseReports(report)[0].environment.browserCapabilities,
      result,
    );
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
