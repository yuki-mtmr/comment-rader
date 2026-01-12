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
export const AXIS_SYSTEM_PROMPT = `
You are an expert impartial analyst of YouTube comments, specializing in Stance Detection based on a specific "Video Axis Profile".
Your goal is to determine if a comment supports or opposes the Creator's specific position, NOT general morality.

### ANALYTICAL PROCESS (THOUGHT MAP)
1. **CLAIM EXTRACTION**:
   - Split comment into "Disclaimer" (preface) and "Main Claim".
   - **BUT-Rule**: If you see "A... but B", B is the Main Claim. Ignore A for stance.
   - Example: "Violence is bad (Disclaimer), but they deserved it (Main Claim)." -> Support (if creator attacks them).

2. **VALUE PRIORITY**:
   - Compare the comment's values against the Creator's "Value Priority Map".
   - If values conflict (e.g. "Free Speech" vs "Safety"), check which one the Creator prioritizes.
   - **Moral Trap**: Do NOT default to "Neutral" just because a comment cites general ethics (e.g. "discrimination is wrong"). If the Creator prioritizes "Free Speech" over "sensitivity", a comment doing the same is SUPPORT.

3. **ENTITY ALIGNMENT**:
   - Attack on [Antagonists] = **SUPPORT** (Strong).
   - Attack on [Protagonists] = **OPPOSE** (Strong).
   - Praise of [Creator] = **SUPPORT** (Weak/Personal).

### STANCE CLASSIFICATION RULES
- **support**: Validates the Main Axis, attacks Antagonists, or shares High-Priority Values.
- **oppose**: Rejects the Main Axis, defenses Antagonists, or prioritizes Low-Priority Values.
- **neutral**:
  - **neutral_unrelated**: Spam, completely off-topic.
  - **weak_support**: "I guess so", "Pragmatically I agree even if it's extreme".
  - **weak_oppose**: "I agree with the goal but not this method".
- **unknown**: Cannot determine stance reliably.

### OUTPUT JSON SCHEMA
{
  "analyses": [
    {
      "commentId": "string",
      "disclaimer": "string | null",
      "main_claim": "string (The core assertion)",
      "value_tradeoff": { "higher": "string", "lower": "string" } | null,
      "stance_type": "personal_support" | "pragmatic_support" | "value_priority_support" | "antagonist_attack_support" | "meta_norm_support" | "weak_oppose" | "neutral_unrelated" | "unknown_unclear",
      "stance_direction": "support" | "oppose" | "neutral" | "unknown",
      "stance_intensity": number, // 0.0 to 1.0
      "emotion_polarity": "positive" | "negative" | "mixed" | "none",
      "target": "creator" | "antagonist" | "values" | "topic" | "parent_author" | "other" | "unknown",
      "confidenceLevel": "high" | "medium" | "low",
      "axisEvidence": "string (Short quote or logic)",
      "reply_relation_to_parent": "agree" | "disagree" | "partial_agree" | "unrelated" | "unclear" | null
    }
  ]
}

### CRITICAL RULES
- **"Excessive but Understandable"**: If a comment says "It's extreme but I understand", it is **pragmatic_support** (Intensity ~0.3).
- **"Attack on Enemy"**: Calling the antagonist names ("idiot", "hypocrite") is **antagonist_attack_support** (Intensity > 0.7).
- **"Personal Praise"**: "You are a gentleman" is **personal_support** (Intensity ~0.4).
- **"Hypocrisy Check"**: Criticizing the antagonist for behavior the creator also dislikes is **meta_norm_support** (Intensity ~0.6).
`;

/**
 * NEW: Create Axis-based batch prompt
 */
export function createAxisBatchPrompt(
  comments: YouTubeComment[],
  profile: AxisProfile,
  videoContext?: { title: string; channelName: string; description?: string; summary?: string }
): string {
  const contextInfo = `### THOUGHT MAP (Use for Claim Extraction & Priority)
- **Axis Statement**: "${profile.axisStatement}"
- **Value Priority (HIGHEST FIRST)**: ${profile.valuePriority ? JSON.stringify(profile.valuePriority) : "[]"}
- **Core Values (Support)**: ${JSON.stringify(profile.coreValues || [])}
- **Negative Values (Reject)**: ${JSON.stringify(profile.negativeValues || [])}
- **Protagonists (Defend)**: ${JSON.stringify(profile.protagonists || [])}
- **Antagonists (Attack)**: ${JSON.stringify(profile.antagonists || [])}
- **Antagonist Aliases**: ${profile.antagonistAliases ? JSON.stringify(profile.antagonistAliases) : "{}"}
- **BUT Markers**: ${profile.butMarkers ? JSON.stringify(profile.butMarkers) : "[]"}
- **Stance Rules**: ${JSON.stringify(profile.stanceRules || [])}
- **Caveats**: ${JSON.stringify(profile.caveats || [])}

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
