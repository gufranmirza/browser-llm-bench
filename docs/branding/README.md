# Browser LLM Bench identity

The primary mark is a browser window with measurement bars, drawn on a 32 px grid with a uniform 1.5 px stroke. It uses the site’s existing green (`#334d3f`); black and reversed white variants are provided in `public/brand/`.

The bars represent measurement, not an intelligence rating or a promise of increasing performance. `trace.svg` and `gauge.svg` are alternate directions retained for review.

The shared display name lives in `src/lib/brand.ts`. Report schema/protocol identifiers and browser storage keys retain their original values for compatibility. Download filenames use the new name.

To regenerate the multi-size ICO, Apple touch icon and social PNG from the committed vector sources:

```sh
npm run build:brand
```

The SVG favicon supports light and dark browser themes. Header and footer marks are decorative beside the visible name. Deployment URL configuration is described in [deployment.md](../deployment.md).
