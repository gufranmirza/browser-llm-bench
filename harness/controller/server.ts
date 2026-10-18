import { build } from "esbuild";
import { execFile } from "node:child_process";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { reportSchema } from "../../src/benchmark/schemas/report";
import { loadPreset } from "./config";
const exec = promisify(execFile);
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};
export function isWithin(parent: string, child: string) {
  const p = relative(parent, child);
  return (
    p === "" || (!p.startsWith(".." + sep) && p !== ".." && !p.startsWith(sep))
  );
}
export async function readBody(req: IncomingMessage) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 20_000_000)
      throw Error("Report exceeds 20 MB limit");
  }
  return JSON.parse(body);
}
export async function startServer({
  port = 4173,
  siteOnly = false,
  out = "out",
  presetFile = "harness/presets/comparison.json",
  sessionFile = "artifacts/current-session.json",
  basePath = "",
} = {}) {
  const root = process.cwd(),
    output = await realpath(resolve(root, out)),
    artifacts = resolve(root, "artifacts"),
    consoleDir = resolve(artifacts, "harness-ui");
  const preset = siteOnly ? null : await loadPreset(presetFile);
  if (!siteOnly) {
    await mkdir(consoleDir, { recursive: true });
    await build({
      entryPoints: ["harness/controller/console.tsx"],
      outfile: resolve(consoleDir, "console.js"),
      bundle: true,
      platform: "browser",
      format: "esm",
      target: "es2022",
      minify: true,
      loader: { ".svg": "file", ".png": "file", ".jpg": "file" },
      define: {
        "process.env.NEXT_PUBLIC_BASE_PATH": '""',
        "process.env.NODE_ENV": '"production"',
      },
    });
  }
  const jobDir = resolve(
    artifacts,
    "runs",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  if (!siteOnly) await mkdir(jobDir, { recursive: true });
  const saved: { id: string; model: string; file: string }[] = [];
  let origin = "";
  async function session() {
    const data = JSON.parse(await readFile(resolve(root, sessionFile), "utf8"));
    if (!Number.isInteger(data.rootPid) || typeof data.profilePath !== "string")
      throw Error("Invalid dedicated Chrome session");
    return data;
  }
  async function captureStatus() {
    try {
      const data = await session();
      const pointer = JSON.parse(
        await readFile(
          resolve(root, sessionFile, "..", "current-capture.json"),
          "utf8",
        ),
      );
      const capture = await realpath(pointer.capturePath);
      if (!isWithin(artifacts, capture))
        throw Error("Capture must be inside artifacts");
      const control = JSON.parse(
        await readFile(resolve(capture, "capture-control.json"), "utf8"),
      );
      return {
        available: true,
        fresh:
          control.status === "recording" &&
          typeof control.lastPowerFrameEpochMs === "number" &&
          Date.now() - control.lastPowerFrameEpochMs < 5000 &&
          pointer.rootPid === data.rootPid,
        capturePath: capture,
        remainingMs: Math.max(
          0,
          control.startedEpochMs + control.maxSeconds * 1000 - Date.now(),
        ),
        rootPid: data.rootPid,
      };
    } catch {
      return {
        available: false,
        fresh: false,
        capturePath: null,
        remainingMs: 0,
        rootPid: null,
      };
    }
  }
  const server = createServer(async (req, res) => {
    const send = (code: number, value: unknown) => {
      res.writeHead(code, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    const host = req.headers.host;
    if (host !== new URL(origin).host)
      return send(403, { error: "Loopback host required" });
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url || "/", origin).pathname);
    } catch {
      return send(400, { error: "Invalid URL" });
    }
    try {
      if (pathname.startsWith("/__harness")) {
        if (siteOnly)
          return send(404, { error: "Harness is disabled in site preview" });
        if (req.method !== "GET" && req.headers.origin !== origin)
          return send(403, { error: "Same-origin local harness only" });
        if (req.method === "GET" && pathname === "/__harness/status")
          return send(200, {
            preset,
            saved,
            jobDir,
            ...(await captureStatus()),
          });
        if (
          req.method === "GET" &&
          (pathname === "/__harness/" || pathname === "/__harness")
        ) {
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(
            '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Browser LLM Bench · Local harness</title><link rel="stylesheet" href="/__harness/console.css"></head><body><div id="harness-root"></div><script type="module" src="/__harness/console.js"></script></body></html>',
          );
          return;
        }
        if (
          req.method === "GET" &&
          /^\/__harness\/console\.(js|css)$/.test(pathname)
        ) {
          const file = resolve(consoleDir, pathname.split("/").at(-1)!);
          res.writeHead(200, {
            "Content-Type": types[extname(file)],
            "Cache-Control": "no-store",
          });
          res.end(await readFile(file));
          return;
        }
        if (req.method === "POST" && pathname === "/__harness/report") {
          if (!req.headers["content-type"]?.startsWith("application/json"))
            return send(415, { error: "JSON required" });
          const report = reportSchema.parse((await readBody(req)).report);
          if (!preset!.models.includes(report.model))
            throw Error("Model is not in this queue");
          const existing = saved.find((r) => r.id === report.id);
          if (existing) return send(200, existing);
          const dir = resolve(jobDir, report.id);
          if (!/^[a-f0-9-]{36}$/.test(report.id)) throw Error("Invalid run ID");
          await mkdir(dir, { recursive: true });
          const file = resolve(dir, "browser-report.json");
          await writeFile(file, JSON.stringify(report, null, 2) + "\n");
          const capture = await captureStatus();
          let finalized = false;
          if (capture.capturePath) {
            await new Promise((r) => setTimeout(r, 2200));
            await exec(
              "python3",
              [
                "-m",
                "harness.publishing.finalize_report",
                file,
                capture.capturePath,
              ],
              { cwd: root, maxBuffer: 2_000_000 },
            );
            finalized = true;
          }
          const result = {
            id: report.id,
            model: report.model,
            file: relative(root, file),
            finalized,
          };
          saved.push(result);
          await writeFile(
            resolve(jobDir, "queue-results.json"),
            JSON.stringify(saved, null, 2) + "\n",
          );
          return send(200, result);
        }
        return send(404, { error: "Unknown harness endpoint" });
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        return send(405, { error: "Static site is read-only" });
      if (basePath) {
        if (pathname !== basePath && !pathname.startsWith(basePath + "/"))
          return send(404, { error: "Outside configured site base path" });
        pathname = pathname.slice(basePath.length) || "/";
      }
      let file = resolve(output, "." + pathname);
      if (!isWithin(output, file)) return send(403, { error: "Invalid path" });
      let code = 200;
      try {
        if ((await stat(file)).isDirectory())
          file = resolve(file, "index.html");
        file = await realpath(file);
        if (!isWithin(output, file))
          return send(403, { error: "Invalid path" });
      } catch {
        file = resolve(output, "404.html");
        code = 404;
      }
      const bytes = await readFile(file);
      res.writeHead(code, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch (e) {
      send(500, { error: e instanceof Error ? e.message : String(e) });
    }
  });
  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve),
  );
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing listener");
  origin = `http://127.0.0.1:${address.port}`;
  console.log(
    `${siteOnly ? "Static site" : "Local harness"}: ${origin}${siteOnly ? "/" : "/__harness/"}`,
  );
  return { server, origin, jobDir };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const option = (name: string, fallback: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  void startServer({
    port: Number(option("--port", "4173")),
    siteOnly: args.includes("--site-only"),
    out: option("--out", "out"),
    presetFile: option("--preset", "harness/presets/comparison.json"),
    sessionFile: option("--session", "artifacts/current-session.json"),
    basePath: option("--base-path", ""),
  }).catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
