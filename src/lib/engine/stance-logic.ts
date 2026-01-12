/**
 * Stance Synthesis Logic for Thread-Aware Analysis
 *
 * This module handles the "reversal logic" where a reply's stance
 * is determined by combining:
 * 1. Parent comment's stance (Support/Oppose/Neutral/Unknown)
 * 2. Reply relation (agree/disagree/clarify/question/unrelated)
 */

import type { StanceLabel, ReplyRelation, SentimentAnalysis } from "@/types";

/**
 * Synthesize final stance from parent stance and reply relation
 *
 * Core Logic:
 * - agree: Maintains parent's stance
 * - disagree: Flips parent's stance (Oppose -> Support, Support -> Oppose)
 * - clarify/question/unrelated: Neutral (no clear stance)
 *
 * Examples:
 * - Parent: Oppose, Reply: disagree => Support (double negative)
 * - Parent: Support, Reply: agree => Support (reinforcement)
 * - Parent: Support, Reply: disagree => Oppose (contradiction)
 */
export function synthesizeStance(
    parentLabel: StanceLabel,
    replyRelation: ReplyRelation
): StanceLabel {
    // Handle non-stance reply relations
    if (replyRelation === "unrelated" || replyRelation === "clarify" || replyRelation === "question") {
        return "Neutral";
    }

    // Core reversal logic: disagree flips the stance
    if (replyRelation === "disagree") {
        if (parentLabel === "Support") return "Oppose";
        if (parentLabel === "Oppose") return "Support";
        if (parentLabel === "Neutral") return "Neutral";
        return "Unknown";
    }

    // Agree maintains the stance
    if (replyRelation === "agree") {
        return parentLabel;
    }

    return "Unknown";
}

/**
 * Enhanced synthesis using Direction and Intensity
 */
export function synthesizeBinaryStance(
    parent: { direction: "support" | "oppose" | "neutral" | "unknown", intensity: number },
    replyRelation: ReplyRelation
): { direction: "support" | "oppose" | "neutral" | "unknown", intensity: number } {
    if (replyRelation === "unrelated" || replyRelation === "clarify" || replyRelation === "question") {
        return { direction: "neutral", intensity: 0 };
    }

    if (replyRelation === "agree") {
        return { ...parent };
    }

    if (replyRelation === "disagree") {
        let newDir = parent.direction;
        if (parent.direction === "support") newDir = "oppose";
        else if (parent.direction === "oppose") newDir = "support";

        return { direction: newDir, intensity: parent.intensity };
    }

    return { direction: "unknown", intensity: 0 };
}

/**
 * Convert StanceLabel to SentimentScore for backward compatibility
 */
export function labelToScore(label: StanceLabel): number {
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

/**
 * Convert SentimentScore to StanceLabel (approximate)
 */
export function scoreToLabel(score: number): StanceLabel {
    if (score >= 0.7) return "Support";
    if (score <= -0.7) return "Oppose";
    if (Math.abs(score) < 0.3) return "Neutral";
    return "Unknown";
}

/**
 * Apply stance synthesis to a batch of analyses
 *
 * This processes comments in order, ensuring parent comments
 * are analyzed before their replies.
 *
 * @param analyses - Array of sentiment analyses (may include replies)
 * @param comments - Original comment data (includes parentId)
 * @returns Updated analyses with synthesized stances
 */
export function applyStanceSynthesis(
    analyses: SentimentAnalysis[],
    comments: Array<{ id: string; parentId?: string }>
): SentimentAnalysis[] {
    // Create a map for quick lookup
    const analysisMap = new Map<string, SentimentAnalysis>();
    analyses.forEach(a => analysisMap.set(a.commentId, a));

    const commentMap = new Map<string, { id: string; parentId?: string }>();
    comments.forEach(c => commentMap.set(c.id, c));

    return analyses.map(analysis => {
        const comment = commentMap.get(analysis.commentId);

        // If not a reply, return as-is
        if (!comment?.parentId) {
            return analysis;
        }

        // Find parent analysis
        const parentAnalysis = analysisMap.get(comment.parentId);
        if (!parentAnalysis) {
            return analysis;
        }

        const relation = analysis.replyRelation as ReplyRelation;
        if (!relation) {
            return analysis;
        }

        // 1. Label-based synthesis (Legacy)
        const synthesizedLabel = synthesizeStance(
            parentAnalysis.label || "Unknown",
            relation
        );

        // 2. Binary synthesis (New direction/intensity logic)
        let finalDirection = analysis.stanceDirection;
        let finalIntensity = analysis.stanceIntensity || 0;

        if (parentAnalysis.stanceDirection && parentAnalysis.stanceDirection !== "unknown") {
            const synthesized = synthesizeBinaryStance(
                { direction: parentAnalysis.stanceDirection, intensity: parentAnalysis.stanceIntensity || 0 },
                relation
            );
            finalDirection = synthesized.direction;
            finalIntensity = synthesized.intensity;
        }

        // Final Score Calculation: intensity * direction_multiplier
        const dirMultiplier = finalDirection === "support" ? 1 : finalDirection === "oppose" ? -1 : 0;
        const newScore = finalIntensity * dirMultiplier;

        // Update the analysis with synthesized values
        return {
            ...analysis,
            label: synthesizedLabel,
            stanceDirection: finalDirection,
            stanceIntensity: finalIntensity,
            score: newScore,
            axisEvidence: analysis.axisEvidence
                ? `[Thread Match] ${analysis.axisEvidence}`
                : `Synthesized from parent (${parentAnalysis.label}) + ${relation}`,
            reason: `Thread-aware synthesis: Parent[${parentAnalysis.stanceDirection}] + Relation[${relation}] -> Result[${finalDirection}]`,
        };
    });
}

/**
 * Validate that all parent comments are analyzed before their children
 *
 * This helps prevent issues in 2-pass batch processing
 */
export function sortCommentsByThreadOrder(
    comments: Array<{ id: string; parentId?: string }>
): Array<{ id: string; parentId?: string }> {
    const topLevel: Array<{ id: string; parentId?: string }> = [];
    const replies: Array<{ id: string; parentId?: string }> = [];

    comments.forEach(c => {
        if (c.parentId) {
            replies.push(c);
        } else {
            topLevel.push(c);
        }
    });

    // Return top-level first, then replies
    return [...topLevel, ...replies];
}
