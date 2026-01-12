/**
 * OpenAIEngine - Sentiment analysis using OpenAI API
 */

import OpenAI from "openai";
import type {
    YouTubeComment,
    SentimentAnalysis,
    SentimentScore,
    EmotionTag,
    BatchAnalysisRequest,
    BatchAnalysisResponse,
    AnalysisEngineConfig,
    AxisProfile,
    StanceLabel,
    YouTubeVideo,
} from "@/types";
import type { AnalysisEngine } from "./types";
import {
    SYSTEM_PROMPT,
    createBatchPrompt,
    createSingleCommentPrompt,
    AXIS_SYSTEM_PROMPT,
    createAxisBatchPrompt,
    createLiteBatchPrompt,
    createLiteAxisBatchPrompt
} from "@/lib/llm/prompts";
import { AnalysisError } from "@/types";
import { applyStanceSynthesis, sortCommentsByThreadOrder } from "./stance-logic";

const DEFAULT_CONFIG: AnalysisEngineConfig = {
    batchSize: 50, // Increased for better performance
    maxComments: 1000,
    timeoutMs: 60000,
};

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

interface OpenAIResponse {
    commentId: string;
    score: number;
    emotions: string[];
    isSarcasm: boolean;
    reason: string;
}

interface AxisOpenAIResponse extends OpenAIResponse {
    label: StanceLabel;
    stance_direction?: "support" | "oppose" | "neutral" | "unknown";
    stance_intensity?: number;
    emotion_polarity?: "positive" | "negative" | "mixed" | "none";
    target?: "creator" | "antagonist" | "values" | "topic" | "parent_author" | "other" | "unknown";
    confidenceLevel?: "high" | "medium" | "low";
    confidence: number;
    axisEvidence: string;
    reply_relation_to_parent?: string;
    replyRelation?: string;
    speech_act?: string;
    speechAct?: string;
}

export class OpenAIEngine implements AnalysisEngine {
    readonly name = "OpenAIEngine";
    private config: AnalysisEngineConfig;
    private client: OpenAI;

