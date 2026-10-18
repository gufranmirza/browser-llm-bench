import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { startServer } from "../harness/controller/server";
const prefix = process.env.NEXT_PUBLIC_BASE_PATH || "";
const { server, origin } = await startServer({
  port: 0,
  siteOnly: true,
  basePath: prefix,
});
let pages = 0;
async function verify(directory: string) {
  for (const entry of await readdir(directory)) {
    const path = resolve(directory, entry);
    if ((await stat(path)).isDirectory()) {
      await verify(path);
      continue;
    }
    if (entry !== "index.html") continue;
    const url =
      "/" +
      relative(resolve("out"), directory).replaceAll("\\", "/") +
      (directory === resolve("out") ? "" : "/");
    const response = await fetch(origin + prefix + url);
    assert.equal(response.status, 200, url);
    const html = (await response.text()).replace(
      /<link\b[^>]*rel="(?:preconnect|dns-prefetch)"[^>]*>/g,
      "",
    );
    for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      const asset = match[1].replaceAll("&amp;", "&");
      if (!asset.startsWith("/") || asset.includes("?")) continue;
      assert.equal((await fetch(origin + asset)).status, 200, asset);
    }
    pages++;
  }
}
try {
  await verify(resolve("out"));
  assert.equal((await fetch(origin + "/__harness/status")).status, 404);
  const html = await readFile("out/index.html", "utf8");
  assert.ok(
    !html.includes("benchmark-worker/"),
    "Landing page must not load the inference worker",
  );
  console.log(
    `Verified ${pages} exported pages, referenced static assets and disabled harness endpoints.`,
  );
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
