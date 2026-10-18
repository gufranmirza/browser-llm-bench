import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { startServer } from "../harness/controller/server";
import { brand } from "../src/lib/brand";
import { publicUrl } from "../src/lib/metadata";
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
    assert.ok(html.includes(brand.name), `Missing site identity: ${url}`);
    assert.ok(
      !html.includes("Browser Inference Bench"),
      `Old identity: ${url}`,
    );
    if (url !== "/_not-found/" && url !== "/404/") {
      assert.match(html, /<meta name="description" content="[^"]+"/);
      const canonical = url === "/leaderboard/" ? "/" : url;
      assert.ok(
        html.includes(`rel="canonical" href="${publicUrl(canonical)}"`),
        `Wrong canonical URL: ${url}`,
      );
      assert.ok(
        html.includes(`property="og:site_name" content="${brand.name}"`),
      );
      assert.ok(html.includes(publicUrl("brand/social-card.png")));
    }
    if (url.startsWith("/local-")) {
      assert.match(html, /name="robots" content="noindex, nofollow"/);
    }
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
  const structured = html.match(
    /<script type="application\/ld\+json">([^<]+)<\/script>/,
  );
  assert.ok(structured, "Homepage must identify the site with WebSite data");
  assert.equal(JSON.parse(structured[1]).name, brand.name);
  assert.equal(JSON.parse(structured[1]).url, publicUrl());
  for (const [asset, mime] of [
    ["favicon.ico", "image/x-icon"],
    ["favicon.svg", "image/svg+xml"],
    ["apple-touch-icon.png", "image/png"],
    ["brand/social-card.png", "image/png"],
    ["sitemap.xml", "application/xml"],
    ["robots.txt", "text/plain"],
  ]) {
    const response = await fetch(`${origin}${prefix}/${asset}`);
    assert.equal(response.status, 200, asset);
    assert.ok(response.headers.get("content-type")?.startsWith(mime), asset);
  }
  const sitemap = await readFile("out/sitemap.xml", "utf8");
  assert.ok(sitemap.includes(publicUrl("models/qwen3-4b/")));
  assert.ok(
    !sitemap.includes("local-report") && !sitemap.includes("local-results"),
  );
  assert.ok(
    (await readFile("out/robots.txt", "utf8")).includes(
      publicUrl("sitemap.xml"),
    ),
  );
  assert.ok(
    !html.includes("benchmark-worker/"),
    "Landing page must not load the inference worker",
  );
  console.log(
    `Verified ${pages} exported pages, branding/SEO, icons, sitemap, referenced assets and disabled harness endpoints.`,
  );
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
