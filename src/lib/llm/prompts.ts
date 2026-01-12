/**
 * LLM Prompts for sentiment analysis
 *
 * These prompts are designed to return structured JSON for batch processing.
 */

import type { YouTubeComment, AxisProfile } from "@/types";

/**
 * System prompt for sentiment analysis
 */
export const SYSTEM_PROMPT = `You are a specialized Sentiment & Stance Analysis agent for YouTube.

Your task is to determine a comment's alignment with the Video Creator based on the provided Video Context.

### 1. ROLE IDENTIFICATION (Identify these from Video Summary):
- [Creator]: The channel owner.
- [Opponent]: Any person, group, or idea the creator is criticizing or arguing against.
- [Topic]: The general subject matter.

### 2. ALIGNMENT MATRIX (Worldview Alignment):
| User Action | Context from Summary | Final Sentiment |
| :--- | :--- | :--- |
| Agrees with / Echoes | [Creator's Values / Main Message] | POSITIVE (+1.0) |
| Criticizes / Attacks | [What the Creator is Attacking] | POSITIVE (+1.0) |
| Comparisons (Unfavorable) | [Praising someone else to mock Creator] | NEGATIVE (-1.0) |
| Defends / Praises | [What the Creator is Attacking] | NEGATIVE (-1.0) |
| Attacks / Criticizes | [Creator or Creator's Views] | NEGATIVE (-1.0) |
| Hypocrisy Check | ["Who are you to talk?" / "どの口で"] | NEGATIVE (-1.0) |
| Matches | [Creator's specific terminology/stance] | POSITIVE (+0.8) |
| General comment | [Topic] | NEUTRAL (0.0) |

### 3. EXPLICIT LOGIC FOR "VALUES":
- If the creator says "X is bad and Y is good":
  - A user saying "I hate X" is POSITIVE (Aligned with creator).
  - A user saying "I love Y" is POSITIVE (Aligned with creator).
  - A user saying "X is not that bad" is NEGATIVE (Opposed to creator).

### 3. LINGUISTIC NUANCES:
- Sarcasm: Detecting praise used ironically to highlight failure.
- Mockery: Detecting derogatory comparisons (e.g., "Person X does better than you").
- Contextual Loyalty: A mocking tone is POSITIVE ONLY IF attacking an [Opponent].
- Hypocrisy: Direct attacks on the Creator's consistency/authority (e.g., "Look who's talking") are NEGATIVE.

### 4. SCHEMA COMPLIANCE (MUST FOLLOW):
- "score": Numeric ONLY. Use 0.8 (CORRECT), NOT +0.8 (WRONG).
- "isSarcasm": Boolean ONLY. Use true/false (CORRECT), NOT "true"/"false" (WRONG).
- "reason": Single line string. No " (double quotes) or \\ (backslashes) inside.
- DELIMITERS: No extra ] or } at the end.

JSON TEMPLATE:
{
  "comments": [
    {
      "commentId": "...",
      "reason": "Target:[x]. Intent:[x]. Reasoning:[x]",
      "score": 0.8,
      "emotions": ["supportive"],
      "isSarcasm": false
    }
  ]
}

Return ONLY the JSON. No preamble. No + sign in scores.`;

/**
 * Create a batch analysis prompt
 */
export function createBatchPrompt(
  comments: YouTubeComment[],
  videoContext?: { title: string; channelName: string; description?: string; summary?: string }
): string {
  const contextInfo = videoContext
    ? `### VIDEO CONTEXT (READ THIS FIRST)
Creator: "${videoContext.channelName}"
Title: "${videoContext.title}"

--- VIDEO SUMMARY & STANCE ---
${videoContext.summary || "No summary available."}
------------------------------

`
    : "";

  const commentsJson = comments.map((c) => ({
    commentId: c.id,
    author: c.author,
    text: c.text,
    parentText: c.parentText,
  }));

  return `${contextInfo}Analyze ${comments.length} comments.

MISSION:
- Use the "VIDEO SUMMARY" to identify who the "Opponents" or "Critics" are.
- Support for those Opponents MUST be scored as NEGATIVE sentiment for this video.

JSON format:
{
  "comments": [
    {
      "commentId": "...",
      "reason": "Target: [Creator/Opponent/Topic/Other]. Reason: ...",
      "score": -0.8,
      "emotions": ["critical"],
      "isSarcasm": false
    }
  ]
}

Comments to analyze:
${JSON.stringify(commentsJson, null, 2)}

Emotion tags: "joy", "anger", "sadness", "fear", "surprise", "disgust", "empathy", "supportive", "funny", "critical", "grateful", "frustrated", "enthusiastic", "analytical", "sarcasm", "confused", "disappointed", "excited"`;
}

