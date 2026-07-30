import OpenAI from "openai";

import type { AppConfig } from "../config.js";

export function createKimiClient(config: AppConfig): OpenAI {
  return new OpenAI({
    apiKey: config.MOONSHOT_API_KEY,
    baseURL: config.KIMI_BASE_URL,
  });
}
