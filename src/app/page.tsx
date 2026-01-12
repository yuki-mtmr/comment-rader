"use client";

import { useState } from "react";
import { HeroSearch } from "@/components/hero-search";
import { VideoInfoCard } from "@/components/video-info-card";
import { SentimentDonutChart } from "@/components/charts/sentiment-donut-chart";
import { TimeScatterPlot } from "@/components/charts/time-scatter-plot";
import { SentimentTimeline } from "@/components/charts/sentiment-timeline";
import { CommentList } from "@/components/comment-list";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import type { VideoAnalysis } from "@/types";
import { toast } from "sonner";
import { getCachedAnalysis, setCachedAnalysis } from "@/lib/cache/analysis-cache";

import { useLanguage } from "@/lib/i18n/context";

export default function Home() {
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { language, t } = useLanguage();

  const handleSearch = async (url: string) => {
    setIsLoading(true);
    setError(null);
    setAnalysis(null);

    toast.loading(t.common.loading, { id: "analysis" });

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, maxComments: 50 }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t.common.error);
      }

      const data: VideoAnalysis = await response.json();
      setAnalysis(data);

      // Cache the result
      setCachedAnalysis(url, data);

      const successMsg = language === "ja"
        ? `分析が完了しました！${data.comments.length}件のコメントを分析しました。`
        : `Analysis complete! Analyzed ${data.comments.length} comments.`;

      toast.success(successMsg, { id: "analysis" });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t.common.error;
      setError(errorMessage);
      toast.error(errorMessage, { id: "analysis" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <HeroSearch onSearch={handleSearch} isLoading={isLoading} />

      {error && (
        <Card className="glass-dark border-red-500/50">
          <CardContent className="p-6">
            <p className="text-red-400 text-center">{error}</p>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="space-y-6">
          <Skeleton className="h-48 w-full rounded-lg" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-80 w-full rounded-lg" />
            <Skeleton className="h-80 w-full rounded-lg" />
          </div>
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      )}

      {analysis && !isLoading && (
        <>
          {analysis.isPartial && (
            <Card className="glass-dark border-yellow-500/50 mb-6">
              <CardContent className="p-4 flex items-center justify-center gap-3">
                <span className="text-yellow-400 text-xl">⚠️</span>
                <p className="text-yellow-400 text-sm">
                  <strong>{t.quota.title}:</strong> {t.quota.message}
                </p>
              </CardContent>
            </Card>
          )}
          <VideoInfoCard {...analysis.video} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SentimentDonutChart
              support={analysis.distribution.support}
              neutral={analysis.distribution.neutral}
              oppose={analysis.distribution.oppose}
            />
            <SentimentTimeline data={analysis.timeline} />
          </div>

          <TimeScatterPlot data={analysis.scatterData} />

          <CommentList comments={analysis.comments} maxDisplay={20} />
        </>
      )}
    </div>
  );
}
