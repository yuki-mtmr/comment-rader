# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CommentRadar** is a YouTube comment sentiment analysis web application that uses LLMs to analyze viewer sentiment on YouTube videos. Users input a YouTube video URL, and the app analyzes comments to visualize viewer reactions (positive/negative/neutral) with advanced sentiment scoring.

## Tech Stack

- **Frontend:** Next.js (App Router) with TypeScript
- **Styling:** Tailwind CSS + Shadcn/UI (or Radix UI)
- **Charts:** Recharts
- **Backend:** Next.js API Routes / Server Actions
- **Sentiment Analysis Engine:** OpenAI API (GPT-4o-mini) or Google Gemini API (Flash 1.5)
- **Data Source:** YouTube Data API v3
- **Animations:** Framer Motion (planned)

## Architecture Principles

### Mock-First Development
Build the entire dashboard UI using mock data first before integrating real APIs. This allows rapid iteration on design without being blocked by API costs or rate limits.

### Smart Batching for LLM Analysis
To manage LLM costs and latency:
- **Batch Processing:** Bundle 20-50 comments per API call instead of 1 call per comment
- **Optimistic UI:** Show loading states while batches process asynchronously
- **Caching:** Store analysis results to avoid re-analyzing the same video in a session

### Modular Engine Design (Adapter Pattern)
```
AnalysisEngine (Interface)
├── MockEngine (Fake data for development)
└── LLMEngine (Real OpenAI/Gemini integration)
```
Switch between modes via environment variables.

## Core Features

### Sentiment Analysis
The LLM analyzes each comment and returns structured JSON with:
- **Sentiment Score:** -1.0 (completely negative) to +1.0 (completely positive)
- **Emotion Tags:** "anger", "empathy", "funny", "supportive", etc.
- **Is_Sarcasm:** Flag for sarcastic comments (positive words used critically)
- **Weighted Score:** `Final Score = LLM_Score * (1 + log(LikeCount))`

### Visualization Components
1. **Sentiment Overview:** Donut chart showing positive/negative/neutral distribution
2. **Time x Sentiment Scatter:** Scatter plot with time (X-axis), sentiment (Y-axis), bubble size = like count
3. **Timeline:** Sentiment trend from video publication to present

## Environment Variables

```bash
NEXT_PUBLIC_YOUTUBE_API_KEY=AIzaSy...  # YouTube Data API v3 key
OPENAI_API_KEY=sk-...                   # or Gemini API key
```

See [docs/youtube_api_setup.md](docs/youtube_api_setup.md) for API key setup instructions.

## Design Requirements

**"Premium & Dynamic" aesthetic:**
- Glassmorphism card designs
- Vibrant gradients on charts
- Smooth animations and transitions
- Dark mode support
- Responsive across devices

## Implementation Phases

The project follows a 6-phase roadmap (see [docs/ROADMAP.md](docs/ROADMAP.md)):
1. Project initialization & visual foundation
2. Core UI components (with mock data)
3. Domain logic & mock data generators
4. YouTube Data API integration
5. LLM sentiment engine implementation
6. Polish & error handling

## Key Implementation Notes

- **Path aliases:** Use `@/` for imports (configured in tsconfig)
- **YouTube URL parsing:** Extract video ID from various YouTube URL formats
- **Comment fetching:** Handle pagination from YouTube API, implement max comment limits
- **LLM prompt engineering:** Design prompts that return JSON arrays with `{id, score, reason}` for batch processing
- **Cost optimization:** Minimize tokens through prompt compression, use parallel processing with `Promise.all`
- **Error handling:** Cover cases like "video not found", "comments disabled", "API quota exceeded"
