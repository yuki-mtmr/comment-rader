/**
 * Core domain types for CommentRadar
 */

// YouTube Data Types
export interface YouTubeVideo {
  id: string;
  title: string;
  channelName: string;
  channelId: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
  description?: string;
  transcript?: string;
}

export interface YouTubeComment {
  id: string;
  videoId: string;
  author: string;
  authorChannelId?: string;
  text: string;
  likeCount: number;
  publishedAt: string;
  updatedAt?: string;
  parentId?: string; // For replies
  parentText?: string; // Content of the parent comment
}

// Sentiment Analysis Types
export type SentimentScore = number; // -1.0 (negative) to +1.0 (positive)

export type EmotionTag =
  | "anger"
  | "joy"
  | "sadness"
  | "fear"
  | "surprise"
  | "disgust"
  | "empathy"
  | "supportive"
  | "funny"
  | "critical"
  | "grateful"
  | "frustrated"
  | "enthusiastic"
  | "analytical"
  | "sarcasm"
  | "confused"
  | "neutral"
  | "disappointed"
  | "excited";

// Axis-Based Stance Analysis Types
export type StanceLabel = "Support" | "Oppose" | "Neutral" | "Unknown";

export type ReplyRelation = "agree" | "disagree" | "clarify" | "question" | "unrelated";

export type SpeechAct = "assertion" | "question" | "joke" | "sarcasm" | "insult" | "praise" | "other";

export interface AxisProfile {
  videoId: string;
  mainAxis: string; // e.g., "この教育方針は有効か"
  axisStatement: string; // Concise central claim
  axisType: "critic" | "education" | "other";
  creatorPosition: string; // e.g., "座学より実践を重視すべき"
  targetOfCriticism?: string; // e.g., "理論ばかりで行動しない人"
  supportedValues?: string; // e.g., "実践的な学び、行動力"
  protagonists: string[]; // List of people/groups on the creator's side
  antagonists: string[]; // List of people/groups being criticized
  coreValues: string[]; // Positive values promoted by creator
  negativeValues: string[]; // Negative values criticized by creator
  stanceRules: string[]; // Explicit rules for judging stance
  lexiconHints: string[]; // Key terms for this specific video
  // Thought Map extensions
  valuePriority: string[]; // Ordered list of values from highest to lowest priority
  antagonistAliases?: Record<string, string[]>; // e.g. {"antagonist_name": ["alias1", "alias2"]}
  butMarkers?: string[]; // e.g. ["but", "however", "although", "とは思うが"]
  caveats: string[]; // Specific instructions for edge cases
  generatedAt: string;
}

export interface SentimentAnalysis {
  commentId: string;
  score: SentimentScore;
  weightedScore: SentimentScore; // Score adjusted by like count
  emotions: EmotionTag[];
  isSarcasm: boolean;
  reason?: string; // Why this sentiment was assigned

  // New Enhanced Axis-based fields
  label?: StanceLabel; // Standard Support/Oppose/Neutral/Unknown
  stanceDirection?: "support" | "oppose" | "neutral" | "unknown";
  stanceIntensity?: number; // 0.0 to 1.0
  emotionPolarity?: "positive" | "negative" | "mixed" | "none";
  target?: "creator" | "antagonist" | "values" | "topic" | "parent_author" | "other" | "unknown";
  confidenceLevel?: "high" | "medium" | "low";

  // Intermediate reasoning (Claim Extraction)
  disclaimer?: string;
  mainClaim?: string;
  valueTradeoff?: { higher: string; lower: string } | null;
  stanceType?: "personal_support" | "pragmatic_support" | "value_priority_support" | "antagonist_attack_support" | "meta_norm_support" | "weak_oppose" | "neutral_unrelated" | "unknown_unclear";
  confidence?: number; // Numeric 0.0-1.0
  axisEvidence?: string; // Evidence for stance judgment
  replyRelation?: ReplyRelation; // Relation to parent comment
  speechAct?: SpeechAct; // Type of speech act
}

export interface AnalyzedComment extends YouTubeComment {
  sentiment: SentimentScore;
  weightedScore: SentimentScore;
  emotions: EmotionTag[];
  isSarcasm: boolean;
  isRepeatUser?: boolean;
  // Axis-based fields (when using axis analysis mode)
  label?: StanceLabel;
  confidence?: number;
  axisEvidence?: string;
  replyRelation?: ReplyRelation;
}

// Aggregated Analytics Types
export interface SentimentDistribution {
  positive: number;
  neutral: number;
  negative: number;
  total: number;
  uniqueUsers: number;
}

export interface TimeSeriesPoint {
  time: number; // Hours since video published
  avgSentiment: SentimentScore;
  commentCount: number;
}

export interface ScatterDataPoint {
  time: number; // Hours since video published
  sentiment: SentimentScore;
  likeCount: number;
  text: string;
  commentId: string;
}

export interface VideoAnalysis {
  video: YouTubeVideo;
  comments: AnalyzedComment[];
  distribution: SentimentDistribution;
  timeline: TimeSeriesPoint[];
  scatterData: ScatterDataPoint[];
  analyzedAt: string;
  isPartial?: boolean;
}

// Engine Types
export interface AnalysisEngineConfig {
  batchSize: number; // Number of comments per LLM call
  maxComments?: number; // Limit total comments to analyze
  timeoutMs?: number; // API timeout
}

export interface BatchAnalysisRequest {
  comments: YouTubeComment[];
  isLite?: boolean; // If true, return minimal fields for cost optimization
  videoContext?: {
    title: string;
    channelName: string;
    description?: string;
    summary?: string;
  };
}

export interface BatchAnalysisResponse {
  analyses: SentimentAnalysis[];
  processingTimeMs: number;
  tokensUsed?: number;
  isPartial?: boolean;
}

// Error Types
export class AnalysisError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}

export class YouTubeAPIError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "YouTubeAPIError";
  }
}
