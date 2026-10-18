# Static deployment

`npm run build` produces `out/`. Upload that directory to any static host that serves directory `index.html` files. `trailingSlash` is enabled so direct page loads and refreshes work without SPA fallback rewrites. The exported 404 page handles unknown paths.

For a repository subpath such as GitHub Pages:

```sh
NEXT_PUBLIC_BASE_PATH=/browser-llm-bench npm run build
```

Verify that export with `NEXT_PUBLIC_BASE_PATH=/browser-llm-bench npm run verify:export`, or preview using `npm run preview -- --base-path /browser-llm-bench`.

Set the base path at build time. Internal links, provider logos, report requests and worker URLs use the same prefix. Normal custom-domain hosting uses an empty base path.

The CI workflow validates and exports the site. The separate Pages workflow is manually dispatched after GitHub Pages is configured to use GitHub Actions; it does not publish automatically merely because source code is pushed.

## Hosting behavior

- Serve JavaScript with a JavaScript MIME type, JSON as JSON, and WASM as `application/wasm` if you later host compiled model assets locally.
- Serve the public site over HTTPS. Localhost development is also a secure context for WebGPU.
- Keep `reports/manifest.json` revalidated when deploying new results; hashed Next.js and worker chunks may be cached immutably.
- Model and WASM downloads use the pinned upstream URLs. Their availability, CORS policy and the visitor's storage quota remain external constraints.
- The public site has no `/__harness` write API, native collector or filesystem access.

COOP/COEP headers must be configured by the host if a future runtime requires cross-origin isolation. The current WebGPU worker does not require enabling them. Adding isolation requires checking upstream model/WASM response compatibility first. GitHub Pages does not provide arbitrary per-response header configuration; the capability card should honestly show unavailable isolation there.

Fonts and provider logos are served locally. Built-in AI availability checks do not download or instantiate a model.
