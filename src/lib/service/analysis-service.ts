
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { getModel } from '@/lib/llm/provider';
import {
    SYSTEM_PROMPT,
    createBatchPrompt,
    createLiteBatchPrompt,
    AXIS_SYSTEM_PROMPT,
    createAxisBatchPrompt,
    createLiteAxisBatchPrompt
} from '@/lib/llm/prompts';
import {
    type YouTubeComment,
    type BatchAnalysisRequest,
    type BatchAnalysisResponse,
    type AnalysisEngineConfig,
    type AxisProfile,
    type SentimentAnalysis,
    type SentimentScore,
    type EmotionTag,
    type StanceLabel,
    type YouTubeVideo
} from '@/types';
import { sortCommentsByThreadOrder, applyStanceSynthesis } from '@/lib/engine/stance-logic';
import { retrieveContext, splitText } from '@/lib/llm/rag';

// Define Schemas for LLM Output

// 1. Basic Sentiment Analysis Schema
const SentimentSchema = z.object({
    comments: z.array(z.object({
        commentId: z.string(),
        reason: z.string().optional(),
        score: z.number(),
        emotions: z.array(z.string()).optional(),
        isSarcasm: z.boolean().optional(),
    }))
});

// 2. Axis-Based Stance Analysis Schema - Relaxed for robustness
const AxisAnalysisResultSchema = z.object({
    commentId: z.string(),
    disclaimer: z.string().nullable().optional(),
    main_claim: z.string().optional(),
    value_tradeoff: z.object({ higher: z.string(), lower: z.string() }).nullable().optional(),
    stance_type: z.string().optional(), // Was enum, relaxed to string
    stance_direction: z.string().optional(), // Was enum, relaxed to string
    stance_intensity: z.number().optional(),
    emotion_polarity: z.string().optional(), // Was enum, relaxed to string
    target: z.string().optional(), // Was enum, relaxed to string
    confidenceLevel: z.string().optional(), // Was enum, relaxed to string
    axisEvidence: z.string().optional(),
    reply_relation_to_parent: z.string().nullable().optional(), // Was enum
    label: z.string().optional(), // Was enum
    score: z.number().optional()
});

const AxisBatchSchema = z.object({
    analyses: z.array(AxisAnalysisResultSchema).optional(),
    comments: z.array(AxisAnalysisResultSchema).optional(), // Fallback
    results: z.array(AxisAnalysisResultSchema).optional()   // Fallback
});

// 3. Axis Profile Schema
const AxisProfileSchema = z.object({
    videoId: z.string().optional(),
    axisStatement: z.string(),
    axisType: z.enum(["critic", "education", "other"]),
    mainAxis: z.string(),
    creatorPosition: z.string(),
    targetOfCriticism: z.string().optional(),
    supportedValues: z.string().optional(),
    protagonists: z.array(z.string()),
    antagonists: z.array(z.string()),
    coreValues: z.array(z.string()),
    negativeValues: z.array(z.string()),
    valuePriority: z.array(z.string()),
    stanceRules: z.array(z.string()),
    lexiconHints: z.array(z.string()),
    antagonistAliases: z.record(z.array(z.string())).optional(),
    butMarkers: z.array(z.string()).optional(),
    caveats: z.array(z.string()).optional()
});

const DEFAULT_CONFIG: AnalysisEngineConfig = {
    batchSize: 50,
    maxComments: 1000,
    timeoutMs: 60000,
};

export class AnalysisService {
    private config: AnalysisEngineConfig;

    readonly name = "AnalysisService";

