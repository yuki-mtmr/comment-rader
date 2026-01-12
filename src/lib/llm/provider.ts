
import { openai } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { LanguageModel } from 'ai';

// Initialize providers
const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
});

// Groq uses OpenAI-compatible API
const groq = createOpenAI({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY,
});

export type ModelProvider = 'openai' | 'groq' | 'gemini';

export function getModel(preferredProvider?: ModelProvider): LanguageModel {
    const provider = preferredProvider || (process.env.LLM_ENGINE as ModelProvider) || 'openai';

    switch (provider) {
        case 'groq':
            if (!process.env.GROQ_API_KEY) {
                console.warn('GROQ_API_KEY not found, falling back to OpenAI');
                return openai('gpt-4o-mini');
            }
            // Groq model ID
            return groq('llama-3.3-70b-versatile');

        case 'gemini':
            if (!process.env.GEMINI_API_KEY) {
                console.warn('GEMINI_API_KEY not found, falling back to OpenAI');
                return openai('gpt-4o-mini');
            }
            return google('gemini-1.5-flash');

        case 'openai':
        default:
            if (!process.env.OPENAI_API_KEY) {
                throw new Error('OPENAI_API_KEY is not set');
            }
            return openai(process.env.OPENAI_MODEL || 'gpt-4o-mini');
    }
}

export function getModelName(provider?: ModelProvider): string {
    const p = provider || (process.env.LLM_ENGINE as ModelProvider) || 'openai';
    return p;
}
