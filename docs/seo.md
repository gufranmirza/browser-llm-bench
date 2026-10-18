# Static search and AI discovery

The site uses Next.js `output: "export"`. Everything below is generated during the build and served from `out/`; no runtime server, database, model API or crawler-specific rendering is required.

## Public pages

The homepage, methodology, compatibility, runner and 19 model-family pages have unique titles/descriptions, canonical URLs, Open Graph and Twitter cards, image descriptions, and content available before JavaScript executes. Published results use the same report selection and calculation helpers as the interactive views. Raw traces are fetched for interactive charts rather than serialized into initial HTML. Published measurement summaries are retained in a `noscript` fallback; JavaScript-enabled visitors see a styled loading layout until the interactive report is ready. Structured data and Markdown guides remain available independently of that loading state.

Model pages distinguish published measurements from configurations that have not been benchmarked. WebPage/breadcrumb JSON-LD describes public detail pages. Dataset entries link to actual published report JSON; no ratings, quality scores, invented organizations or fabricated measurement values are added.

The leaderboard alias canonicalizes to the homepage. Filter and report-selection query strings canonicalize to their stable page. Private local results/reports and error pages use `noindex` and are excluded from the sitemap. Private browser storage is never read during the build or included in discovery assets.

## Images and text guides

`npm run build:seo` generates 22 local 1200 × 630 PNG images: one per model family and one each for methodology, compatibility and the runner. The homepage uses the checked-in brand social card. Provider/model logos use the same mapping as the UI. Generated files live under ignored `public/seo/` and are copied to the static export.

`llms.txt` links to 23 concise Markdown guides, generated from the pinned catalog, curated public reports and methodology source. HTML pages expose their Markdown alternate and a `describedby` link to `llms.txt`. Guides preserve measurement scope, warmup exclusions, missing data and the absence of quality scoring. This follows the [llms.txt proposal](https://llmstxt.org/); it is supplemental agent documentation, not a search-ranking guarantee. [Google does not require special AI text files](https://developers.google.com/search/docs/appearance/ai-features).

## Deployment and verification

Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS deployment root, including any subpath, and `NEXT_PUBLIC_BASE_PATH` to the corresponding path. Build tools load the same Next.js environment-file conventions as the site. The manual Pages workflow reads the real deployment URL/base path from `configure-pages`; it does not deploy automatically on a source push.

```sh
npm run build
npm run verify:export
```

The export audit checks all 28 HTML pages and the 23 indexable canonical URLs, including blocking stylesheets before scripts, static/no-JavaScript headings, unique metadata, local image dimensions, JSON-LD, guide links, exact sitemap coverage, llms.txt links, icons, error responses and harness isolation. Its machine-readable output is saved to ignored `artifacts/validation/seo-audit.json`. CI repeats the audit under a repository subpath and a different public URL to catch hardcoded deployment links.

After deployment, verify the final property in Search Console, submit its `sitemap.xml`, and inspect representative live URLs. Local/static validation cannot prove that a search engine has crawled or indexed a site. A `robots.txt` only controls its origin root; on a GitHub Pages project subpath, the file in the project directory cannot replace the account origin's root policy. Page-level `noindex` and the separately submitted project sitemap still apply. A custom domain gives this site control of its own root robots file.
