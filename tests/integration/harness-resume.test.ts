import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import { startServer } from "../../harness/controller/server";

test("a restarted harness restores completion from saved report evidence", async () => {
  const root = process.cwd();
  const runs = resolve("artifacts/runs");
  await mkdir(runs, { recursive: true });
  const job = await mkdtemp(join(runs, "resume-test-"));
  const out = await mkdtemp(join(tmpdir(), "browser-bench-resume-"));
  const preset = JSON.parse(
    await readFile("harness/presets/comparison.json", "utf8"),
  );
  const manifest = JSON.parse(
    await readFile("public/reports/manifest.json", "utf8"),
  );
  const entry = manifest.reports.find((r: { model: string }) =>
    preset.models.includes(r.model),
  );
  assert.ok(entry);
  const bytes = await readFile(join("public/reports", entry.file));
  const file = join(job, entry.id + ".json");
  await writeFile(file, bytes);
  await writeFile(
    join(job, "queue-results.json"),
    JSON.stringify([
      { id: entry.id, model: entry.model, file: relative(root, file) },
    ]),
  );
  let server: Awaited<ReturnType<typeof startServer>>["server"] | undefined;
  try {
    const started = await startServer({ port: 0, out, resumeJob: job });
    server = started.server;
    const status = await (
      await fetch(started.origin + "/__harness/status")
    ).json();
    assert.equal(status.jobDir, job);
    assert.equal(status.saved.length, 1);
    assert.equal(status.saved[0].model, entry.model);
    assert.equal(status.saved[0].status, "complete");
    assert.deepEqual(await readFile(file), bytes);
  } finally {
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    await rm(job, { recursive: true, force: true });
    await rm(out, { recursive: true, force: true });
  }
});