    constructor(config?: Partial<AnalysisEngineConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    getConfig() { return this.config; }

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

    /**
     * Generate context summary for a video
     */
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
            const { text } = await generateText({
                model: getModel(),
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
            });
            return text;
        } catch (error) {
            console.error("Context summary failed:", error);
            return video.description?.slice(0, 200) || `Video about: ${video.title}`;
        }
    }

    /**
     * Generate Axis Profile using RAG and LLM
     */
    async generateAxisProfile(video: YouTubeVideo): Promise<AxisProfile> {
        const summary = await this.generateContextSummary(video);

        // RAG Logic
        let contextText = `Title: ${video.title}\nDescription: ${video.description || ""}\nSummary: ${summary}`;
        let retrievedSnippets: string[] = [];

        if (video.transcript && video.transcript.length > 1000) {
            const chunks = splitText(video.transcript, 800, 100);
            const queries = [
                "What is the main argument and conclusion of this video?",
                "Who is the creator criticizing or attacking? (Antagonists)",
                "What values does the creator prioritize over others? (Value Hierarchy)"
            ];

            for (const query of queries) {
                const results = await retrieveContext(query, chunks, 3);
                retrievedSnippets.push(...results.map(r => r.content));
            }
            retrievedSnippets = [...new Set(retrievedSnippets)];
            contextText += `\n\n### RELEVANT TRANSCRIPT EXCERPTS (EVIDENCE)\n${retrievedSnippets.join("\n---\n")}`;
        } else {
            contextText += `\n\nTranscript Snippet: ${video.transcript?.slice(0, 10000) || "N/A"}`;
        }

        const prompt = `Based on the following video context, generate a detailed "Axis Profile" for Stance Analysis.
CONTEXT:
${contextText}

Generate the profile strictly conforming to the JSON schema.`;

        try {
            const { object } = await generateObject({
                model: getModel(),
                schema: AxisProfileSchema,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
            });

            return {
                ...object,
                videoId: video.id,
                evidenceSnippets: retrievedSnippets,
                generatedAt: new Date().toISOString(),
            } as AxisProfile;

        } catch (error) {
            console.error("Axis profile generation failed:", error);
            // Fallback
            return {
                videoId: video.id,
                mainAxis: `Discussion about: ${video.title}`,
                axisStatement: video.title,
                axisType: "other",
                creatorPosition: "Unknown",
                protagonists: [],
                antagonists: [],
                coreValues: [],
                negativeValues: [],
                valuePriority: [],
                stanceRules: [],
                lexiconHints: [],
                caveats: [],
                generatedAt: new Date().toISOString(),
            };
        }
    }

    /**
     * Analyze a batch of comments using Axis-based logic
     */
    async analyzeAxisBatch(
        request: BatchAnalysisRequest,
        axisProfile: AxisProfile
    ): Promise<BatchAnalysisResponse> {
        const startTime = Date.now();
        const { comments, isLite, videoContext } = request;

        if (comments.length === 0) return { analyses: [], processingTimeMs: 0, tokensUsed: 0 };

        const sortedComments = sortCommentsByThreadOrder(comments);

        // Use Lite or Full prompt
        const promptContent = isLite
            ? createLiteAxisBatchPrompt(sortedComments, axisProfile, videoContext)
            : createAxisBatchPrompt(sortedComments, axisProfile, videoContext);

        try {
            // Use generateText instead of generateObject to debug raw output and handle "chatty" or invalid JSON better
            const { text, usage } = await generateText({
                model: getModel(),
                messages: [
                    { role: 'system', content: AXIS_SYSTEM_PROMPT },
                    { role: 'user', content: promptContent }
                ],
                temperature: 0.1,
            });

            console.log(`[AnalysisService] Raw LLM Response (First 500 chars): ${text.slice(0, 500)}`);

            // Manual JSON parsing with cleaning
            let cleanText = text.trim();
            // Remove code blocks
            cleanText = cleanText.replace(/```(?:json)?/g, "").replace(/```/g, "");

            let parsed: any;
            try {
                parsed = JSON.parse(cleanText);
            } catch (e) {
                console.error("[AnalysisService] JSON Parse Error. Attempting regex repair or simple fix...");
                // Simple repair for logical JSON extracted from text
                const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        parsed = JSON.parse(jsonMatch[0]);
                    } catch (e2) {
                        console.error("[AnalysisService] Repair failed.");
                        throw e; // Original error
                    }
                } else {
                    throw e;
                }
            }

            // Normalize results from possible schema variations
            const rawResults = parsed.analyses || parsed.comments || parsed.results || (Array.isArray(parsed) ? parsed : []);
            console.log(`[AnalysisService] Parsed item count: ${rawResults.length}`);

            const commentMap = new Map(sortedComments.map(c => [c.id, c]));

            let analyses: SentimentAnalysis[] = rawResults.map((r: any) => {
                const comment = commentMap.get(r.commentId);
                const likeCount = comment?.likeCount || 0;

                // Determine score and label
                let finalScore = 0;
                let label: StanceLabel = "Unknown";

                if (isLite) {
                    // Lite mode usually returns 'label' and 'score' directly
                    if (r.score !== undefined) finalScore = Number(r.score);
                    if (r.label) label = r.label;
                    // Infer label/score if one differs
                    if (!r.label && r.score) label = this.scoreToLabel(finalScore);
                } else {
                    // Full mode uses stance_direction
                    const directionMultiplier =
                        r.stance_direction === "support" ? 1 :
                            r.stance_direction === "oppose" ? -1 : 0;
                    const intensity = r.stance_intensity || 0;
                    finalScore = directionMultiplier * intensity;

                    label = r.stance_direction === "support" ? "Support" :
                        r.stance_direction === "oppose" ? "Oppose" :
                            r.stance_direction === "neutral" ? "Neutral" : "Unknown";
                }

                const weightedScore = this.calculateWeightedScore(finalScore, likeCount);

                return {
                    commentId: r.commentId,
                    score: this.clampScore(finalScore),
                    weightedScore,
                    emotions: (r.emotions || []) as EmotionTag[],
                    isSarcasm: !!r.isSarcasm,
                    reason: r.reason,
                    label,
                    stanceDirection: r.stance_direction,
                    stanceIntensity: r.stance_intensity,
                    emotionPolarity: r.emotion_polarity,
                    target: r.target,
                    confidenceLevel: r.confidenceLevel,
                    confidence: r.confidence || 0.8,
                    axisEvidence: r.axisEvidence,
                    replyRelation: r.reply_relation_to_parent || r.replyRelation,
                    speechAct: r.speech_act || r.speechAct,
                    disclaimer: r.disclaimer,
                    mainClaim: r.main_claim,
                    valueTradeoff: r.value_tradeoff,
                    stanceType: r.stance_type,
                } as SentimentAnalysis;
            });

            // Thread-aware synthesis (PASS 2)
            if (!isLite) {
                analyses = applyStanceSynthesis(analyses, sortedComments);
            }

            return {
                analyses,
                processingTimeMs: Date.now() - startTime,
                tokensUsed: usage.totalTokens,
            };

        } catch (error) {
            console.error("[AnalysisService] Critical Failure:", error);
            throw error;
        }
    }

    /**
     * Legacy Sentiment Analysis (Fall back if Axis Mode is disabled)
     */
    async analyzeBatch(request: BatchAnalysisRequest): Promise<BatchAnalysisResponse> {
        const startTime = Date.now();
        const { comments, isLite, videoContext } = request;

        const promptContent = isLite
            ? createLiteBatchPrompt(comments, videoContext)
            : createBatchPrompt(comments, videoContext);

        try {
            const { object, usage } = await generateObject({
                model: getModel(),
                schema: SentimentSchema,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: promptContent }
                ],
                temperature: 0.1,
            });

            const rawResults = object.comments;
            const commentMap = new Map(comments.map(c => [c.id, c]));

            const analyses: SentimentAnalysis[] = rawResults.map((r) => {
                const comment = commentMap.get(r.commentId);
                const likeCount = comment?.likeCount || 0;
                const weightedScore = this.calculateWeightedScore(r.score, likeCount);

                return {
                    commentId: r.commentId,
                    score: r.score,
                    weightedScore,
                    emotions: (r.emotions || []) as EmotionTag[],
                    isSarcasm: !!r.isSarcasm,
                    reason: r.reason,
                };
            });

            return {
                analyses,
                processingTimeMs: Date.now() - startTime,
                tokensUsed: usage.totalTokens,
            };

        } catch (error) {
            console.error("Legacy Analysis Error:", error);
            throw error;
        }
    }

    // --- Helpers ---

    private clampScore(score: number): number {
        return Math.max(-1, Math.min(1, score));
    }

    private scoreToLabel(score: number): StanceLabel {
        if (score > 0.3) return "Support";
        if (score < -0.3) return "Oppose";
        return "Neutral";
    }

    private calculateWeightedScore(score: number, likeCount: number): SentimentScore {
        if (likeCount === 0) return score as SentimentScore;
        const weight = 1 + Math.log10(likeCount + 1) * 0.2;
        const weighted = score * weight;
        return Math.max(-1, Math.min(1, weighted)) as SentimentScore;
    }
}
