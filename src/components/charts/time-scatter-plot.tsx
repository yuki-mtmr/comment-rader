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

import { useLanguage } from "@/lib/i18n/context";

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
  const { t } = useLanguage();

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload;
      return (
        <div className="glass-dark p-3 rounded-lg border border-white/10 max-w-xs">
          <p className="font-semibold text-sm mb-1">
            {point.time.toFixed(1)} {t.charts.time}
          </p>
          <p className="text-sm mb-1">
            {t.charts.sentiment}: {point.sentiment > 0 ? "+" : ""}
            {point.sentiment.toFixed(2)}
          </p>
          <p className="text-sm mb-2">{t.charts.engagement}: {point.likeCount}</p>
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
        <CardTitle className="gradient-text">{t.charts.scatterTitle}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t.common.appSubtitle}
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
              name={t.charts.time}
              stroke="hsl(var(--muted-foreground))"
              label={{
                value: t.charts.hoursSincePublished,
                position: "insideBottom",
                offset: -10,
                fill: "hsl(var(--muted-foreground))",
              }}
            />
            <YAxis
              type="number"
              dataKey="sentiment"
              name={t.charts.sentiment}
              domain={[-1, 1]}
              stroke="hsl(var(--muted-foreground))"
              label={{
                value: t.charts.sentiment,
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
