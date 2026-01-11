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
    batchSize: 10, // Reduced to stay under Groq free tier TPM limits (6000/min)
    maxComments: 500,
    timeoutMs: 30000,
};

const DEFAULT_MODEL = "llama-3.1-8b-instant";

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
            const parsed = JSON.parse(text) as GroqResponse;

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
