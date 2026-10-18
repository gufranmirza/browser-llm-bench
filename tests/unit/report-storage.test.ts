import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseReports } from "../../src/benchmark/schemas/report";

import type { ReportBackend } from "../../src/lib/report-storage";
import {
  legacyReports,
  loadSavedReports,
  ReportStorageError,
  saveReports,
} from "../../src/lib/report-storage";

const reports = parseReports(
  JSON.parse(
    readFileSync(
      new URL("../../tests/fixtures/legacy-repeat.json", import.meta.url),
      "utf8",
    ),
  ),
);
test("legacy report migration retains original evidence and new saves survive a fresh load", async () => {
  let stored: unknown;
  const backend: ReportBackend = {
    async read() {
      return structuredClone(stored);
    },
    async write(value) {
      stored = structuredClone(value);
    },
  };
  const backup = JSON.stringify(reports);
  const legacy = legacyReports({ getItem: () => backup });
  assert.deepEqual(await loadSavedReports(legacy, backend), reports);
  const next = [{ ...reports[0], id: "new-session" }, ...reports];
  await saveReports(next, backend);
  assert.deepEqual(await loadSavedReports(legacy, backend), next);
  assert.equal(JSON.stringify(legacy), backup);
});
test("a failed transaction rejects the save instead of reporting import success", async () => {
  const backend: ReportBackend = {
    async read() {
      return reports;
    },
    async write() {
      throw new Error("quota exceeded");
    },
  };
  await assert.rejects(
    saveReports(reports, backend),
    (e) =>
      e instanceof ReportStorageError && e.message.includes("quota exceeded"),
  );
  assert.deepEqual(await loadSavedReports([], backend), reports);
});
test("an explicitly empty saved store does not resurrect the legacy backup", async () => {
  let writes = 0;
  const backend: ReportBackend = {
    async read() {
      return [];
    },
    async write() {
      writes++;
    },
  };
  assert.deepEqual(await loadSavedReports(reports, backend), []);
  assert.equal(writes, 0);
});
