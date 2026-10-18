import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { runSettingsSchema } from "../../src/benchmark/protocol/settings";
import { runnableModels } from "../../src/benchmark/runtime/catalog";
export const presetSchema = z
  .object({
    name: z.string(),
    models: z.array(z.string()).min(1).max(100),
    workload: z.enum([
      "short",
      "repeat",
      "long-input",
      "long-output",
      "context",
    ]),
    mode: z.enum([
      "smoke",
      "standard",
      "extended",
      "minute",
      "timed",
      "session",
      "session-count",
    ]),
    deviceLabel: z.string().max(120),
    profiling: z.boolean(),
    requirePower: z.boolean(),
    settings: runSettingsSchema,
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.models).size !== value.models.length ||
      value.models.some((id) => !runnableModels.some((m) => m.id === id))
    )
      ctx.addIssue({
        code: "custom",
        message: "Every queued model must be a unique pinned artifact",
      });
  });
export type Preset = z.infer<typeof presetSchema>;
export async function loadPreset(file: string) {
  return presetSchema.parse(JSON.parse(await readFile(resolve(file), "utf8")));
}
