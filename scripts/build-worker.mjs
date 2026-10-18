import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
const directory = "public/benchmark-worker";
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });
await build({
  entryPoints: ["src/benchmark/worker/benchmark.worker.ts"],
  outdir: directory,
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  external: ["url"],
  target: "es2022",
  minify: true,
  chunkNames: "[name]-[hash]",
  legalComments: "linked",
  metafile: true,
}).then(async (result) => {
  console.log(
    `Worker: ${Object.keys(result.metafile.outputs).length} assets; runtime engines load on demand.`,
  );
});
