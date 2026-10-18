import { request } from "node:http";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isWithin, startServer } from "../../harness/controller/server";
test("static preview serves real files, refuses writes and excludes local harness APIs", async () => {
  const out = await mkdtemp(join(tmpdir(), "browser-bench-static-"));
  await writeFile(join(out, "index.html"), "Static export fixture");
  await writeFile(join(out, "404.html"), "Missing page");
  const { server, origin } = await startServer({
    port: 0,
    siteOnly: true,
    out,
  });
  try {
    const page = await fetch(origin + "/");
    assert.equal(page.status, 200);
    assert.equal(await page.text(), "Static export fixture");
    assert.equal((await fetch(origin + "/missing/")).status, 404);
    assert.equal(
      (await fetch(origin + "/reports/x.json", { method: "POST" })).status,
      405,
    );
    assert.equal((await fetch(origin + "/__harness/status")).status, 404);
    const badHost = await new Promise<number>((resolve) => {
      request(origin, { headers: { Host: "other.example" } }, (response) => {
        response.resume();
        resolve(response.statusCode!);
      }).end();
    });
    assert.equal(badHost, 403);
    assert.equal(isWithin(out, join(out, "..", "secret")), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(out, { recursive: true, force: true });
  }
});
