export const models = [
  {
    name: "SmolLM2 135M",
    family: "Hugging Face",
    quant: "q0f16",
    size: 270,
    color: "#a64830",
    speed: 87.4,
    ttft: 126,
    download: 4.8,
    init: 1.2,
    prep: 0.6,
  },
  {
    name: "Qwen2.5 0.5B",
    family: "Alibaba",
    quant: "q4f16_1",
    size: 380,
    color: "#65764d",
    speed: 64.2,
    ttft: 182,
    download: 6.4,
    init: 1.8,
    prep: 0.9,
  },
  {
    name: "Llama 3.2 1B",
    family: "Meta",
    quant: "q4f16_1",
    size: 720,
    color: "#536e80",
    speed: 43.8,
    ttft: 264,
    download: 11.8,
    init: 2.6,
    prep: 1.1,
  },
  {
    name: "SmolLM2 1.7B",
    family: "Hugging Face",
    quant: "q4f16_1",
    size: 1030,
    color: "#8e713c",
    speed: 32.6,
    ttft: 342,
    download: 16.6,
    init: 3.2,
    prep: 1.4,
  },
  {
    name: "Gemma 2 2B",
    family: "Google",
    quant: "q4f16_1",
    size: 1500,
    color: "#74617f",
    speed: 24.1,
    ttft: 418,
    download: 24.1,
    init: 4.3,
    prep: 1.8,
  },
  {
    name: "Qwen2.5 3B",
    family: "Alibaba",
    quant: "q4f16_1",
    size: 1900,
    color: "#4e7269",
    speed: 18.7,
    ttft: 566,
    download: 30.2,
    init: 5.1,
    prep: 2.1,
  },
];
export type Fixture = (typeof models)[number] & {
  runtime: string;
  browser: string;
  device: string;
  status: string;
};
export function fixtures(
  device: string,
  browser: string,
  runtime: string,
): Fixture[] {
  const factor =
    device === "MacBook Air · M2 · 16 GB"
      ? 1
      : device === "Windows laptop · RTX 4060 · 16 GB"
        ? 1.25
        : 0.43;
  return models.map((m, i) => ({
    ...m,
    runtime,
    browser,
    device,
    speed: +(m.speed * factor * (runtime === "WebLLM" ? 1 : 0.78)).toFixed(1),
    ttft: Math.round(m.ttft / factor),
    init: +(m.init / factor).toFixed(1),
    status:
      browser === "Firefox 141"
        ? "Untested"
        : device === "Android phone · 8 GB" && i === 5
          ? "Failed"
          : "Complete",
  }));
}
