import assert from "node:assert/strict";
import test from "node:test";
import { completedModels } from "../../harness/controller/queue";

test("resuming skips completed models but retries failed and incomplete results", () => {
  const saved = ["complete", "failed", "cancelled", "incomplete"].map(
    (status, i) => ({
      id: String(i),
      model: `model-${i}`,
      file: `${i}.json`,
      status,
    }),
  );
  assert.deepEqual([...completedModels(saved)], ["model-0"]);
  assert.deepEqual([...completedModels([...saved, saved[0]])], ["model-0"]);
});
