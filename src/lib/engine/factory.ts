/**
 * Engine Factory - Create appropriate analysis engine based on configuration
 *
 * This factory pattern allows easy switching between Mock and LLM engines.
 */

import type { AnalysisEngine } from "./types";
import type { AnalysisEngineConfig } from "@/types";
import { MockEngine } from "./mock-engine";
import { GeminiEngine, createGeminiEngine } from "./gemini-engine";
import { GroqEngine, createGroqEngine } from "./groq-engine";

export type EngineType = "mock" | "gemini" | "openai" | "groq";

interface EngineFactoryConfig {
  type?: EngineType;
  apiKey?: string;
  engineConfig?: Partial<AnalysisEngineConfig>;
}

/**
 * Create an analysis engine based on configuration
 */
export function createAnalysisEngine(config?: EngineFactoryConfig): AnalysisEngine {
  // Determine engine type from config or environment
  const engineType = config?.type || getEngineTypeFromEnv();

  switch (engineType) {
    case "mock":
      return new MockEngine(config?.engineConfig);

    case "gemini":
      return createGeminiEngine(config?.apiKey, config?.engineConfig);

    case "groq":
      return createGroqEngine(config?.apiKey, config?.engineConfig);

    case "openai":
      // TODO: Implement OpenAI engine in future
      throw new Error("OpenAI engine not yet implemented. Use 'gemini', 'groq' or 'mock'.");

    default:
      throw new Error(`Unknown engine type: ${engineType}`);
  }
}

/**
 * Get engine type from environment variables
 */
function getEngineTypeFromEnv(): EngineType {
  // Check USE_MOCK_ENGINE first
  if (process.env.USE_MOCK_ENGINE === "true") {
    return "mock";
  }

  // Check LLM_ENGINE setting
  const llmEngine = process.env.LLM_ENGINE?.toLowerCase();

  if (llmEngine === "groq") {
    return "groq";
  }

  if (llmEngine === "gemini") {
    return "gemini";
  }

  if (llmEngine === "openai") {
    return "openai";
  }

  // Default to mock for safety
  return "mock";
}

/**
 * Check if mock engine is enabled
 */
export function isMockEngineEnabled(): boolean {
  return process.env.USE_MOCK_ENGINE === "true";
}

/**
 * Get the current engine type from environment
 */
export function getCurrentEngineType(): EngineType {
  return getEngineTypeFromEnv();
}
