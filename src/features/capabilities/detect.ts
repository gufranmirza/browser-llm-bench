import { z } from "zod";
const nullableNumber = z.number().finite().nonnegative().nullable();
export const browserCapabilitiesSchema = z.object({
  checkedAt: z.string(),
  browser: z.string(),
  browserSource: z.string(),
  platform: z.string(),
  platformSource: z.string(),
  architecture: z.string().nullable(),
  deviceModel: z.string().nullable(),
  logicalCpus: nullableNumber,
  memoryGiB: nullableNumber,
  storage: z.object({
    usageBytes: nullableNumber,
    quotaBytes: nullableNumber,
    persisted: z.boolean().nullable(),
  }),
  gpu: z.object({
    label: z.string(),
    source: z.string(),
    vendor: z.string().nullable(),
    architecture: z.string().nullable(),
    device: z.string().nullable(),
    description: z.string().nullable(),
    webglRenderer: z.string().nullable(),
    maxBufferSize: nullableNumber,
    features: z.array(z.string()),
  }),
  features: z.array(
    z.object({
      name: z.string(),
      status: z.enum([
        "available",
        "exposed",
        "unavailable",
        "unknown",
        "downloadable",
        "downloading",
      ]),
      detail: z.string(),
    }),
  ),
});
export type BrowserCapabilities = z.infer<typeof browserCapabilitiesSchema>;
type Feature = BrowserCapabilities["features"][number];
type BrowserHints = {
  fullVersionList?: { brand: string; version: string }[];
  platformVersion?: string;
  architecture?: string;
  bitness?: string;
  model?: string;
};
type AdapterInfo = {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
};
type Adapter = {
  info?: AdapterInfo;
  limits: { maxBufferSize: number };
  features: Iterable<string>;
};
export function reportedBrowser(ua: string) {
  const hit =
    ua.match(/(Edg)\/([\d.]+)/) ?? ua.match(/(Firefox|Chrome)\/([\d.]+)/);
  if (hit) return `${hit[1] === "Edg" ? "Edge" : hit[1]} ${hit[2]}`;
  const safari = ua.match(/Version\/([\d.]+).*Safari/);
  return safari ? `Safari ${safari[1]}` : "Not exposed";
}
export function supportsSimd() {
  try {
    return WebAssembly.validate(
      new Uint8Array([
        0,
        97,
        115,
        109,
        1,
        0,
        0,
        0,
        1,
        5,
        1,
        96,
        0,
        1,
        123,
        3,
        2,
        1,
        0,
        10,
        22,
        1,
        20,
        0,
        253,
        12,
        ...Array(16).fill(0),
        11,
      ]),
    );
  } catch {
    return false;
  }
}
async function bounded<T>(task: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), 2500);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
export async function detectBrowserCapabilities(): Promise<BrowserCapabilities> {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: any;
    gpu?: any;
    ml?: unknown;
  };
  const [hints, adapter, estimate, persisted, ai] = await Promise.all([
    bounded<BrowserHints | null>(
      nav.userAgentData?.getHighEntropyValues([
        "architecture",
        "bitness",
        "model",
        "platformVersion",
        "fullVersionList",
      ]) ?? Promise.resolve(null),
      null,
    ),
    bounded<Adapter | null>(
      nav.gpu?.requestAdapter() ?? Promise.resolve(null),
      null,
    ),
    bounded(navigator.storage?.estimate?.() ?? Promise.resolve(null), null),
    bounded(navigator.storage?.persisted?.() ?? Promise.resolve(null), null),
    bounded<string | null>(
      (async () => {
        const api = (globalThis as any).LanguageModel;
        return typeof api?.availability === "function"
          ? await api.availability()
          : null;
      })(),
      null,
    ),
  ]);
  const brands = hints?.fullVersionList ?? nav.userAgentData?.brands;
  const brand =
    brands?.find((b: any) =>
      /Microsoft Edge|Google Chrome|Opera/.test(b.brand),
    ) ?? brands?.find((b: any) => b.brand === "Chromium");
  const platform =
    nav.userAgentData?.platform ??
    (/Mac/.test(nav.platform)
      ? "macOS"
      : /Win/.test(nav.platform)
        ? "Windows"
        : nav.platform || "Not exposed");
  const info = adapter?.info;
  let renderer: string | null = null;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    if (gl && debug) renderer = gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    /* A privacy policy may hide WebGL identification. */
  }
  let threads = false;
  try {
    threads =
      typeof Worker !== "undefined" &&
      globalThis.crossOriginIsolated &&
      typeof SharedArrayBuffer !== "undefined" &&
      new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true })
        .buffer instanceof SharedArrayBuffer;
  } catch {
    /* Not enabled in this context. */
  }
  const exposed = (name: string, value: boolean, detail: string): Feature => ({
    name,
    status: value ? "exposed" : "unavailable",
    detail,
  });
  const feature = (name: string, value: boolean, detail: string): Feature => ({
    name,
    status: value ? "available" : "unavailable",
    detail,
  });
  const languageStatus: Feature["status"] =
    ai === "available" ||
    ai === "unavailable" ||
    ai === "downloadable" ||
    ai === "downloading"
      ? ai
      : "unknown";
  return {
    checkedAt: new Date().toISOString(),
    browser: brand
      ? `${brand.brand} ${brand.version}`
      : reportedBrowser(nav.userAgent),
    browserSource: brand
      ? "User-Agent Client Hints; version may be reduced by browser policy"
      : "User agent; identity and version may be reduced",
    platform: `${platform}${hints?.platformVersion ? ` ${hints.platformVersion}` : ""}`,
    platformSource: hints?.platformVersion
      ? "User-Agent Client Hints platform version; not an independent OS inspection"
      : "Browser platform hint; exact OS version is not exposed",
    architecture: hints?.architecture
      ? `${hints.architecture}${hints.bitness ? ` ${hints.bitness}-bit` : ""}`
      : null,
    deviceModel: hints?.model || null,
    logicalCpus: nav.hardwareConcurrency || null,
    memoryGiB: nav.deviceMemory || null,
    storage: {
      usageBytes: estimate?.usage ?? null,
      quotaBytes: estimate?.quota ?? null,
      persisted,
    },
    gpu: {
      label:
        info?.description ||
        renderer ||
        [info?.vendor, info?.architecture].filter(Boolean).join(" · ") ||
        "Not exposed",
      source: info?.description
        ? "WebGPU adapter hint"
        : renderer
          ? "WebGL renderer hint; may differ from the WebGPU adapter used for inference"
          : "WebGPU adapter hint",
      vendor: info?.vendor || null,
      architecture: info?.architecture || null,
      device: info?.device || null,
      description: info?.description || null,
      webglRenderer: renderer,
      maxBufferSize: adapter?.limits?.maxBufferSize ?? null,
      features: adapter ? Array.from(adapter.features) : [],
    },
    features: [
      feature(
        "WebGPU",
        !!adapter,
        "An adapter was returned. Available VRAM, allocation and successful inference are not guaranteed.",
      ),
      exposed(
        "WebNN",
        !!nav.ml,
        "API exposure only; no neural-network context was created. This runner uses WebLLM / WebGPU.",
      ),
      feature(
        "WASM",
        typeof WebAssembly !== "undefined" &&
          WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])),
        "A minimal WebAssembly module validates.",
      ),
      feature(
        "SIMD",
        supportsSimd(),
        "A WebAssembly SIMD instruction validates.",
      ),
      feature(
        "Threads",
        threads,
        "Requires shared WebAssembly memory, Workers and cross-origin isolation. Threaded inference is not tested.",
      ),
      exposed(
        "IndexedDB",
        typeof indexedDB !== "undefined",
        "Checks browser database API exposure. Storage can still be denied, evicted or exhausted.",
      ),
      exposed(
        "OPFS",
        typeof navigator.storage?.getDirectory === "function",
        "Checks origin-private filesystem API exposure; no files are created by this check.",
      ),
      exposed(
        "Workers",
        typeof Worker !== "undefined",
        "Checks Worker API exposure. The benchmark creates a dedicated inference worker when started.",
      ),
      feature(
        "Shared memory",
        typeof SharedArrayBuffer !== "undefined",
        "Checks SharedArrayBuffer exposure in this browsing context.",
      ),
      exposed(
        "Service workers",
        "serviceWorker" in navigator,
        "API exposure only; this check does not register a service worker.",
      ),
      feature(
        "Isolation",
        globalThis.crossOriginIsolated,
        "crossOriginIsolated; normally requires COOP and COEP response headers.",
      ),
      {
        name: "Built-in AI",
        status: languageStatus,
        detail:
          ai === null
            ? "Prompt API readiness was not exposed or could not be verified. It is separate from WebLLM."
            : `Prompt API availability: ${ai}. No session or model download is started by this check. Separate from WebLLM.`,
      },
    ],
  };
}
