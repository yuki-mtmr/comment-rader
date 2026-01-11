"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
} from "recharts";

interface CommentDataPoint {
  time: number; // hours since video published
  sentiment: number; // -1.0 to 1.0
  likeCount: number;
  text: string;
}

interface TimeScatterPlotProps {
  data: CommentDataPoint[];
}

export function TimeScatterPlot({ data }: TimeScatterPlotProps) {
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload;
      return (
        <div className="glass-dark p-3 rounded-lg border border-white/10 max-w-xs">
          <p className="font-semibold text-sm mb-1">
            {point.time.toFixed(1)} hours after upload
          </p>
          <p className="text-sm mb-1">
            Sentiment: {point.sentiment > 0 ? "+" : ""}
            {point.sentiment.toFixed(2)}
          </p>
          <p className="text-sm mb-2">Likes: {point.likeCount}</p>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {point.text}
          </p>
        </div>
      );
    }
    return null;
  };

  const getSentimentColor = (sentiment: number) => {
    if (sentiment > 0.2) return "hsl(var(--sentiment-positive))";
    if (sentiment < -0.2) return "hsl(var(--sentiment-negative))";
    return "hsl(var(--sentiment-neutral))";
  };

  return (
    <Card className="glass-dark border-white/10">
      <CardHeader>
        <CardTitle className="gradient-text">Time vs Sentiment</CardTitle>
        <p className="text-sm text-muted-foreground">
          Bubble size represents like count
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart
            margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis
              type="number"
              dataKey="time"
              name="Time (hours)"
              stroke="hsl(var(--muted-foreground))"
              label={{
                value: "Hours Since Upload",
                position: "insideBottom",
                offset: -10,
                fill: "hsl(var(--muted-foreground))",
              }}
            />
            <YAxis
              type="number"
              dataKey="sentiment"
              name="Sentiment"
              domain={[-1, 1]}
              stroke="hsl(var(--muted-foreground))"
              label={{
                value: "Sentiment Score",
                angle: -90,
                position: "insideLeft",
                fill: "hsl(var(--muted-foreground))",
              }}
            />
            <ZAxis type="number" dataKey="likeCount" range={[50, 400]} />
            <Tooltip content={<CustomTooltip />} />
            <Scatter
              data={data}
              fill="hsl(var(--sentiment-positive))"
              shape={(props: any) => {
                const { cx, cy, payload } = props;
                const color = getSentimentColor(payload.sentiment);
                const radius = Math.sqrt(payload.likeCount + 1) * 2;
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={Math.max(4, Math.min(radius, 20))}
                    fill={color}
                    fillOpacity={0.6}
                    stroke={color}
                    strokeWidth={2}
                  />
                );
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
