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
    AxisProfile,
    StanceLabel,
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
    batchSize: 20, // Increased for 70B which handles context better
    maxComments: 500,
    timeoutMs: 30000,
};

const DEFAULT_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

interface GroqResponse {
    commentId: string;
    score: number;
    emotions: string[];
    isSarcasm: boolean;
    reason: string;
}

interface AxisGroqResponse extends GroqResponse {
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

        // c) Fix missing colons before values (hallucination like "commentId removed"null)
        cleanText = cleanText.replace(/"([^"]+)"\s*(null|true|false|[-0-9.\[\{])/g, '"$1": $2');

        // d) Remove trailing commas in arrays/objects (e.g., [1, 2, ] -> [1, 2])
        cleanText = cleanText.replace(/,\s*([\]\}])/g, '$1');

        try {
            return JSON.parse(cleanText);
        } catch (error) {
            // Attempt even more aggressive cleaning if still failing
            try {
                // Remove any lines that don't look like valid JSON properties (experimental)
                const lines = cleanText.split('\n');
                const filteredLines = lines.filter(line => {
                    const t = line.trim();
                    if (t === '{' || t === '}' || t === '[' || t === ']' || t === '},' || t === '],') return true;
                    return t.includes(':') || t.endsWith(',') || t.endsWith('}') || t.endsWith(']');
                });
                return JSON.parse(filteredLines.join('\n'));
            } catch (innerError) {
                console.error("Failed to parse Groq JSON. Raw text:", text.slice(0, 500));
                console.error("Cleaned text:", cleanText.slice(0, 500));
                throw new Error(`Failed to parse JSON response from Groq: ${error instanceof Error ? error.message : "Invalid syntax"}`);
            }
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
        } catch (error: any) {
            // Check for json_validate_failed and try to recover from failed_generation
            if (error.status === 400 && error.error?.code === 'json_validate_failed') {
                const failedContent = error.error?.failed_generation;
                if (failedContent) {
                    try {
                        const parsed = this.parseJSON<GroqResponse>(failedContent);
                        return {
                            commentId: comment.id,
                            score: this.clampScore(parsed.score),
                            weightedScore: this.calculateWeightedScore(parsed.score, comment.likeCount),
                            emotions: (parsed.emotions || ["neutral"]) as EmotionTag[],
                            isSarcasm: !!parsed.isSarcasm,
                            reason: parsed.reason || "Recovered from partial JSON",
                        };
                    } catch (e) {
                        console.error("[Groq] JSON Recovery failed for single comment");
                    }
                }
            }

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

        // Use lite prompt if requested (for cost optimization)
        const prompt = request.isLite
            ? createLiteBatchPrompt(request.comments, request.videoContext)
            : createBatchPrompt(request.comments, request.videoContext);

        try {
            const mode = request.isLite ? "Lite" : "Full";
            console.log(`[Groq] Analyzing batch of ${request.comments.length} comments (${mode} mode)...`);
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

            const parsed = this.parseJSON<any>(text);
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

                // Lite mode: minimal fields only
                if (request.isLite) {
                    return {
                        commentId: item.commentId,
                        score: this.clampScore(item.score),
                        weightedScore: this.calculateWeightedScore(item.score, comment.likeCount),
                        emotions: ["neutral"] as EmotionTag[], // Placeholder for lite mode
                        isSarcasm: false,
                        reason: undefined, // No reason in lite mode
                    };
                }

                // Full mode: all fields
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
            // Check for json_validate_failed and try to recover from failed_generation
            if (error.status === 400 && error.error?.code === 'json_validate_failed') {
                const failedContent = error.error?.failed_generation;
                if (failedContent) {
                    try {
                        console.log("[Groq] Attempting recovery from json_validate_failed...");
                        const parsed = this.parseJSON<any>(failedContent);
                        const items = Array.isArray(parsed) ? parsed : (parsed.comments || parsed.analyses || parsed.results || [parsed]);

                        const analyses: SentimentAnalysis[] = request.comments.map((comment) => {
                            const item = items.find((p: any) => p.commentId === comment.id);
                            if (!item) return { commentId: comment.id, score: 0, weightedScore: 0, emotions: ["neutral"], isSarcasm: false, reason: "Skipped in recovery" };
                            return {
                                commentId: item.commentId,
                                score: this.clampScore(item.score),
                                weightedScore: this.calculateWeightedScore(item.score, comment.likeCount),
                                emotions: (item.emotions || ["neutral"]) as EmotionTag[],
                                isSarcasm: !!item.isSarcasm,
                                reason: item.reason || "Recovered from partial JSON",
                            };
                        });

                        return {
                            analyses,
                            processingTimeMs: Date.now() - startTime,
                            tokensUsed: 0,
                        };
                    } catch (e) {
                        console.error("[Groq] JSON Recovery failed for batch");
                    }
                }
            }

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

    /**
     * NEW: Axis-based batch analysis with stance labels
     * Includes 2-pass processing for thread-aware stance synthesis
     */
    async analyzeAxisBatch(
        request: BatchAnalysisRequest,
        axisProfile: AxisProfile
    ): Promise<BatchAnalysisResponse> {
        const startTime = Date.now();

        if (request.comments.length === 0) {
            return {
                analyses: [],
                processingTimeMs: 0,
                tokensUsed: 0,
            };
        }

        // Phase 3.2: Sort comments to ensure parents are analyzed before children
        const commentOrder = request.comments.map(c => ({ id: c.id, parentId: c.parentId }));
        const sortedOrder = sortCommentsByThreadOrder(commentOrder);

        // Reorder comments based on sorted order
        const sortedComments = sortedOrder
            .map(ordered => request.comments.find(c => c.id === ordered.id))
            .filter((c): c is YouTubeComment => c !== undefined);

        // Use lite prompt if requested (for cost optimization)
        const prompt = request.isLite
            ? createLiteAxisBatchPrompt(sortedComments, axisProfile, request.videoContext)
            : createAxisBatchPrompt(sortedComments, axisProfile, request.videoContext);

        try {
            const mode = request.isLite ? "Lite" : "Full";
            console.log(`[Groq] Axis-based analysis of ${request.comments.length} comments (${mode} mode)...`);
            const completion = await this.client.chat.completions.create({
                messages: [
                    { role: "system", content: AXIS_SYSTEM_PROMPT },
                    { role: "user", content: prompt },
                ],
                model: DEFAULT_MODEL,
                response_format: { type: "json_object" },
            });

            const text = completion.choices[0]?.message?.content || "";
            console.log(`[Groq] Received axis response (${text.length} chars)`);

            const parsed = this.parseJSON<any>(text);
            let parsedArray: AxisGroqResponse[] = [];

            if (Array.isArray(parsed)) {
                parsedArray = parsed;
            } else if (parsed.comments && Array.isArray(parsed.comments)) {
                parsedArray = parsed.comments;
            } else if (parsed.analyses && Array.isArray(parsed.analyses)) {
                parsedArray = parsed.analyses;
            } else if (parsed.results && Array.isArray(parsed.results)) {
                parsedArray = parsed.results;
            } else {
                console.warn("[Groq] Unexpected Axis JSON structure, attempting fallback");
                parsedArray = [parsed];
            }

            console.log(`[Groq] Successfully parsed ${parsedArray.length} axis analysis items`);

            const commentMap = new Map(sortedComments.map(c => [c.id, c]));

            let analyses: SentimentAnalysis[] = sortedComments.map((comment) => {
                const r = parsedArray.find((p) => p.commentId === comment.id);
                const likeCount = comment.likeCount || 0;

                if (!r) {
                    return {
                        commentId: comment.id,
                        score: 0,
                        weightedScore: 0,
                        emotions: ["neutral"] as EmotionTag[],
                        isSarcasm: false,
                        reason: "Groq skipped this comment in axis analysis",
                        label: "Unknown" as StanceLabel,
                        confidence: 0,
                        axisEvidence: "No analysis available",
                    };
                }

                // Use new two-axis logic for score if available
                const finalScore = r.score !== undefined ? r.score : 0;
                const weightedScore = this.calculateWeightedScore(finalScore, likeCount);

                // Lite mode: minimal fields only
                if (request.isLite) {
                    return {
                        commentId: r.commentId,
                        score: this.clampScore(finalScore),
                        weightedScore: weightedScore,
                        emotions: ["neutral"] as EmotionTag[],
                        isSarcasm: false,
                        reason: undefined,
                        label: r.label || "Unknown",
                        confidence: r.confidence || 0.5,
                        axisEvidence: undefined,
                        replyRelation: undefined,
                        speechAct: undefined,
                        stanceDirection: r.stance_direction,
                        stanceIntensity: r.stance_intensity,
                        emotionPolarity: r.emotion_polarity,
                        target: r.target,
                        confidenceLevel: r.confidenceLevel,
                    };
                }

                return {
                    commentId: r.commentId,
                    score: this.clampScore(finalScore),
                    weightedScore: weightedScore,
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

            // Pass 2: Apply stance synthesis for replies
            console.log(`[Groq] Applying stance synthesis for thread-aware analysis...`);
            analyses = applyStanceSynthesis(analyses, sortedComments);

            // Recalculate weighted scores after synthesis
            analyses = analyses.map((analysis) => {
                const comment = sortedComments.find(c => c.id === analysis.commentId);
                if (!comment) return analysis;

                return {
                    ...analysis,
                    weightedScore: this.calculateWeightedScore(analysis.score, comment.likeCount),
                };
            });

            return {
                analyses,
                processingTimeMs: Date.now() - startTime,
                tokensUsed: completion.usage?.total_tokens || 0,
            };
        } catch (error: any) {
            // Check for json_validate_failed and try to recover from failed_generation
            if (error.status === 400 && error.error?.code === 'json_validate_failed') {
                const failedContent = error.error?.failed_generation;
                if (failedContent) {
                    try {
                        console.log("[Groq] Attempting recovery from axis json_validate_failed...");
                        const parsed = this.parseJSON<any>(failedContent);
                        const items = Array.isArray(parsed) ? parsed : (parsed.comments || parsed.analyses || parsed.results || [parsed]);

                        let analyses: SentimentAnalysis[] = sortedComments.map((comment) => {
                            const item = items.find((p: any) => p.commentId === comment.id);
                            if (!item) return { commentId: comment.id, score: 0, weightedScore: 0, emotions: ["neutral"], isSarcasm: false, reason: "Skipped in recovery", label: "Unknown", confidence: 0, axisEvidence: "Skipped" };

                            const scoreFromLabel = this.labelToScore(item.label);
                            const finalScore = item.score !== undefined ? item.score : scoreFromLabel;

                            return {
                                commentId: item.commentId,
                                score: this.clampScore(finalScore),
                                weightedScore: this.calculateWeightedScore(finalScore, comment.likeCount),
                                emotions: (item.emotions || ["neutral"]) as EmotionTag[],
                                isSarcasm: !!item.isSarcasm,
                                reason: item.reason || "Recovered from partial JSON",
                                label: item.label || "Unknown",
                                confidence: item.confidence || 0.5,
                                axisEvidence: item.axisEvidence || "",
                            };
                        });

                        // Apply synthesis even in recovery
                        analyses = applyStanceSynthesis(analyses, sortedComments);

                        return {
                            analyses,
                            processingTimeMs: Date.now() - startTime,
                            tokensUsed: 0,
                        };
                    } catch (e) {
                        console.error("[Groq] JSON Recovery failed for axis batch");
                    }
                }
            }

            console.error("[Groq] Axis Batch Analysis Error:", error.message);

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
                    label: "Unknown" as StanceLabel,
                    confidence: 0,
                    axisEvidence: "API quota exceeded",
                }));

                return {
                    analyses: fallbackAnalyses,
                    processingTimeMs: Date.now() - startTime,
                    tokensUsed: 0,
                    isPartial: true,
                };
            }

            throw new AnalysisError(
                `Failed to analyze axis batch with Groq: ${error.message}`,
                "GROQ_AXIS_BATCH_ERROR",
                error
            );
        }
    }

    /**
     * Convert StanceLabel to score for backward compatibility
     */
    private labelToScore(label: StanceLabel): number {
        switch (label) {
            case "Support":
                return 0.85;
            case "Oppose":
                return -0.85;
            case "Neutral":
                return 0.0;
            case "Unknown":
                return 0.0;
            default:
                return 0.0;
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

    async generateAxisProfile(video: { id: string; title: string; channelName: string; description?: string; transcript?: string }): Promise<import("@/types").AxisProfile> {
        const prompt = `Analyze this video and extract its "Axis Profile" for stance analysis.

Video Information:
- Title: ${video.title}
- Creator: ${video.channelName}
- Description: ${video.description?.slice(0, 500) || "N/A"}
- Transcript Snippet: ${video.transcript?.slice(0, 3000) || "N/A"}

Please identify:
1. mainAxis: The central claim or question this video addresses (e.g., "Is traditional education effective?")
2. creatorPosition: The creator's stance on this axis (e.g., "Practical learning is more important than theory")
4. supportedValues: What values or behaviors is the creator promoting? (e.g., "Action-oriented learning, hands-on experience")
5. protagonists: List of specific people or groups whom the creator supports or aligns with (e.g., "Colleagues", "Supporters")
6. antagonists: List of specific people or groups whom the creator explicitly criticizes (e.g., "Opponent Name", "Disbelievers")
7. coreValues: Specific abstract values the creator promotes (e.g. "integrity", "action")
8. negativeValues: Specific abstract values the creator criticizes (e.g. "hypocrisy", "laziness")
9. stanceRules: Short rules to distinguish Support from Oppose for this video
10. lexiconHints: Terms that have special meaning in this video
11. caveats: Special instructions for ambiguous comments

Return JSON in this exact format:
{
  "axisStatement": "...",
  "axisType": "critic" | "education" | "other",
  "mainAxis": "...",
  "creatorPosition": "...",
  "targetOfCriticism": "...",
  "supportedValues": "...",
  "protagonists": ["..."],
  "antagonists": ["..."],
  "coreValues": ["..."],
  "negativeValues": ["..."],
  "stanceRules": ["..."],
  "lexiconHints": ["..."],
  "caveats": ["..."]
}`;

        try {
            const completion = await this.client.chat.completions.create({
                messages: [
                    { role: "system", content: "You are an expert at analyzing video content to extract stance profiles for sentiment analysis." },
                    { role: "user", content: prompt },
                ],
                model: DEFAULT_MODEL,
                response_format: { type: "json_object" },
            });

            const text = completion.choices[0]?.message?.content || "{}";
            const parsed = this.parseJSON<{
                mainAxis: string;
                creatorPosition: string;
                targetOfCriticism?: string;
                supportedValues?: string;
                protagonists: string[];
                antagonists: string[];
                axisStatement: string;
                axisType: "critic" | "education" | "other";
                coreValues: string[];
                negativeValues: string[];
                stanceRules: string[];
                lexiconHints: string[];
                caveats: string[];
            }>(text);

            return {
                videoId: video.id,
                mainAxis: parsed.mainAxis || "General discussion about " + video.title,
                axisStatement: parsed.axisStatement || video.title,
                axisType: parsed.axisType || "other",
                creatorPosition: parsed.creatorPosition || "The creator's perspective",
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
            // Check for json_validate_failed and try to recover from failed_generation
            if (error.status === 400 && error.error?.code === 'json_validate_failed') {
                const failedContent = error.error?.failed_generation;
                if (failedContent) {
                    try {
                        const parsed = this.parseJSON<any>(failedContent);
                        return {
                            videoId: video.id,
                            mainAxis: parsed.mainAxis || "General discussion about " + video.title,
                            axisStatement: parsed.axisStatement || video.title,
                            axisType: parsed.axisType || "other",
                            creatorPosition: parsed.creatorPosition || "The creator's perspective",
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
                    } catch (e) {
                        console.error("[Groq] AxisProfile recovery failed");
                    }
                }
            }

            console.error("[Groq] AxisProfile generation failed:", error.message);
            // Fallback to basic profile
            return {
                videoId: video.id,
                mainAxis: "Discussion about: " + video.title,
                axisStatement: video.title,
                axisType: "other",
                creatorPosition: "The creator's perspective on " + video.title,
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
