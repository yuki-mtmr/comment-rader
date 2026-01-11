/**
 * LLM Prompts for sentiment analysis
 *
 * These prompts are designed to return structured JSON for batch processing.
 */

import type { YouTubeComment } from "@/types";

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