/**
 * Create a single comment analysis prompt (fallback)
 */
export function createSingleCommentPrompt(
  comment: YouTubeComment,
  videoContext?: { title: string; channelName: string; description?: string }
): string {
  const contextInfo = videoContext
    ? `Creator: "${videoContext.channelName}"\nVideo: "${videoContext.title}"\n\n`
    : "";

  return `${contextInfo}Analyze this YouTube comment:

Author: ${comment.author}
Text: "${comment.text}"

Return a JSON object with "reason" first to think before scoring:
{
  "commentId": "${comment.id}",
  "reason": "<explain context and subject here>",
  "score": <-1.0 to 1.0>,
  "emotions": [<emotion tags>],
  "isSarcasm": <boolean>
}

Emotion tags: "joy", "anger", "sadness", "fear", "surprise", "disgust", "empathy", "supportive", "funny", "critical", "grateful", "frustrated", "enthusiastic", "analytical", "sarcasm", "confused", "disappointed", "excited"

Return only the JSON object:`;
}

/**
 * NEW: Axis-based System Prompt for Stance Analysis
 */
export const AXIS_SYSTEM_PROMPT = `You are an advanced Stance Analysis agent for YouTube comments.

Your task is to determine each comment's stance (Support/Oppose/Neutral/Unknown) toward the video's MAIN AXIS using a two-axis model (Direction & Intensity).

### 1. CORE CONCEPT: AXIS STANCE
- DO NOT judge sentiment toward the creator as a person.
- JUDGE the commenter's alignment with the video's core claim (axis_statement).

### 2. OUTPUT SCHEMA:
{
  "comments": [
    {
      "commentId": "...",
      "stance_direction": "support" | "oppose" | "neutral" | "unknown",
      "stance_intensity": 0.0 to 1.0,  // Degree of alignment/opposition
      "emotion_polarity": "positive" | "negative" | "mixed" | "none",
      "target": "creator" | "antagonist" | "values" | "topic" | "parent_author" | "other" | "unknown",
      "speech_act": "praise" | "attack" | "question" | "sarcasm" | "quote" | "analysis" | "meta" | "spam",
      "reason": "Target:[x]. Direction:[x]. Key Evidence:[x].",
      "label": "Support" | "Oppose" | "Neutral" | "Unknown", // Combined label
      "confidenceLevel": "high" | "medium" | "low",
      "axisEvidence": "Citation from text",
      "reply_relation_to_parent": "agree" | "disagree" | "unclear",
      "score": -1.0 to 1.0, // Calculated as: intensity * (direction == support ? 1 : -1)
      "emotions": ["anger", "supportive", etc.],
      "isSarcasm": boolean
    }
  ]
}

### 3. ENTITY & VALUE ALIGNMENT (CRITICAL):
- Support for [Antagonists] or [Negative Values] = OPPOSING the axis.
- Attacks on [Antagonists] or [Negative Values] = SUPPORTING the axis (Strong intensity).
- Support for [Protagonists] or [Core Values] = SUPPORTING the axis.
- Praising the Creator's effort/personality = SUPPORTING the axis (Low intensity).
- Agreeing with the "feeling" (e.g., "I get why you are angry") = SUPPORTING the axis (Low intensity).

### 4. NEUTRAL SEGMENTATION:
- weak_support: Praise for creator, pragmatic agreement, "it can't be helped" → direction: support, intensity: 0.1-0.3.
- neutral_unrelated: Off-topic or meta-comments → direction: neutral, intensity: 0.0.
- unknown: Completely unclear or instructions not followed → direction: unknown, intensity: 0.0.

### 5. LINGUISTIC RULES:
- "こいつ/あいつ/お前" usually indicates an [Antagonist] in this community context.
- Use "lexicon_hints" to identify video-specific coded language.
- "皮肉 (Sarcasm)" is usually "Oppose" if directed at Creator, and "Support" if directed at Antagonist.

Return ONLY valid JSON. No preamble.`;

