import { z } from "zod";

const configSchema = z.object({
  MOONSHOT_API_KEY: z.string().min(1, "MOONSHOT_API_KEY is required"),
  KIMI_BASE_URL: z.string().url().default("https://api.kimi.com/coding/v1"),
  KIMI_MODEL: z.string().min(1).default("kimi-k3"),
  KIMI_REASONING_EFFORT: z.enum(["low", "high", "max"]).default("low"),
  MAX_AGENT_STEPS: z.coerce.number().int().positive().default(12),
  MAX_CONTEXT_TURNS: z.coerce.number().int().positive().default(4),
  MAX_CONTEXT_ESTIMATED_TOKENS: z.coerce
    .number()
    .int()
    .positive()
    .default(12_000),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return configSchema.parse(env);
}
