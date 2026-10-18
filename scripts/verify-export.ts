import assert from "node:assert/strict";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import nextEnv from "@next/env";
import { startServer } from "../harness/controller/server";
import { brand } from "../src/lib/brand";
import {
  catalog,
  primaryMeasuredRows,
  reportRow,
} from "../src/features/leaderboard/data";
import { comparisonGroups } from "../src/features/leaderboard/comparison";
import { readPublishedReports } from "../src/lib/published-reports.server";
nextEnv.loadEnvConfig(process.cwd(), false);
const { publicUrl } = await import("../src/lib/metadata");
const prefix = process.env.NEXT_PUBLIC_BASE_PATH || "";
const { server, origin } = await startServer({
  port: 0,
  siteOnly: true,
  basePath: prefix,
});
const audit: {
  path: string;
  title: string;
  description: string;
  canonical: string;
  image: string;
  indexable: boolean;
  h1: string;
}[] = [];
const titles = new Set<string>();
const descriptions = new Set<string>();
let pages = 0;
const decode = (value: string) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
function meta(head: string, name: string) {
  const tag = [...head.matchAll(/<meta\b[^>]*>/g)]
    .map((m) => m[0])
    .find(
      (tag) =>
        tag.includes(`name="${name}"`) || tag.includes(`property="${name}"`),
    );
  return decode(tag?.match(/content="([^"]*)"/)?.[1] ?? "");
}
async function localAsset(url: string) {
  assert.ok(
    url.startsWith(publicUrl()),
    `Asset must use the configured deployment root: ${url}`,
  );
  const key = url.slice(publicUrl().length);
  const response = await fetch(`${origin}${prefix}/${key}`);
  assert.equal(response.status, 200, key);
  return response;
}
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
    const head = html.split("</head>")[0];
    const stylesheets = [
      ...head.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g),
    ];
    assert.ok(
      stylesheets.length,
      `Blocking styles must be in the document head: ${url}`,
    );
    for (const [tag] of stylesheets) {
      assert.ok(
        !/media="(?:print|not all)"|onload=/.test(tag),
        `Styles must apply before first paint: ${url}`,
      );
      assert.ok(
        head.indexOf(tag) < head.indexOf("<script"),
        `Styles must precede scripts: ${url}`,
      );
    }
    assert.match(html, /<html lang="en"/);
    assert.match(head, /charset="utf-8"/i);
    assert.ok(meta(head, "viewport").includes("width=device-width"));
    assert.ok(html.includes(brand.name), `Missing identity: ${url}`);
    assert.ok(
      !html.includes("Browser Inference Bench"),
      `Old identity: ${url}`,
    );
    const isError = url === "/_not-found/" || url === "/404/";
    const isPrivate = url.startsWith("/local-");
    const title = decode(head.match(/<title>([^<]+)<\/title>/)?.[1] ?? "");
    const description = meta(head, "description");
    const canonical = decode(
      head.match(/rel="canonical" href="([^"]+)"/)?.[1] ?? "",
    );
    const image = meta(head, "og:image");
    const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
    if (!isError) {
      assert.ok(title.includes(brand.name), `Missing branded title: ${url}`);
      assert.ok(description.length >= 30, `Missing useful description: ${url}`);
      assert.equal(
        canonical,
        publicUrl(url === "/leaderboard/" ? "/" : url),
        `Canonical: ${url}`,
      );
      assert.equal(meta(head, "og:site_name"), brand.name);
      assert.equal(meta(head, "og:title"), title);
      assert.equal(meta(head, "og:description"), description);
      assert.equal(meta(head, "og:url"), canonical);
      assert.equal(meta(head, "twitter:card"), "summary_large_image");
      assert.equal(meta(head, "twitter:image"), image);
      assert.equal(meta(head, "twitter:title"), title);
      assert.equal(meta(head, "twitter:description"), description);
      assert.ok(meta(head, "twitter:image:alt").length > 10);
      assert.ok(meta(head, "og:image:alt").length > 10, `Image alt: ${url}`);
      const social = await localAsset(image);
      assert.ok(social.headers.get("content-type")?.startsWith("image/png"));
      const bytes = Buffer.from(await social.arrayBuffer());
      assert.equal(bytes.readUInt32BE(16), 1200, `Social width: ${url}`);
      assert.equal(bytes.readUInt32BE(20), 630, `Social height: ${url}`);
      assert.equal(meta(head, "og:image:width"), "1200");
      assert.equal(meta(head, "og:image:height"), "630");
      if (!isPrivate) {
        assert.equal(
          h1s.length,
          1,
          `One crawlable H1 before JavaScript: ${url}`,
        );
        assert.ok(
          html.length < 200_000,
          `Do not embed raw report traces in HTML: ${url}`,
        );
        assert.equal(meta(head, "robots"), "index, follow");
        assert.ok(meta(head, "googlebot").includes("max-image-preview:large"));
        const guide = decode(
          head.match(
            /rel="alternate" type="text\/markdown" href="([^"]+)"/,
          )?.[1] ?? "",
        );
        assert.ok(guide, `Markdown alternate: ${url}`);
        const guideResponse = await localAsset(guide);
        assert.ok((await guideResponse.text()).startsWith("# "));
        if (url !== "/leaderboard/") {
          assert.ok(!titles.has(title), `Duplicate title: ${url}`);
          assert.ok(
            !descriptions.has(description),
            `Duplicate description: ${url}`,
          );
          titles.add(title);
          descriptions.add(description);
          const blocks = [
            ...html.matchAll(
              /<script type="application\/ld\+json">([^<]+)<\/script>/g,
            ),
          ].map((m) => JSON.parse(m[1]));
          assert.ok(blocks.length > 0, `Structured data: ${url}`);
          assert.ok(
            blocks.every((b) => b["@context"] === "https://schema.org"),
          );
        }
      }
    }
    if (isPrivate || isError)
      assert.ok(
        meta(head, "robots").includes("noindex"),
        `Exclude private/error page: ${url}`,
      );
    for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      const asset = decode(match[1]);
      if (!asset.startsWith("/") || asset.includes("?")) continue;
      assert.equal((await fetch(origin + asset)).status, 200, asset);
    }
    audit.push({
      path: url,
      title,
      description,
      canonical,
      image,
      indexable: !isError && !isPrivate && url !== "/leaderboard/",
      h1: decode(h1s[0]?.[1].replace(/<[^>]+>/g, "") ?? ""),
    });
    pages++;
  }
}
try {
  await verify(resolve("out"));
  assert.equal((await fetch(origin + "/__harness/status")).status, 404);
  assert.equal((await fetch(origin + prefix + "/does-not-exist/")).status, 404);
  const html = await readFile("out/index.html", "utf8");
  const structured = html.match(
    /<script type="application\/ld\+json">([^<]+)<\/script>/,
  );
  assert.ok(structured);
  assert.equal(JSON.parse(structured[1]).name, brand.name);
  assert.equal(JSON.parse(structured[1]).url, publicUrl());
  assert.ok(html.includes('data-published-snapshot="leaderboard"'));
  const comparison = comparisonGroups(
    (await readPublishedReports()).map(reportRow),
  )[0];
  const example = primaryMeasuredRows(comparison?.rows ?? []).find(
    (row) => row.decode !== null,
  );
  if (example)
    assert.ok(
      html.includes(example.artifact.model.name) &&
        html.includes(example.decode!.toFixed(1)),
      "Published measurements must exist in initial HTML",
    );
  assert.ok(
    !html.includes("benchmark-worker/"),
    "Landing page must not load inference worker",
  );
  for (const [asset, mime] of [
    ["favicon.ico", "image/x-icon"],
    ["favicon.svg", "image/svg+xml"],
    ["apple-touch-icon.png", "image/png"],
    ["sitemap.xml", "application/xml"],
    ["robots.txt", "text/plain"],
    ["llms.txt", "text/plain"],
  ]) {
    const response = await fetch(`${origin}${prefix}/${asset}`);
    assert.equal(response.status, 200, asset);
    assert.ok(response.headers.get("content-type")?.startsWith(mime), asset);
  }
  const sitemap = await readFile("out/sitemap.xml", "utf8");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
    decode(m[1]),
  );
  assert.deepEqual(
    new Set(locations),
    new Set(audit.filter((p) => p.indexable).map((p) => p.canonical)),
    "Sitemap must contain precisely the indexable canonical pages",
  );
  for (const match of sitemap.matchAll(/<image:loc>([^<]+)<\/image:loc>/g))
    await localAsset(decode(match[1]));
  assert.ok(
    (await readFile("out/robots.txt", "utf8")).includes(
      publicUrl("sitemap.xml"),
    ),
  );
  const llms = await readFile("out/llms.txt", "utf8");
  assert.ok(llms.startsWith(`# ${brand.name}\n\n>`));
  assert.ok(!llms.includes("local-report") && !llms.includes("local-results"));
  for (const match of llms.matchAll(/\]\((https?:[^)]+)\)/g)) {
    if (match[1].startsWith(publicUrl())) await localAsset(match[1]);
  }
  for (const model of catalog) {
    const page = await readFile(`out/models/${model.slug}/index.html`, "utf8");
    assert.ok(page.includes('data-published-snapshot="model"'), model.slug);
  }
  await mkdir("artifacts/validation", { recursive: true });
  await writeFile(
    "artifacts/validation/seo-audit.json",
    JSON.stringify(
      {
        site: publicUrl(),
        pages: audit,
        sitemapPages: locations.length,
        checks:
          "Passed: pre-JavaScript headings/content, unique titles/descriptions, canonical/Open Graph/Twitter tags, 1200×630 images, Markdown guides, JSON-LD, sitemap coverage, llms links, private/error noindex, asset links, 404 and harness isolation.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Verified ${pages} exported pages; ${locations.length} indexable canonicals; SEO/social images, static content, guides, llms.txt, sitemap, links and harness isolation. Audit: artifacts/validation/seo-audit.json`,
  );
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