/**
 * NEW: Create Axis-based batch prompt
 */
export function createAxisBatchPrompt(
  comments: YouTubeComment[],
  axisProfile: AxisProfile,
  videoContext?: { title: string; channelName: string; description?: string; summary?: string }
): string {
  const contextInfo = `### AXIS MAP (THOUGHT PROFILE)
Axis Statement: "${axisProfile.axisStatement}"
Axis Type: ${axisProfile.axisType}
Protagonists: ${JSON.stringify(axisProfile.protagonists)}
Antagonists: ${JSON.stringify(axisProfile.antagonists)}
Core Values (Support these): ${JSON.stringify(axisProfile.coreValues)}
Negative Values (Oppose these): ${JSON.stringify(axisProfile.negativeValues)}
Stance Rules: ${JSON.stringify(axisProfile.stanceRules)}
Lexicon Hints: ${JSON.stringify(axisProfile.lexiconHints)}
Caveats: ${JSON.stringify(axisProfile.caveats)}

### VIDEO METADATA
Creator: "${videoContext?.channelName || "Unknown"}"
Title: "${videoContext?.title || "Unknown"}"
Summary: ${videoContext?.summary || "N/A"}

`;

  const commentsJson = comments.map((c) => ({
    commentId: c.id,
    author: c.author,
    text: c.text,
    parentText: c.parentText || null,
  }));

  return `${contextInfo}
Analyze ${comments.length} comments using the AXIS MAP.

MISSION:
- Identify if the comment supports or opposes the Axis Statement.
- Use Protagonists/Antagonists and Values to determine alignment.
- A reply's relation to parent MUST be correctly identified for secondary pass.

Comments to analyze:
${JSON.stringify(commentsJson, null, 2)}

Return JSON as defined in system prompt.`;
}

/**
 * NEW: Lite Batch Prompt for minimal token output (statistical sampling)
 * Used for lower-priority comments to reduce costs
 */
export function createLiteBatchPrompt(
  comments: YouTubeComment[],
  videoContext?: { title: string; channelName: string; description?: string; summary?: string }
): string {
  const contextInfo = videoContext
    ? `### VIDEO CONTEXT
Creator: "${videoContext.channelName}"
Title: "${videoContext.title}"
Summary: ${videoContext.summary || "No summary available."}

`
    : "";

  const commentsJson = comments.map((c) => ({
    commentId: c.id,
    text: c.text,
  }));

  return `${contextInfo}TASK: Statistical sentiment analysis. Return ONLY score for each comment. No explanations needed.

OUTPUT FORMAT (JSON only):
{
  "comments": [
    {"commentId": "...", "score": 0.8},
    {"commentId": "...", "score": -0.5}
  ]
}

Comments:
${JSON.stringify(commentsJson, null, 2)}

CRITICAL: Return minimal JSON with commentId and score ONLY. No reason, no emotions, no extra fields.`;
}

/**
 * NEW: Lite Axis Batch Prompt for minimal token output
 * Returns only label and score for statistical analysis
 */
export function createLiteAxisBatchPrompt(
  comments: YouTubeComment[],
  axisProfile: AxisProfile,
  videoContext?: { title: string; channelName: string; description?: string; summary?: string }
): string {
  const contextInfo = `### AXIS PROFILE
Main Axis: "${axisProfile.mainAxis}"
Creator's Position: "${axisProfile.creatorPosition}"

`;

  const commentsJson = comments.map((c) => ({
    commentId: c.id,
    text: c.text,
  }));

  return `${contextInfo}TASK: Statistical stance analysis. Return ONLY label and score for each comment.

OUTPUT FORMAT (JSON only):
{
  "comments": [
    {"commentId": "...", "label": "Support", "score": 0.85},
    {"commentId": "...", "label": "Oppose", "score": -0.8}
  ]
}

Stance labels: "Support" | "Oppose" | "Neutral" | "Unknown"

Comments:
${JSON.stringify(commentsJson, null, 2)}

CRITICAL: Return minimal JSON with commentId, label, and score ONLY. No reason, no evidence, no emotions.`;
}