    constructor(apiKey: string, config?: Partial<AnalysisEngineConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.client = new OpenAI({ apiKey });
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

        // 3. Fix common LLM mistakes before parsing
        cleanText = cleanText.replace(/:\s*\+([0-9.]+)/g, ': $1');
        cleanText = cleanText.replace(/:\s*"(true|false)"/gi, (m, p1) => `: ${p1.toLowerCase()}`);
        cleanText = cleanText.replace(/"([^"]+)"\s*(null|true|false|[-0-9.\[\{])/g, '"$1": $2');
        cleanText = cleanText.replace(/,\s*([\]\}])/g, '$1');

        try {
            return JSON.parse(cleanText) as T;
        } catch (parseError) {
            // Attempt to repair truncated JSON
            try {
                const repaired = this.repairTruncatedJSON(cleanText);
                return JSON.parse(repaired) as T;
            } catch (innerError) {
                console.error("[OpenAI] JSON Parse Failed. Raw text:");
                console.error(text);
                throw new AnalysisError(
                    "Failed to parse OpenAI response as JSON",
                    "OPENAI_PARSE_ERROR",
                    { parseError, rawText: text }
                );
            }
        }
    }

    /**
     * Attempts to repair truncated JSON by closing open braces and brackets.
     */
    private repairTruncatedJSON(json: string): string {
        let repaired = json.trim();

        // If it ends with a comma after a value, remove it
        repaired = repaired.replace(/,\s*$/, "");

        const stack: string[] = [];
        let inString = false;
        let escaped = false;

        for (let i = 0; i < repaired.length; i++) {
            const char = repaired[i];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === "\\") {
                escaped = true;
                continue;
            }
            if (char === '"') {
                inString = !inString;
                continue;
            }
            if (!inString) {
                if (char === "{" || char === "[") {
                    stack.push(char);
                } else if (char === "}") {
                    if (stack.length > 0 && stack[stack.length - 1] === "{") {
                        stack.pop();
                    }
                } else if (char === "]") {
                    if (stack.length > 0 && stack[stack.length - 1] === "[") {
                        stack.pop();
                    }
                }
            }
        }

        // Close the last open string if necessary
        if (inString) {
            repaired += '"';
        }

        // Remove any incomplete key-value pairs at the end
        // e.g., ... , "someKey":
        repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*[^,\]\}]*$/, "");
        // e.g., ... , "someKey"
        repaired = repaired.replace(/,\s*"[^"]*"\s*$/, "");

        // Close open objects and arrays
        while (stack.length > 0) {
            const last = stack.pop();
            if (last === "{") repaired += "}";
            else if (last === "[") repaired += "]";
        }

        return repaired;
    }

    getConfig(): AnalysisEngineConfig {
        return { ...this.config };
    }

    updateConfig(config: Partial<AnalysisEngineConfig>): void {
        this.config = { ...this.config, ...config };
    }

    async analyzeComment(comment: YouTubeComment): Promise<SentimentAnalysis> {
        const result = await this.analyzeBatch({
            comments: [comment],
            isLite: false,
        });
        return result.analyses[0];
    }

    async generateContextSummary(video: {
        title: string;
        channelName: string;
        description?: string;
        transcript?: string;
    }): Promise<string> {
        const prompt = `Summarize this YouTube video in 2-3 sentences for context:
Title: ${video.title}
Channel: ${video.channelName}
Description: ${video.description?.slice(0, 500) || "N/A"}
Transcript: ${video.transcript?.slice(0, 2000) || "N/A"}

Provide a concise summary focusing on the main topic and key points.`;

        try {
            const response = await this.client.chat.completions.create({
                model: DEFAULT_MODEL,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3,
                max_completion_tokens: 400,
            });

            return response.choices[0]?.message?.content || "Video summary unavailable.";
        } catch (error: any) {
            console.error("[OpenAI] Context summary failed:", error);
            console.error("[OpenAI] Error details:", error.message, error.status, error.code);

            // Fallback to basic description
            if (video.description) {
                console.log("[OpenAI] Using fallback: video description");
                return video.description.slice(0, 200) + "...";
            }

            console.log("[OpenAI] Using fallback: video title");
            return `Video about: ${video.title}`;
        }
    }

    async generateAxisProfile(video: YouTubeVideo): Promise<AxisProfile> {
        const prompt = `Analyze this YouTube video and extract the main axis (論点) for stance analysis:

Title: ${video.title}
Channel: ${video.channelName}
Description: ${video.description?.slice(0, 500) || "N/A"}
Transcript: ${video.transcript?.slice(0, 2000) || "N/A"}

Return JSON with this exact structure:
  "axisStatement": "Concise central claim (e.g., '座学より実践学習が重要か')",
  "axisType": "critic" | "education" | "other",
  "mainAxis": "The central claim or question",
  "creatorPosition": "Creator's stance",
  "targetOfCriticism": "Optional target",
  "supportedValues": "Optional values",
  "protagonists": ["Name1", "Name2"],
  "antagonists": ["Name1", "Name2"],
  "coreValues": ["Value1", "Value2"],
  "negativeValues": ["Value1", "Value2"],
  "stanceRules": ["Rule1", "Rule2"],
  "lexiconHints": ["Term1", "Term2"],
  "caveats": ["Caveat1", "Caveat2"]
}`;

        try {
            const response = await this.client.chat.completions.create({
                model: DEFAULT_MODEL,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3,
                max_completion_tokens: 1000,
                response_format: { type: "json_object" },
            });

            const content = response.choices[0]?.message?.content || "{}";
            const parsed = this.parseJSON<Omit<AxisProfile, "videoId" | "generatedAt">>(content);

            return {
                videoId: video.id,
                mainAxis: parsed.mainAxis,
                axisStatement: parsed.axisStatement,
                axisType: parsed.axisType,
                creatorPosition: parsed.creatorPosition,
                targetOfCriticism: parsed.targetOfCriticism,
                supportedValues: parsed.supportedValues,
                protagonists: parsed.protagonists || [],
                antagonists: parsed.antagonists || [],
                coreValues: parsed.coreValues || [],
                negativeValues: parsed.negativeValues || [],
                stanceRules: parsed.stanceRules || [],
                lexiconHints: parsed.lexiconHints || [],
                caveats: parsed.caveats || [],
                generatedAt: new Date().toISOString(),
            };
        } catch (error: any) {
            console.error("[OpenAI] Axis profile generation failed:", error);
            console.error("[OpenAI] Error details:", error.message, error.status, error.code);

            // Fallback to basic profile
            console.log("[OpenAI] Using fallback: basic axis profile");
            return {
                videoId: video.id,
                mainAxis: `Discussion about: ${video.title}`,
                axisStatement: video.title,
                axisType: "other",
                creatorPosition: `The creator's perspective on ${video.title}`,
                targetOfCriticism: undefined,
                supportedValues: undefined,
                protagonists: [],
                antagonists: [],
                coreValues: [],
                negativeValues: [],
                stanceRules: [],
                lexiconHints: [],
                caveats: [],
                generatedAt: new Date().toISOString(),
            };
        }
    }

    async analyzeBatch(request: BatchAnalysisRequest): Promise<BatchAnalysisResponse> {
        const startTime = Date.now();
        const { comments, isLite, videoContext } = request;

        if (comments.length === 0) {
            return {
                analyses: [],
                processingTimeMs: 0,
                tokensUsed: 0,
            };
        }

        // Use lite or full prompt based on isLite flag
        const prompt = isLite
            ? createLiteBatchPrompt(comments, videoContext)
            : createBatchPrompt(comments, videoContext);

        try {
            const response = await this.client.chat.completions.create({
                model: DEFAULT_MODEL,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: prompt }
                ],
                temperature: 0.1, // Lower temperature for more stable JSON
                max_completion_tokens: isLite ? 2000 : 8000, // Increased for larger batches
                response_format: { type: "json_object" },
            });

            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new AnalysisError("Empty response from OpenAI", "OPENAI_EMPTY_RESPONSE");
            }

            console.log("[OpenAI] Raw response content:", content.slice(0, 500));

            const parsed = this.parseJSON<any>(content);

            // Handle different response formats (array or object with nested array)
            let rawResults: OpenAIResponse[];
            if (Array.isArray(parsed)) {
                rawResults = parsed;
            } else if (parsed.comments && Array.isArray(parsed.comments)) {
                rawResults = parsed.comments;
            } else if (parsed.analyses && Array.isArray(parsed.analyses)) {
                rawResults = parsed.analyses;
            } else if (parsed.results && Array.isArray(parsed.results)) {
                rawResults = parsed.results;
            } else {
                console.error("[OpenAI] Unexpected response format:", parsed);
                throw new AnalysisError(
                    "OpenAI returned unexpected JSON format (expected array)",
                    "OPENAI_INVALID_FORMAT",
                    { parsed }
                );
            }

            console.log(`[OpenAI] Parsed ${rawResults.length} results from response`);

            const commentMap = new Map(comments.map(c => [c.id, c]));

            const analyses: SentimentAnalysis[] = rawResults.map((r) => {
                const comment = commentMap.get(r.commentId);
                const likeCount = comment?.likeCount || 0;
                const weightedScore = this.calculateWeightedScore(r.score, likeCount);

                // For lite mode, return minimal fields
                if (isLite) {
                    return {
                        commentId: r.commentId,
                        score: r.score,
                        weightedScore,
                        emotions: [],
                        isSarcasm: false,
                    };
                }

                // Full mode
                return {
                    commentId: r.commentId,
                    score: r.score,
                    weightedScore,
                    emotions: r.emotions as EmotionTag[],
                    isSarcasm: r.isSarcasm,
                    reason: r.reason,
                };
            });

            const processingTimeMs = Date.now() - startTime;
            const tokensUsed = response.usage?.total_tokens || 0;

            return {
                analyses,
                processingTimeMs,
                tokensUsed,
            };
        } catch (error: any) {
            console.error("[OpenAI] Batch analysis failed:", error);

            if (error.status === 429) {
                throw new AnalysisError(
                    "OpenAI API quota exceeded",
                    "OPENAI_QUOTA_EXCEEDED",
                    error
                );
            }

            throw new AnalysisError(
                "OpenAI batch analysis failed",
                "OPENAI_BATCH_ANALYSIS_ERROR",
                error
            );
        }
    }

    async analyzeAxisBatch(
        request: BatchAnalysisRequest,
        axisProfile: AxisProfile
    ): Promise<BatchAnalysisResponse> {
        const startTime = Date.now();
        const { comments, isLite, videoContext } = request;

        if (comments.length === 0) {
            return {
                analyses: [],
                processingTimeMs: 0,
                tokensUsed: 0,
            };
        }

        // Sort comments for thread-aware processing
        const sortedComments = sortCommentsByThreadOrder(comments);

        // Use lite or full prompt based on isLite flag
        const prompt = isLite
            ? createLiteAxisBatchPrompt(sortedComments, axisProfile, videoContext)
            : createAxisBatchPrompt(sortedComments, axisProfile, videoContext);

        try {
            const response = await this.client.chat.completions.create({
                model: DEFAULT_MODEL,
                messages: [
                    { role: "system", content: AXIS_SYSTEM_PROMPT },
                    { role: "user", content: prompt }
                ],
                temperature: 0.1, // Lower temperature for more stable JSON
                max_completion_tokens: isLite ? 4000 : 12000, // Increased for larger batches
                response_format: { type: "json_object" },
            });

            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new AnalysisError("Empty response from OpenAI", "OPENAI_EMPTY_RESPONSE");
            }

            console.log("[OpenAI] Raw response content:", content.slice(0, 500));

            const parsed = this.parseJSON<any>(content);

            // Handle different response formats (array or object with nested array)
            let rawResults: AxisOpenAIResponse[];
            if (Array.isArray(parsed)) {
                rawResults = parsed;
            } else if (parsed.comments && Array.isArray(parsed.comments)) {
                rawResults = parsed.comments;
            } else if (parsed.analyses && Array.isArray(parsed.analyses)) {
                rawResults = parsed.analyses;
            } else if (parsed.results && Array.isArray(parsed.results)) {
                rawResults = parsed.results;
            } else {
                console.error("[OpenAI] Unexpected response format:", parsed);
                throw new AnalysisError(
                    "OpenAI returned unexpected JSON format (expected array)",
                    "OPENAI_INVALID_FORMAT",
                    { parsed }
                );
            }

            console.log(`[OpenAI] Parsed ${rawResults.length} results from response`);

            const commentMap = new Map(sortedComments.map(c => [c.id, c]));

            let analyses: SentimentAnalysis[] = rawResults.map((r) => {
                const comment = commentMap.get(r.commentId);
                const likeCount = comment?.likeCount || 0;

                // Use new two-axis logic for score if available
                const finalScore = r.score !== undefined ? r.score : 0;
                const weightedScore = this.calculateWeightedScore(finalScore, likeCount);

                return {
                    commentId: r.commentId,
                    score: finalScore,
                    weightedScore,
                    emotions: (r.emotions || []) as EmotionTag[],
                    isSarcasm: !!r.isSarcasm,
                    reason: r.reason,
                    label: r.label,
                    stanceDirection: r.stance_direction,
                    stanceIntensity: r.stance_intensity,
                    emotionPolarity: r.emotion_polarity,
                    target: r.target,
                    confidenceLevel: r.confidenceLevel,
                    confidence: r.confidence,
                    axisEvidence: r.axisEvidence,
                    replyRelation: (r.reply_relation_to_parent || r.replyRelation) as any,
                    speechAct: (r.speech_act || r.speechAct) as any,
                };
            });

            // PASS 2: Apply stance synthesis for thread-aware logic (only in full mode)
            if (!isLite) {
                analyses = applyStanceSynthesis(analyses, sortedComments);
            }

            const processingTimeMs = Date.now() - startTime;
            const tokensUsed = response.usage?.total_tokens || 0;

            return {
                analyses,
                processingTimeMs,
                tokensUsed,
            };
        } catch (error: any) {
            console.error("[OpenAI] Axis batch analysis failed:", error);

            if (error.status === 429) {
                throw new AnalysisError(
                    "OpenAI API quota exceeded",
                    "OPENAI_QUOTA_EXCEEDED",
                    error
                );
            }

            throw new AnalysisError(
                "OpenAI axis batch analysis failed",
                "OPENAI_AXIS_BATCH_ANALYSIS_ERROR",
                error
            );
        }
    }

    private labelToScore(label: StanceLabel): SentimentScore {
        switch (label) {
            case "Support": return 0.6;
            case "Oppose": return -0.6;
            case "Neutral": return 0.0;
            case "Unknown": return 0.0;
        }
    }

    private calculateWeightedScore(score: SentimentScore, likeCount: number): SentimentScore {
        if (likeCount === 0) return score;
        const weight = 1 + Math.log10(likeCount + 1) * 0.2;
        const weighted = score * weight;
        return Math.max(-1, Math.min(1, weighted)) as SentimentScore;
    }
}

/**
 * Factory function to create OpenAI engine
 */
export function createOpenAIEngine(
    apiKey?: string,
    config?: Partial<AnalysisEngineConfig>
): OpenAIEngine {
    const key = apiKey || process.env.OPENAI_API_KEY;

    if (!key) {
        throw new AnalysisError(
            "OpenAI API key is required. Set OPENAI_API_KEY environment variable.",
            "OPENAI_MISSING_API_KEY"
        );
    }

    return new OpenAIEngine(key, config);
}
