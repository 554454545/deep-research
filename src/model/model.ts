import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

/** 模型 ID（用户常用 DeepSeek，仅文本） */
export const DEEPSEEK_MODEL_ID = process.env.DEEPSEEK_MODEL_ID ?? "deepseek-v4-flash";

/**
 * 模型工厂（懒加载）：调用时才校验 key，缺 key 抛明确错误。
 * openai-compatible，可替换为任意兼容服务。
 */
export function getModel(): LanguageModel {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DEEPSEEK_API_KEY 未配置：请先 export DEEPSEEK_API_KEY=sk-xxx（或在 .env 中设置）"
    );
  }
  const provider = createOpenAICompatible({
    name: "deepseek",
    baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
    apiKey,
  });
  return provider(DEEPSEEK_MODEL_ID);
}
