# CommentRadar Development Roadmap & Strategy

This document outlines the strategic plan and detailed roadmap for building **CommentRadar**, a YouTube sentiment analysis application powered by LLMs.

## 🛡️ Implementation Strategy

### 1. Mock-First Development (UI Centric)
To ensure the "Premium & Dynamic" design requirement is met without being blocked by API limits or costs:
- We will build the entire Dashboard UI using **Mock Data** first.
- This allows quick iteration on animations, gradients, and chart aesthetics.
- Real API integration will happen only after the UI is polished.

### 2. Architecture: "Smart Batching" for LLMs
To handle the latency and cost of LLMs (OpenAI/Gemini) effectively:
- **Batch Processing:** Instead of 1 API call per comment, we will bundle comments (e.g., 20-50 at a time) into a single prompt.
- **Optimistic UI:** Show "Analyzing..." skeletons while the backend processes the batches asynchronously.
- **Caching:** Store analysis results in memory or local storage to avoid re-analyzing the same video repeatedly during a session.

### 3. Modular "Engine" Design
We will implement the analysis logic using the **Adapter Pattern**:
- `AnalysisEngine` (Interface)
  - `MockEngine` (Returns instant, fake data for dev)
  - `LLMEngine` (The real deal connecting to OpenAI/Gemini)
- This allows seamless switching between Dev/Prod modes via environment variables.

---

## 🗺️ Roadmap Checklist

### Phase 1: Project Initialization & Visual Foundation
- [ ] **Initialize Next.js App**
  - Run: `npx create-next-app@latest comment-radar --typescript --tailwind --app --src-dir`
  - Select options: App Router (Yes), TypeScript (Yes), Tailwind CSS (Yes), `src/` directory (Yes)
  - Verify: `package.json`, `tsconfig.json`, `next.config.ts` are created
  - Configuration: Ensure `@/` path aliases in `tsconfig.json` (should be auto-configured)
  - Test: `npm run dev` should start dev server successfully
- [ ] **Install Core Dependencies**
  - Run: `npm install recharts lucide-react framer-motion`
  - Verify installation in `package.json`
- [ ] **Initialize shadcn/ui**
  - Run: `npx shadcn@latest init`
  - Select: Default style, CSS variables (Yes), Tailwind config location (tailwind.config.ts)
  - Install components: `npx shadcn@latest add button card input skeleton toast`
  - Verify: `components/ui/` directory is created
- [ ] **Environment Setup**
  - Create `.env.local` file in project root
  - Add placeholder: `NEXT_PUBLIC_YOUTUBE_API_KEY=your_key_here`
  - Add placeholder: `USE_MOCK_ENGINE=true`
  - Verify `.env.local` is in `.gitignore`
- [ ] **Design System Setup**
  - Define color palette (CSS Variables) in `src/app/globals.css` (Focus on vibrant/glassmorphism)
  - Create base Layout in `src/app/layout.tsx` (Header, Main Container with gradients)
  - Add custom Tailwind theme extensions in `tailwind.config.ts` if needed

### Phase 2: Core UI Components
- [ ] **Hero / Search Component**
  - Create `src/components/hero-search.tsx`
  - Animated search bar input with Framer Motion
  - "Analyze" button with loading state (use shadcn/ui Button)
  - YouTube URL validation and video ID extraction logic
- [ ] **Video Info Card**
  - Create `src/components/video-info-card.tsx`
  - Display: Thumbnail (Next.js Image), Title, Channel Name
  - Use shadcn/ui Card component with glassmorphism styling
- [ ] **Chart Widgets (Mock Data Mode)**
  - Create `src/components/charts/sentiment-donut-chart.tsx`: Distribution of Positive/Negative/Neutral (Recharts PieChart)
  - Create `src/components/charts/time-scatter-plot.tsx`: X=Time, Y=Sentiment, Size=Likes (Recharts ScatterChart)
  - Create `src/components/charts/timeline-chart.tsx`: Line chart of sentiment over time (Recharts LineChart)
  - All charts should work with mock data initially
- [ ] **Comment List Component**
  - Create `src/components/comment-list.tsx`
  - Card design for individual comments with "Sentiment Badge" and "Like Count"
  - Use shadcn/ui Card and Badge components

### Phase 3: Domain Logic & Mock Data
- [ ] **Define Types**
  - Create `src/types/index.ts`
  - Define interfaces: `Comment`, `AnalysisResult`, `VideoMetadata`, `SentimentScore`, `EmotionTag`
  - Export all types from barrel file for easy imports
- [ ] **Analysis Engine Interface**
  - Create `src/lib/engine/types.ts` with `AnalysisEngine` interface
  - Define method signatures: `analyze(comments: Comment[]): Promise<AnalysisResult[]>`
- [ ] **Mock Engine Implementation**
  - Create `src/lib/engine/mock-engine.ts` implementing `AnalysisEngine`
  - Generate realistic dummy sentiment scores (-1.0 to +1.0)
  - Include mock emotion tags and sarcasm detection
  - Add configurable delay to simulate API latency
- [ ] **Mock Data Generators**
  - Create `src/lib/mock-data/generators.ts`
  - Generator functions for: `generateMockComments()`, `generateMockVideo()`, `generateMockAnalysis()`
  - Ensure Japanese and English comment examples
- [ ] **Testing Setup**
  - Install: `npm install -D vitest @testing-library/react @testing-library/jest-dom`
  - Create `vitest.config.ts`
  - Create test: `src/lib/engine/__tests__/mock-engine.test.ts`
  - Verify sentiment score calculation and weighting logic
