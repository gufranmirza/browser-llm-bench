import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";
import live from "../src/benchmark/runtime/catalog";
import {
  protocolLabel,
  summarizeResources,
} from "../src/benchmark/metrics/resources";
import { comparisonGroups } from "../src/features/leaderboard/comparison";
import {
  catalog,
  primaryMeasuredRows,
  primaryReportFor,
  reportRow,
  tokenRange,
} from "../src/features/leaderboard/data";
import { brand } from "../src/lib/brand";
import nextEnv from "@next/env";
import { providerIdentity } from "../src/lib/providers";
import { readPublishedReports } from "../src/lib/published-reports.server";

nextEnv.loadEnvConfig(process.cwd(), process.argv.includes("--development"));
const { publicUrl } = await import("../src/lib/metadata");
const reports = await readPublishedReports();
const rows = reports.map(reportRow);
await rm("public/seo", { recursive: true, force: true });
const number = (n: number | null, digits = 2) =>
  n === null ? "Not measured" : n.toFixed(digits);
const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
async function save(path: string, content: string | Buffer) {
  await mkdir(dirname(`public/${path}`), { recursive: true });
  await writeFile(`public/${path}`, content);
}
const mark = await sharp("public/brand/logo.svg")
  .resize(60, 60)
  .png()
  .toBuffer();
async function social(
  path: string,
  title: string,
  subtitle: string,
  provider?: { src?: string; name: string },
) {
  const icon = provider?.src
    ? await sharp(`public/${provider.src}`)
        .resize(80, 80, { fit: "inside" })
        .png()
        .toBuffer()
    : mark;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#f0f2ef"/><rect x="48" y="48" width="1104" height="534" rx="24" fill="#fff" stroke="#dce2dc"/><image x="100" y="100" width="60" height="60" href="data:image/png;base64,${mark.toString("base64")}"/><g font-family="Arial,sans-serif"><text x="182" y="141" font-size="30" font-weight="600" fill="#263c30">${brand.name}</text><image x="100" y="233" width="72" height="72" href="data:image/png;base64,${icon.toString("base64")}"/><text x="202" y="284" font-size="${title.length > 26 ? 42 : 52}" font-weight="600" letter-spacing="-1" fill="#263c30">${escape(title)}</text><text x="102" y="368" font-size="28" fill="#607165">${escape(subtitle)}</text><text x="102" y="485" font-size="24" fill="#607165">Speed · Latency · Resource usage</text></g></svg>`;
  await save(path, await sharp(Buffer.from(svg)).png().toBuffer());
}
const scope = `Measurements describe an exact model artifact, quantization, runtime, browser, device, workload and cache state. Performance medians exclude warmup. Tokenizers and actual output lengths differ across models. These tests do not measure intelligence or task quality; no overall model score is assigned. Missing telemetry is unavailable, never zero. CPU is dedicated Chrome process-tree capacity; Chrome GPU time is experimental driver-accounted time including rendering, not GPU utilization. Power is whole-host subsystem power, not model-only power. Browser memory is summed process footprint, not deduplicated RAM.`;
const setup = `The primary comparison loads one model once and runs one warmup followed by 60 measured requests in three windows of 20. Each request starts immediately after the previous response completes. There are 90-second loaded-idle gaps after windows one and two. After the third window: 30 seconds loaded idle, unload, then 15 seconds observation. Conversation history resets between requests. The windows share one session and are not independent trials. Older reports can use different schedules: read each report's saved protocol before comparing.`;
const group = comparisonGroups(rows)[0];
const comparison = primaryMeasuredRows(group?.rows ?? []).sort(
  (a, b) => (b.decode ?? -Infinity) - (a.decode ?? -Infinity),
);
let index = `# ${brand.name}\n\n${brand.description}\n\nCanonical page: ${publicUrl()}\n\n## Interpretation\n\n${scope}\n\n## Run protocol\n\n${setup}\n\n## Published comparison\n\n${group ? protocolLabel(group.rows[0]) : "No published comparison"}\n\n| Model | Encoding | Generation (tok/s) | First output (ms) | Response (s) | Peak Chrome footprint (GB) | Completed |\n| --- | --- | --- | --- | --- | --- | --- |\n`;
for (const row of comparison)
  index += `| [${row.artifact.model.name}](${publicUrl(`models/${row.artifact.model.slug}/`)}) | ${row.artifact.encoding} | ${number(row.decode)} | ${number(row.firstOutputMs)} | ${number(row.responseMs === null ? null : row.responseMs / 1000)} | ${number(summarizeResources(row.report).peakMemory)} | ${row.completed} |\n`;
