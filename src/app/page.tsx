"use client";

import { useState } from "react";
import { HeroSearch } from "@/components/hero-search";
import { VideoInfoCard } from "@/components/video-info-card";
import { SentimentDonutChart } from "@/components/charts/sentiment-donut-chart";
import { TimeScatterPlot } from "@/components/charts/time-scatter-plot";
import { SentimentTimeline } from "@/components/charts/sentiment-timeline";
import { CommentList } from "@/components/comment-list";

// Mock data
const mockVideoInfo = {
  title: "Building a Next.js App with TypeScript and Tailwind CSS",
  channelName: "Web Dev Mastery",
  thumbnailUrl: "https://picsum.photos/seed/nextjs/640/360",
  viewCount: 125000,
  likeCount: 8500,
  commentCount: 523,
  publishedAt: "2024-01-10T10:00:00Z",
};

const mockComments = [
  {
    id: "1",
    author: "TechEnthusiast",
    text: "This is exactly what I needed! The explanation is crystal clear and the examples are super helpful.",
    likeCount: 42,
    publishedAt: "2024-01-10T12:30:00Z",
    sentiment: 0.85,
    emotions: ["supportive", "grateful"],
    isSarcasm: false,
  },
  {
    id: "2",
    author: "CodeNewbie",
    text: "I've been struggling with TypeScript for weeks, but this tutorial made everything click. Thank you!",
    likeCount: 28,
    publishedAt: "2024-01-10T14:15:00Z",
    sentiment: 0.78,
    emotions: ["grateful", "relieved"],
    isSarcasm: false,
  },
  {
    id: "3",
    author: "CriticalViewer",
    text: "The pacing is too fast and some important concepts are glossed over. Not great for beginners.",
    likeCount: 15,
    publishedAt: "2024-01-10T16:45:00Z",
    sentiment: -0.65,
    emotions: ["disappointed", "critical"],
    isSarcasm: false,
  },
  {
    id: "4",
    author: "FunnyGuy",
    text: "Great tutorial! Now I can finally build that app I've been procrastinating on for 6 months... or will I? 😅",
    likeCount: 56,
    publishedAt: "2024-01-10T18:20:00Z",
    sentiment: 0.45,
    emotions: ["funny", "self-aware"],
    isSarcasm: false,
  },
  {
    id: "5",
    author: "SarcasticDev",
    text: "Oh wonderful, another tutorial telling me to 'just npm install'. Very helpful indeed.",
    likeCount: 8,
    publishedAt: "2024-01-10T20:00:00Z",
    sentiment: -0.55,
    emotions: ["sarcasm", "frustrated"],
    isSarcasm: true,
  },
  {
    id: "6",
    author: "HappyLearner",
    text: "The production tips at the end are gold! Subscribed immediately.",
    likeCount: 34,
    publishedAt: "2024-01-11T08:30:00Z",
    sentiment: 0.92,
    emotions: ["enthusiastic", "supportive"],
    isSarcasm: false,
  },
  {
    id: "7",
    author: "NeutralObserver",
    text: "Covers the basics well. Could use more advanced examples but it's a solid foundation.",
    likeCount: 19,
    publishedAt: "2024-01-11T10:15:00Z",
    sentiment: 0.15,
    emotions: ["analytical", "balanced"],
    isSarcasm: false,
  },
  {
    id: "8",
    author: "AngryCommenter",
    text: "This is outdated already. Why not use the latest version? Total waste of time.",
    likeCount: 3,
    publishedAt: "2024-01-11T12:00:00Z",
    sentiment: -0.88,
    emotions: ["angry", "frustrated"],
    isSarcasm: false,
  },
];

const mockScatterData = mockComments.map((comment, idx) => ({
  time: idx * 2.5 + Math.random() * 2,
  sentiment: comment.sentiment,
  likeCount: comment.likeCount,
  text: comment.text,
}));

const mockTimelineData = [
  { time: 0, avgSentiment: 0.75, commentCount: 12 },
  { time: 6, avgSentiment: 0.62, commentCount: 28 },
  { time: 12, avgSentiment: 0.48, commentCount: 45 },
  { time: 18, avgSentiment: 0.35, commentCount: 67 },
  { time: 24, avgSentiment: 0.52, commentCount: 89 },
  { time: 30, avgSentiment: 0.58, commentCount: 112 },
  { time: 36, avgSentiment: 0.45, commentCount: 148 },
  { time: 42, avgSentiment: 0.38, commentCount: 187 },
  { time: 48, avgSentiment: 0.41, commentCount: 223 },
];

const mockSentimentCounts = {
  positive: mockComments.filter((c) => c.sentiment > 0.2).length,
  neutral: mockComments.filter((c) => c.sentiment >= -0.2 && c.sentiment <= 0.2).length,
  negative: mockComments.filter((c) => c.sentiment < -0.2).length,
};

export default function Home() {
  const [showResults, setShowResults] = useState(true);

  const handleSearch = (url: string) => {
    console.log("Searching for:", url);
    setShowResults(true);
  };

  return (
    <div className="space-y-8">
      <HeroSearch onSearch={handleSearch} />

      {showResults && (
        <>
          <VideoInfoCard {...mockVideoInfo} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SentimentDonutChart {...mockSentimentCounts} />
            <SentimentTimeline data={mockTimelineData} />
          </div>

          <TimeScatterPlot data={mockScatterData} />

          <CommentList comments={mockComments} maxDisplay={8} />
        </>
      )}
    </div>
  );
}
