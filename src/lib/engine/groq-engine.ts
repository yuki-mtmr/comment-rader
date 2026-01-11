/**
 * GroqEngine - Fast sentiment analysis using Groq API
 */

import Groq from "groq-sdk";
import type {
    YouTubeComment,
    SentimentAnalysis,
    SentimentScore,
    EmotionTag,
    BatchAnalysisRequest,
    BatchAnalysisResponse,
    AnalysisEngineConfig,
} from "@/types";
import type { AnalysisEngine } from "./types";
import { SYSTEM_PROMPT, createBatchPrompt, createSingleCommentPrompt } from "@/lib/llm/prompts";
import { AnalysisError } from "@/types";

const DEFAULT_CONFIG: AnalysisEngineConfig = {
    batchSize: 20, // Increased for 70B which handles context better
    maxComments: 500,
    timeoutMs: 30000,
};

const DEFAULT_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

interface GroqResponse {
    id: number;
    commentId: string;
    score: number;
    emotions: string[];
    isSarcasm: boolean;
    reason: string;
}

export class GroqEngine implements AnalysisEngine {
    readonly name = "GroqEngine";
    private config: AnalysisEngineConfig;
    private client: Groq;

    constructor(apiKey: string, config?: Partial<AnalysisEngineConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.client = new Groq({ apiKey });
    }

