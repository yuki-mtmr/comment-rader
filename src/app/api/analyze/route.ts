/**
 * API Route: /api/analyze
 *
 * Analyzes a YouTube video's comments for sentiment.
 */

import { NextRequest, NextResponse } from "next/server";
import { createYouTubeClient, YouTubeClient } from "@/lib/youtube/client";
import { createAnalysisEngine, isMockEngineEnabled } from "@/lib/engine/factory";
import type { VideoAnalysis, AnalyzedComment, TimeSeriesPoint, ScatterDataPoint } from "@/types";

export const runtime = "nodejs";

interface AnalyzeRequest {
  url: string;
  maxComments?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeRequest = await request.json();

    if (!body.url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Extract video ID
    const videoId = YouTubeClient.extractVideoId(body.url);
    if (!videoId) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }

    // Check if we should use mock data (complete dataset)
    if (isMockEngineEnabled()) {
      console.log("[API] Running in MOCK MODE (Mock dataset from generators.ts)");
      // Use mock data for development
      const { generateMockDataset } = await import("@/lib/mock-data/generators");
      const mockData = generateMockDataset(body.maxComments || 20);

      return NextResponse.json(mockData);
    }

    // Real YouTube API integration with sentiment analysis
    const youtubeClient = createYouTubeClient();
    const engine = createAnalysisEngine(); // Auto-selects engine based on environment
    console.log(`[API] Using analysis engine: ${engine.name}`);

    // Fetch video metadata
    const video = await youtubeClient.getVideo(videoId);

    // Fetch transcript and generate summary for context
    console.log(`[API] Fetching transcript for context...`);
    const transcript = await youtubeClient.getTranscript(videoId);
    video.transcript = transcript;

    console.log(`[API] Generating context summary...`);
    const summary = await engine.generateContextSummary({
      title: video.title,
      channelName: video.channelName,
      description: video.description,
      transcript: transcript,
    });
    console.log(`[API] Context ready: ${summary.slice(0, 100)}...`);

    // Check if Axis-based mode is enabled
    const useAxisMode = process.env.USE_AXIS_MODE === 'true';
    let axisProfile;

    if (useAxisMode && engine.generateAxisProfile) {
      console.log(`[API] Generating Axis Profile for stance analysis...`);
      axisProfile = await engine.generateAxisProfile({
        id: videoId,
        title: video.title,
        channelName: video.channelName,
        description: video.description,
        transcript: transcript,
      });
      console.log(`[API] Axis Profile generated: ${axisProfile.mainAxis}`);
    }

    // Fetch comments with tiered sampling limits
    const maxComments = parseInt(process.env.MAX_COMMENTS || "1000");
    const richTierThreshold = parseInt(process.env.RICH_TIER_THRESHOLD || "200");

    console.log(`[API] Tiered sampling: max=${maxComments}, richTier=${richTierThreshold}`);

    let comments = await youtubeClient.getComments(videoId, { maxComments });

    if (comments.length === 0) {
      return NextResponse.json({
        error: "No comments found for this video",
      }, { status: 404 });
    }

    // TIERED SAMPLING: Sort by likeCount descending
    comments = comments.sort((a, b) => b.likeCount - a.likeCount);
    console.log(`[API] Sorted ${comments.length} comments by likeCount. Top comment has ${comments[0]?.likeCount} likes.`);

    // Populate parentText for replies to provide context to the LLM
    const commentMap = new Map(comments.map(c => [c.id, c.text]));
    comments.forEach(c => {
      if (c.parentId && commentMap.has(c.parentId)) {
        c.parentText = commentMap.get(c.parentId);
      }
    });

    // Analyze comments in batches with tiered sampling
    const batchSize = engine.getConfig().batchSize;
    const analyzedComments: AnalyzedComment[] = [];
    let isPartialResult = false;

