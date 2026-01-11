"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

import { useLanguage } from "@/lib/i18n/context";

interface TimelineDataPoint {
  time: number; // hours since video published
  avgSentiment: number; // average sentiment in this time window
  commentCount: number; // number of comments in this window
}

interface SentimentTimelineProps {
  data: TimelineDataPoint[];
}

export function SentimentTimeline({ data }: SentimentTimelineProps) {
  const { t } = useLanguage();

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload;
      return (
        <div className="glass-dark p-3 rounded-lg border border-white/10">
          <p className="font-semibold text-sm mb-1">
            {point.time.toFixed(0)} {t.charts.time}
          </p>
          <p className="text-sm mb-1">
            {t.charts.avgSentiment}: {point.avgSentiment > 0 ? "+" : ""}
            {point.avgSentiment.toFixed(2)}
          </p>
          <p className="text-sm text-muted-foreground">
            {point.commentCount} {t.video.comments}
          </p>
        </div>
      );
    }
    return null;
  };

  const getLineColor = (value: number) => {
    if (value > 0) return "hsl(var(--sentiment-positive))";
    if (value < 0) return "hsl(var(--sentiment-negative))";
    return "hsl(var(--sentiment-neutral))";
  };

  return (
    <Card className="glass-dark border-white/10">
      <CardHeader>
        <CardTitle className="gradient-text">{t.charts.sentimentTimeline}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t.common.appSubtitle}
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis
              dataKey="time"
              stroke="hsl(var(--muted-foreground))"
              label={{
                value: t.charts.hoursSincePublished,
                position: "insideBottom",
                offset: -10,
                fill: "hsl(var(--muted-foreground))",
              }}
            />
            <YAxis
              domain={[-1, 1]}
              stroke="hsl(var(--muted-foreground))"
              label={{
                value: t.charts.avgSentiment,
                angle: -90,
                position: "insideLeft",
                fill: "hsl(var(--muted-foreground))",
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={0}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
            />
            <Line
              type="monotone"
              dataKey="avgSentiment"
              stroke="url(#sentimentGradient)"
              strokeWidth={3}
              dot={{
                fill: "hsl(var(--sentiment-positive))",
                r: 4,
                strokeWidth: 2,
                stroke: "hsl(var(--background))",
              }}
              activeDot={{
                r: 6,
                strokeWidth: 2,
              }}
            />
            <defs>
              <linearGradient id="sentimentGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="hsl(var(--sentiment-positive))" />
                <stop offset="50%" stopColor="hsl(var(--sentiment-neutral))" />
                <stop offset="100%" stopColor="hsl(var(--sentiment-negative))" />
              </linearGradient>
            </defs>
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
