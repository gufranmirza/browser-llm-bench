# Static deployment

`npm run build` produces `out/`. Upload that directory to any static host that serves directory `index.html` files. `trailingSlash` is enabled so direct page loads and refreshes work without SPA fallback rewrites. The exported 404 page handles unknown paths.

For a repository subpath such as GitHub Pages:

```sh
NEXT_PUBLIC_SITE_URL=https://gufranmirza.github.io/browser-llm-bench NEXT_PUBLIC_BASE_PATH=/browser-llm-bench npm run build
```

Verify that export with `NEXT_PUBLIC_BASE_PATH=/browser-llm-bench npm run verify:export`, or preview using `npm run preview -- --base-path /browser-llm-bench`.

Set `NEXT_PUBLIC_SITE_URL` to the full public deployment root at build time. It controls canonical URLs, Open Graph/Twitter images, the sitemap and WebSite structured data; it defaults to `https://browserllm.dev`. For a custom domain, set its HTTPS URL and leave `NEXT_PUBLIC_BASE_PATH` empty. Private local results and reports carry `noindex` and are excluded from the sitemap.

Set the base path at build time. Internal links, provider logos, report requests and worker URLs use the same prefix. Normal custom-domain hosting uses an empty base path.

The manual Pages workflow obtains the real public URL and base path from `configure-pages`, including custom-domain configuration. The CI workflow validates and exports the site. The separate Pages workflow is manually dispatched after GitHub Pages is configured to use GitHub Actions; it does not publish automatically merely because source code is pushed.

## Cloudflare Workers static assets

`wrangler.jsonc` uploads only `out/` to the `browser-llm-bench` Worker. It serves directory HTML with trailing slashes and the exported 404 page. There is no server adapter or Worker entry point; keep Next.js `output: "export"` enabled.

Configure Workers Builds with:

- Root directory: `/`
- Build command: `npm run build`
- Deploy command: `npm run deploy:cloudflare`
- Build variable: `NEXT_PUBLIC_SITE_URL=https://browserllm.dev`
- Leave `NEXT_PUBLIC_BASE_PATH` unset or empty.

Wrangler is pinned in the lockfile. The explicit assets configuration prevents framework auto-configuration from adding OpenNext or changing the static build. For a local authenticated deployment, build first, then run `npm run deploy:cloudflare`. `npx wrangler deploy --dry-run` validates the package without publishing.

Attach `browserllm.dev` to the Worker through Cloudflare’s domain settings. Verify HTTPS, direct model links, the runner, report JSON, sitemap and real 404 responses after deployment. Native collection stays in the local harness.

## Hosting behavior

- Serve JavaScript with a JavaScript MIME type, JSON as JSON, and WASM as `application/wasm` if you later host compiled model assets locally.
- Serve the public site over HTTPS. Localhost development is also a secure context for WebGPU.
- Keep `reports/manifest.json` revalidated when deploying new results; hashed Next.js and worker chunks may be cached immutably.
- Model and WASM downloads use the pinned upstream URLs. Their availability, CORS policy and the visitor's storage quota remain external constraints.
- The public site has no `/__harness` write API, native collector or filesystem access.

COOP/COEP headers must be configured by the host if a future runtime requires cross-origin isolation. The current WebGPU worker does not require enabling them. Adding isolation requires checking upstream model/WASM response compatibility first. GitHub Pages does not provide arbitrary per-response header configuration; the capability card should honestly show unavailable isolation there.

Fonts and provider logos are served locally. Built-in AI availability checks do not download or instantiate a model.

Search metadata, social images, crawlable static content and `llms.txt` are documented in [seo.md](seo.md). The export audit writes `artifacts/validation/seo-audit.json`.