    for (let i = 0; i < comments.length; i += batchSize) {
      const batch = comments.slice(i, i + batchSize);

      // Determine if this batch should use lite mode
      // Rich Tier: first richTierThreshold comments (sorted by likeCount)
      // Lite Tier: remaining comments
      const isLiteBatch = i >= richTierThreshold;
      const tier = isLiteBatch ? "Lite" : "Rich";

      console.log(`[API] Processing batch ${Math.floor(i / batchSize) + 1} (${tier} Tier, indices ${i}-${i + batch.length - 1})...`);

      // Use Axis-based analysis if enabled, otherwise use legacy sentiment analysis
      let result;
      if (useAxisMode && axisProfile && (engine as any).analyzeAxisBatch) {
        console.log(`[API] Using Axis-based analysis (${tier} mode)...`);
        result = await (engine as any).analyzeAxisBatch({
          comments: batch,
          isLite: isLiteBatch,
          videoContext: {
            title: video.title,
            channelName: video.channelName,
            description: video.description,
            summary: summary,
          },
        }, axisProfile);
      } else {
        console.log(`[API] Using legacy sentiment analysis (${tier} mode)...`);
        result = await engine.analyzeBatch({
          comments: batch,
          isLite: isLiteBatch,
          videoContext: {
            title: video.title,
            channelName: video.channelName,
            description: video.description,
            summary: summary,
          },
        });
      }

      if (result.isPartial) {
        isPartialResult = true;
      }

      // Merge sentiment data with comments and detect repeat users
      const seenUserIds = new Set<string>();
      for (let j = 0; j < batch.length; j++) {
        const comment = batch[j];
        const analysis = result.analyses[j];

        if (!analysis) {
          console.warn(`No analysis result for comment ${comment.id} at index ${j}`);
          continue;
        }

        const userId = comment.authorChannelId || comment.author;
        const isRepeatUser = seenUserIds.has(userId);
        seenUserIds.add(userId);

        analyzedComments.push({
          ...comment,
          sentiment: analysis.score,
          weightedScore: analysis.weightedScore,
          emotions: analysis.emotions,
          isSarcasm: analysis.isSarcasm,
          isRepeatUser,
          // Axis-based fields (if available)
          label: analysis.label,
          confidence: analysis.confidence,
          axisEvidence: analysis.axisEvidence,
          replyRelation: analysis.replyRelation,
        });
      }

      // Add a delay between batches to stay under rate limits
      // Gemini free tier needs ~4.5s (15 RPM), others like OpenAI/Groq can be much faster
      const delay = engine.name === 'GeminiEngine' ? 4500 : 200;
      if (i + batchSize < comments.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Calculate unique users across all comments
    const allUniqueUsers = new Set(analyzedComments.map(c => c.authorChannelId || c.author));

    // Calculate distribution with bias reduction
    // We give slightly less weight (0.5x) to multiple comments from the same user
    // to prevent a single user from dominating the sentiment.
    let positiveWeight = 0;
    let neutralWeight = 0;
    let negativeWeight = 0;

    analyzedComments.forEach(c => {
      const weight = c.isRepeatUser ? 0.5 : 1.0;
      if (c.sentiment > 0.2) positiveWeight += weight;
      else if (c.sentiment < -0.2) negativeWeight += weight;
      else neutralWeight += weight;
    });

    const totalWeight = positiveWeight + neutralWeight + negativeWeight;

    // Normalize weights to match total comment count for the UI display
    const scaleFactor = analyzedComments.length / totalWeight;

    const distribution = {
      positive: Math.round(positiveWeight * scaleFactor),
      neutral: Math.round(neutralWeight * scaleFactor),
      negative: Math.round(negativeWeight * scaleFactor),
      total: analyzedComments.length,
      uniqueUsers: allUniqueUsers.size,
    };

    // Generate timeline data
    const timeline = generateTimeline(analyzedComments, video.publishedAt);

    // Generate scatter data
    const scatterData = generateScatterData(analyzedComments, video.publishedAt);

    const response: VideoAnalysis = {
      video,
      comments: analyzedComments,
      distribution,
      timeline,
      scatterData,
      analyzedAt: new Date().toISOString(),
      isPartial: isPartialResult,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Analysis error:", error);

    if (error && typeof error === "object" && "code" in error) {
      const apiError = error as { code: string; message: string; statusCode?: number };

      // Handle specific YouTube API errors
      if (apiError.code === "VIDEO_NOT_FOUND") {
        return NextResponse.json(
          { error: "Video not found. Please check the URL." },
          { status: 404 }
        );
      }

      if (apiError.code === "COMMENTS_DISABLED") {
        return NextResponse.json(
          { error: "Comments are disabled for this video." },
          { status: 403 }
        );
      }

      if (apiError.code === "TIMEOUT") {
        return NextResponse.json(
          { error: "Request timeout. The video may have too many comments." },
          { status: 408 }
        );
      }

      if (apiError.code === "GEMINI_QUOTA_EXCEEDED" || apiError.code === "GROQ_QUOTA_EXCEEDED" || apiError.code === "OPENAI_QUOTA_EXCEEDED" || apiError.code === "API_QUOTA_EXCEEDED") {
        return NextResponse.json(
          { error: "API quota exceeded. Please wait a minute before trying again." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: apiError.message || "API error occurred" },
        { status: apiError.statusCode || 500 }
      );
    }

    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

/**
 * Generate timeline data from analyzed comments
 */
function generateTimeline(comments: AnalyzedComment[], videoPublishedAt: string): TimeSeriesPoint[] {
  const videoDate = new Date(videoPublishedAt);
  const now = new Date();
  const totalHours = (now.getTime() - videoDate.getTime()) / (1000 * 60 * 60);

  // Create time windows
  const windowCount = Math.max(1, Math.min(9, Math.ceil(totalHours / 6)));
  const windowSize = totalHours / windowCount;

  const timeline: TimeSeriesPoint[] = [];

  for (let i = 0; i < windowCount; i++) {
    const windowEnd = windowSize * (i + 1);

    const commentsInWindow = comments.filter((c) => {
      const commentDate = new Date(c.publishedAt);
      const hoursSinceVideo = (commentDate.getTime() - videoDate.getTime()) / (1000 * 60 * 60);
      return hoursSinceVideo <= windowEnd;
    });

    const avgSentiment =
      commentsInWindow.length > 0
        ? commentsInWindow.reduce((sum, c) => sum + c.sentiment, 0) / commentsInWindow.length
        : 0;

    timeline.push({
      time: windowEnd,
      avgSentiment,
      commentCount: commentsInWindow.length,
    });
  }

  return timeline;
}

/**
 * Generate scatter plot data from analyzed comments
 */
function generateScatterData(comments: AnalyzedComment[], videoPublishedAt: string): ScatterDataPoint[] {
  const videoDate = new Date(videoPublishedAt);

  return comments.map((comment) => {
    const commentDate = new Date(comment.publishedAt);
    const hoursSinceVideo = (commentDate.getTime() - videoDate.getTime()) / (1000 * 60 * 60);

    return {
      time: Math.max(0, hoursSinceVideo),
      sentiment: comment.sentiment,
      likeCount: comment.likeCount,
      text: comment.text,
      commentId: comment.id,
    };
  });
}