    private parseJSON<T>(text: string): T {
        let cleanText = text.trim();

        // 1. Remove markdown code blocks
        const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
        const match = cleanText.match(codeBlockRegex);
        if (match && match[1]) {
            cleanText = match[1].trim();
        }

        // 2. Extract JSON part if there is preamble
        if (!cleanText.startsWith("[") && !cleanText.startsWith("{")) {
            const startIndex = cleanText.search(/[\[\{]/);
            const endIndex = Math.max(
                cleanText.lastIndexOf("]"),
                cleanText.lastIndexOf("}")
            );
            if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                cleanText = cleanText.slice(startIndex, endIndex + 1);
            }
        }

        // 3. FIX COMMON LLM MISTAKES BEFORE PARSING
        // a) Strip leading plus signs from numbers (e.g., +0.8 -> 0.8)
        cleanText = cleanText.replace(/:\s*\+([0-9.]+)/g, ': $1');

        // b) Fix quoted booleans (e.g., "isSarcasm": "false" -> "isSarcasm": false)
        cleanText = cleanText.replace(/:\s*"(true|false)"/gi, (m, p1) => `: ${p1.toLowerCase()}`);

        try {
            return JSON.parse(cleanText);
        } catch (error) {
            console.error("Failed to parse Groq JSON. Raw text:", text.slice(0, 200));
            console.error("Cleaned text:", cleanText.slice(0, 200));
            throw new Error(`Failed to parse JSON response from Groq: ${error instanceof Error ? error.message : "Invalid syntax"}`);
        }
    }

    async analyzeComment(comment: YouTubeComment): Promise<SentimentAnalysis> {
        const prompt = createSingleCommentPrompt(comment);

        try {
            const completion = await this.client.chat.completions.create({
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: prompt },
                ],
                model: DEFAULT_MODEL,
                response_format: { type: "json_object" },
            });

            const text = completion.choices[0]?.message?.content || "";
            const parsed = this.parseJSON<GroqResponse>(text);

            return {
                commentId: comment.id,
                score: this.clampScore(parsed.score),
                weightedScore: this.calculateWeightedScore(parsed.score, comment.likeCount),
                emotions: parsed.emotions as EmotionTag[],
                isSarcasm: parsed.isSarcasm,
                reason: parsed.reason,
            };
        } catch (error) {
            throw new AnalysisError(
                `Failed to analyze comment with Groq: ${error instanceof Error ? error.message : "Unknown error"}`,
                "GROQ_ERROR",
                error
            );
        }
    }

    async analyzeBatch(request: BatchAnalysisRequest): Promise<BatchAnalysisResponse> {
        const startTime = Date.now();

        if (request.comments.length === 0) {
            return {
                analyses: [],
                processingTimeMs: 0,
                tokensUsed: 0,
            };
        }

        const prompt = createBatchPrompt(request.comments, request.videoContext);

        try {
            console.log(`[Groq] Analyzing batch of ${request.comments.length} comments...`);
            const completion = await this.client.chat.completions.create({
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: prompt },
                ],
                model: DEFAULT_MODEL,
                response_format: { type: "json_object" },
            });

            const text = completion.choices[0]?.message?.content || "";
            console.log(`[Groq] Received response (${text.length} chars)`);

            let parsed: any;
            try {
                parsed = JSON.parse(text);
                console.log("[Groq] JSON Keys found:", Object.keys(parsed));
            } catch (e) {
                console.error("[Groq] JSON Parse Error. Raw text:", text);
                throw e;
            }

            let parsedArray: GroqResponse[] = [];

            if (Array.isArray(parsed)) {
                parsedArray = parsed;
            } else if (parsed.analyses && Array.isArray(parsed.analyses)) {
                parsedArray = parsed.analyses;
            } else if (parsed.results && Array.isArray(parsed.results)) {
                parsedArray = parsed.results;
            } else if (parsed.comments && Array.isArray(parsed.comments)) {
                parsedArray = parsed.comments;
            } else {
                // Fallback for some models that might return a single object when one item is requested
                console.warn("[Groq] Unexpected JSON structure, attempting fallback mapping");
                parsedArray = [parsed];
            }

            console.log(`[Groq] Successfully parsed ${parsedArray.length} analysis items`);

            const analyses: SentimentAnalysis[] = request.comments.map((comment) => {
                const item = parsedArray.find((p) => p.commentId === comment.id);

                if (!item) {
                    return {
                        commentId: comment.id,
                        score: 0,
                        weightedScore: 0,
                        emotions: ["neutral"] as EmotionTag[],
                        isSarcasm: false,
                        reason: "Groq skipped this comment in batch analysis",
                    };
                }

                return {
                    commentId: item.commentId,
                    score: this.clampScore(item.score),
                    weightedScore: this.calculateWeightedScore(item.score, comment.likeCount),
                    emotions: (item.emotions || ["neutral"]) as EmotionTag[],
                    isSarcasm: !!item.isSarcasm,
                    reason: item.reason || "No reason provided",
                };
            });

            return {
                analyses,
                processingTimeMs: Date.now() - startTime,
                tokensUsed: completion.usage?.total_tokens || 0,
            };
        } catch (error: any) {
            console.error("[Groq] Batch Analysis Error:", error.message);
            // Check for quota error (Groq uses 429 for RPM/RPD and 413 for TPM sometimes)
            const isQuotaError =
                error.status === 429 ||
                error.status === 413 ||
                error.message?.includes("429") ||
                error.message?.includes("413") ||
                error.message?.includes("quota") ||
                error.message?.includes("rate_limit_exceeded");

            if (isQuotaError) {
                console.error("Groq API Quota Exceeded. Returning partial results.");
                const fallbackAnalyses = request.comments.map(c => ({
                    commentId: c.id,
                    score: 0,
                    weightedScore: 0,
                    emotions: ["neutral"] as EmotionTag[],
                    isSarcasm: false,
                    reason: "Analysis skipped due to Groq API limits.",
                }));

                return {
                    analyses: fallbackAnalyses,
                    processingTimeMs: Date.now() - startTime,
                    tokensUsed: 0,
                    isPartial: true,
                };
            }

            throw new AnalysisError(
                `Failed to analyze batch with Groq: ${error.message}`,
                "GROQ_BATCH_ERROR",
                error
            );
        }
    }

    async generateContextSummary(video: { title: string; channelName: string; description?: string; transcript?: string }): Promise<string> {
        const prompt = `Define the "Stance Profile" of this video.
Title: ${video.title}
Creator: ${video.channelName}
1. Main message
2. What behavior/people is the creator attacking? (e.g. "people who only talk")
3. What values is the creator supporting? (e.g. "direct action")
Transcript Snippet: ${video.transcript?.slice(0, 3000)}`;

        try {
            const completion = await this.client.chat.completions.create({
                messages: [
                    { role: "system", content: "You are a helpful assistant that summarizes video content." },
                    { role: "user", content: prompt },
                ],
                model: DEFAULT_MODEL,
            });

            return completion.choices[0]?.message?.content?.trim() || "Summary unavailable.";
        } catch (error: any) {
            console.error("[Groq] Summary failed:", error.message);
            return video.description?.slice(0, 200) || "Video about " + video.title;
        }
    }

    getConfig(): AnalysisEngineConfig {
        return { ...this.config };
    }

    updateConfig(config: Partial<AnalysisEngineConfig>): void {
        this.config = { ...this.config, ...config };
    }

    private clampScore(score: number): SentimentScore {
        return Math.max(-1, Math.min(1, score)) as SentimentScore;
    }

    private calculateWeightedScore(score: SentimentScore, likeCount: number): SentimentScore {
        const weight = 1 + Math.log10(likeCount + 1);
        const weighted = score * weight;
        const normalized = weighted / 7;
        return this.clampScore(normalized);
    }
}

export function createGroqEngine(apiKey?: string, config?: Partial<AnalysisEngineConfig>): GroqEngine {
    const key = apiKey || process.env.GROQ_API_KEY;
    if (!key) {
        throw new Error("Groq API key is required. Set GROQ_API_KEY environment variable.");
    }
    return new GroqEngine(key, config);
}