- [ ] **Dashboard Assembly (Mock Mode)**
  - Create `src/app/dashboard/page.tsx`
  - Assemble all components (Hero, VideoInfo, Charts, CommentList)
  - Connect components to mock data generators
  - Verify responsiveness and animations with mock data

### Phase 4: YouTube Data API Integration
- [ ] **YouTube API Setup**
  - Update `.env.local`: Replace placeholder with real YouTube Data API v3 key
  - Verify API key has YouTube Data API v3 enabled (see `docs/youtube_api_setup.md`)
  - Add API key restriction (recommended): Limit to YouTube Data API v3 only
- [ ] **YouTube Service - Video Metadata**
  - Create `src/lib/youtube/client.ts`: YouTube API client wrapper
  - Implement `fetchVideoMetadata(videoId: string)`: Returns title, thumbnail, channel name, publish date
  - Handle errors: Invalid video ID, video not found, API quota exceeded
- [ ] **YouTube Service - Comment Threads**
  - Implement `fetchCommentThreads(videoId: string, maxResults?: number)` in `src/lib/youtube/client.ts`
  - Handle pagination: Fetch up to specified limit (default: 100 comments)
  - Extract: Comment text, author, like count, publish date, reply count
  - Handle errors: Comments disabled, API quota exceeded
- [ ] **Integration with Dashboard**
  - Create API Route: `src/app/api/analyze/route.ts`
  - Connect YouTube service to dashboard search flow
  - Replace mock video data with real YouTube API responses
  - Add loading states and error boundaries

### Phase 5: LLM Sentiment Engine
- [ ] **LLM Client Setup**
  - Choose: OpenAI (GPT-4o-mini) or Google Gemini (Flash 1.5)
  - Install SDK: `npm install openai` or `npm install @google/generative-ai`
  - Add to `.env.local`: `OPENAI_API_KEY=sk-...` or `GEMINI_API_KEY=...`
  - Create `src/lib/llm/client.ts`: LLM client wrapper with error handling
- [ ] **Prompt Engineering**
  - Create `src/lib/llm/prompts.ts`: System prompt templates
  - Design prompt for JSON output format:
    ```json
    [{"id": "comment_1", "score": 0.8, "emotions": ["応援", "共感"], "is_sarcasm": false, "reason": "..."}]
    ```
  - Include examples for: Positive, negative, neutral, sarcastic comments
  - Optimize for token efficiency (compress instructions)
- [ ] **Real LLM Engine Implementation**
  - Create `src/lib/engine/llm-engine.ts` implementing `AnalysisEngine` interface
  - Implement weighted scoring: `Final Score = LLM_Score * (1 + log(LikeCount + 1))`
  - Add retry logic for API failures (exponential backoff)
- [ ] **Batch Processor Implementation**
  - Create `src/lib/engine/batch-processor.ts`
  - Chunk comments into batches of 20-50
  - Fire parallel requests with `Promise.all()`
  - Implement rate limiting to avoid API quota issues
  - Add progress tracking for UI optimistic updates
- [ ] **Engine Switcher**
  - Create `src/lib/engine/factory.ts`: Engine factory function
  - Read `USE_MOCK_ENGINE` from environment to switch between MockEngine and LLMEngine
  - Update dashboard to use factory instead of hardcoded mock engine
- [ ] **Testing**
  - Create `src/lib/engine/__tests__/llm-engine.test.ts`
  - Mock LLM API responses for testing
  - Verify batch processing logic and error handling

### Phase 6: Polish & Launch Ready
- [ ] **Comprehensive Error Handling**
  - Create `src/components/error-boundary.tsx`: React Error Boundary component
  - Video not found (404): Show user-friendly message with retry button
  - Comments disabled: Detect from YouTube API response, show alternative message
  - API Quota exceeded: Cache results, show rate limit warning with countdown
  - LLM API errors: Fallback to mock engine or show graceful error message
  - Network errors: Retry mechanism with exponential backoff
- [ ] **Performance Optimization**
  - Memoize chart components with `React.memo()`
  - Implement `useMemo` for expensive sentiment calculations
  - Add code splitting for chart components: `dynamic(() => import('...'), { ssr: false })`
  - Optimize Next.js Image loading: Add `priority` for above-fold images
  - Review bundle size: `npm run build` and check `.next/analyze`
- [ ] **Caching Strategy**
  - Implement client-side caching for analyzed videos (localStorage or IndexedDB)
  - Add cache expiration (e.g., 24 hours)
  - Show "Using cached results" indicator when loading from cache
- [ ] **Accessibility & UX Polish**
  - Add proper ARIA labels to interactive elements
  - Ensure keyboard navigation works for all components
  - Test with screen readers
  - Add loading skeletons (use shadcn/ui Skeleton) for all async operations
- [ ] **Final Design Review**
  - Ensure "WOW" factor: smooth hover effects, transitions (Framer Motion)
  - Verify glassmorphism effects on cards
  - Check gradient consistency across all charts
  - Responsive design testing: Mobile, tablet, desktop
  - Dark mode support (if not already implemented)
- [ ] **Documentation & Deployment Prep**
  - Update README.md with setup instructions
  - Add environment variable documentation
  - Create deployment guide (Vercel recommended)
  - Add screenshots/demo video to README

---
**Current Status:** Planning Complete - Project Not Yet Initialized

**Next Action:** Execute Phase 1 by running `npx create-next-app@latest` in parent directory