index += `\n[Measurement methodology](${publicUrl("seo/guides/methodology.md")})\n`;
await save("seo/guides/index.md", index);
const methodology = await readFile("docs/methodology.md", "utf8");
await save(
  "seo/guides/methodology.md",
  `# Browser LLM Bench methodology\n\nCanonical page: ${publicUrl("methodology/")}\n\n${methodology.replace(/^# .+\n/, "")}\n\n## Timing formulas\n\nFor a valid request: first-output latency = first non-empty streamed text timestamp minus worker request-start timestamp. Response time = stream-completion timestamp minus worker request-start timestamp. Generation speed is the runtime-reported decode tokens per second. Within-run summaries are medians across valid measured requests, excluding warmup. Sequential request throughput = completed requests divided by the union of request-window durations in seconds; token throughput uses completed output tokens in the numerator. Do not include the long idle gaps in these throughput denominators.\n\nCPU capacity (%) = 100 × sum of eligible process CPU time / (logical CPU count × observed interval duration). Use complete observed intervals wholly inside request windows and state the coverage. Resource scoring and task quality are planned, not current outputs.\n`,
);
await save(
  "seo/guides/run.md",
  `# Run a private browser LLM benchmark\n\nCanonical page: ${publicUrl("run/")}\n\nChoose a supported model artifact and exact encoding, runtime version, workload, token budgets, sampling settings, warmups, request schedule, seed and safety limits. WebGPU and sufficient browser/GPU memory are required; requirements vary by artifact. Model weights download from their pinned upstream hosts. Inference runs locally in a browser worker. Prompts and outputs are not sent to a model API.\n\n${setup}\n\nBrowser capability checks describe exposed APIs, not guaranteed compatibility. A public browser run does not include privileged native CPU/GPU/power collectors. Finished reports remain in the current browser's private local storage, with View report and Download JSON actions. They never automatically update the curated leaderboard.\n`,
);
await save(
  "seo/guides/compatibility.md",
  `# Browser and runtime compatibility\n\nCanonical page: ${publicUrl("compatibility/")}\n\nThe current runner uses pinned WebLLM 0.2.82 and 0.2.86 artifacts on WebGPU in a browser worker. Other runtimes such as Transformers.js/ONNX are planned, not implemented. Required shader features and buffer limits are checked per artifact.\n\nComplete means a captured run passed basic output validity, not task accuracy. Untested means no evidence for that exact setup. Unsupported means a required capability is missing. Failed means an attempted setup failed initialization, generation or basic output validation. Browser-reported memory, GPU identity and other device hints may be approximate or unavailable. Native Chrome captures describe the recorded Mac/browser environment and do not establish mobile or cross-browser compatibility.\n`,
);
const modelLinks: string[] = [];
for (const model of catalog) {
  const variants = live.models.filter((m) => m.slug === model.slug);
  const evidence = variants.flatMap((a) => {
    const report = primaryReportFor(reports, a.id);
    return report ? [reportRow(report)] : [];
  });
  const guide = `seo/guides/models/${model.slug}.md`;
  modelLinks.push(
    `- [${model.name}](${publicUrl(guide)}): ${model.parameters}B parameters; ${evidence.length ? "published measurements available" : "configuration only, no published measurement"}.`,
  );
  let text = `# ${model.name} browser LLM configuration and benchmarks\n\nCanonical page: ${publicUrl(`models/${model.slug}/`)}\n\nProvider: ${model.family}. Nominal parameters: ${model.parameters}B. [Upstream model card](${model.card}).\n\n${scope}\n\n## Pinned runnable artifacts\n\n`;
  for (const a of variants)
    text += `- ${a.id}: ${a.quantization}; ${a.runtime}; context limit ${a.contextWindow} tokens; required shader features ${a.requiredFeatures.join(", ") || "none beyond WebGPU"}; revision ${a.revision}. [Pinned model files](${a.modelUrl}).\n`;
  text += "\n## Published evidence\n\n";
  if (!evidence.length)
    text +=
      "No measured report is published for this model yet. Available artifacts do not establish performance or device compatibility.\n";
  for (const row of evidence)
    text += `### ${row.artifact.encoding} — ${row.report!.id}\n\nCaptured: ${row.report!.createdAt}. ${row.runtime}; ${row.browser}; ${row.device}. Protocol: ${protocolLabel(row)}. Completed measured requests: ${row.completed}. Output tokens per request: ${tokenRange(row.outputTokens)}.\n\n- Median runtime-reported decode speed: ${number(row.decode)} tok/s.\n- Median first-output latency: ${number(row.firstOutputMs)} ms.\n- Median actual response time: ${number(row.responseMs === null ? null : row.responseMs / 1000)} s.\n- Sampled peak Chrome footprint: ${number(summarizeResources(row.report).peakMemory)} GB.\n- [Raw published JSON report](${publicUrl(`reports/${row.report!.id}.json`)}).\n\n`;
  await save(guide, text);
  await social(
    `seo/models/${model.slug}.png`,
    model.name,
    `${model.family} · ${model.parameters}B · ${evidence.length ? "Published browser measurements" : "Configuration · not yet benchmarked"}`,
    providerIdentity(model.family, model.name),
  );
}
await Promise.all([
  social(
    "seo/methodology.png",
    "Benchmark methodology",
    "Run protocol, timing formulas and resource accounting",
  ),
  social(
    "seo/run.png",
    "Run a private benchmark",
    "Choose a model. Measure it locally. Inspect your report.",
  ),
  social(
    "seo/compatibility.png",
    "Browser compatibility",
    "WebGPU requirements, runtime support and measured evidence",
  ),
]);
await save(
  "llms.txt",
  `# ${brand.name}\n\n> Measured browser LLM inference performance and scoped resource usage. Curated public reports and a private, on-device runner.\n\n${scope}\n\n${setup}\n\n## Guides\n\n- [Leaderboard and measured comparison](${publicUrl("seo/guides/index.md")}): Published results and comparison limitations.\n- [Methodology](${publicUrl("seo/guides/methodology.md")}): Protocol, timing formulas, resource accounting and scoring status.\n- [Private benchmark runner](${publicUrl("seo/guides/run.md")}): Supported configuration options and local report behavior.\n- [Compatibility](${publicUrl("seo/guides/compatibility.md")}): Implemented runtimes, requirements and evidence states.\n\n## Models\n\n${modelLinks.join("\n")}\n\n## Optional\n\n- [Published report manifest](${publicUrl("reports/manifest.json")}): Curated raw JSON evidence only; never private user runs.\n- [Source repository](https://github.com/gufranmirza/browser-llm-bench): Static website, versioned catalog and local macOS harness.\n`,
);
console.log(
  `Generated llms.txt, ${catalog.length + 4} Markdown guides and ${catalog.length + 3} social images from public source data.`,
);
