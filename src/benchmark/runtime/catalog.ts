import type { ModelRecord } from "@mlc-ai/web-llm";
import pins from "../../../catalog/models.json";
export type RunnableModel = {
  id: string;
  name: string;
  slug: string;
  parameters: number;
  family: string;
  card: string;
  runtime: "WebLLM 0.2.82" | "WebLLM 0.2.86";
  modelUrl: string;
  revision: string;
  modelLib: string;
  quantization: string;
  thinkingDisabled: boolean;
  weightShardBytes: number;
  estimatedVramMB: number | null;
  requiredFeatures: string[];
  bufferSizeRequiredBytes: number;
  contextWindow: number;
  validationStatus: "benchmarked" | "package-verified";
  record?: ModelRecord & { model_manifest?: string };
  artifact: {
    manifestUrl: string;
    manifestSha256: string;
    weightShardBytes: number;
    shards: number;
    nominalParameters: number;
    theoreticalFP16Bytes: number;
  };
};
const models = pins.models as RunnableModel[];
export default { models };
export const runnableModels = models;
export const modelGroups = [...new Set(models.map((m) => m.slug))].map(
  (slug) => {
    const variants = models.filter((m) => m.slug === slug);
    return { ...variants[0], variants };
  },
);
