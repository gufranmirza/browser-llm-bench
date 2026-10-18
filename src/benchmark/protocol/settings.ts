import { z } from "zod";
/** The same validated values drive the controls, worker and saved report. */
export const runSettingsSchema = z
  .object({
    temperature: z.number().finite().min(0).max(2),
    topP: z.number().finite().gt(0).max(1),
    seed: z.number().int().min(0).max(2147483647),
    maxTokens: z.number().int().min(1).max(2048),
    contextWindow: z.union([
      z.literal(512),
      z.literal(1024),
      z.literal(2048),
      z.literal(4096),
    ]),
    warmups: z.number().int().min(0).max(5),
    warmupTokens: z.number().int().min(1).max(256),
    requestLimitMs: z.number().int().min(10000).max(600000),
    thinking: z.boolean(),
  })
  .refine(
    (s) => s.maxTokens < s.contextWindow && s.warmupTokens < s.contextWindow,
    {
      message:
        "Output limits must be smaller than the context window, leaving room for the prompt.",
    },
  );
export type RunSettings = z.infer<typeof runSettingsSchema>;
export function defaultRunSettings(work: string): RunSettings {
  return {
    temperature: 0,
    topP: 1,
    seed: 42,
    maxTokens: work === "long-output" ? 256 : 64,
    contextWindow: 4096,
    warmups: 1,
    warmupTokens: 16,
    requestLimitMs: 60000,
    thinking: false,
  };
}
export function generationOptions(
  settings: RunSettings,
  warmup: boolean,
  supportsThinking: boolean,
) {
  return {
    temperature: settings.temperature,
    top_p: settings.topP,
    seed: settings.seed,
    max_tokens: warmup ? settings.warmupTokens : settings.maxTokens,
    ...(supportsThinking
      ? { extra_body: { enable_thinking: settings.thinking } }
      : {}),
  };
}
