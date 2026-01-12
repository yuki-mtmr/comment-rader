"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

import { useLanguage } from "@/lib/i18n/context";

interface SentimentDonutChartProps {
  support: number;
  neutral: number;
  oppose: number;
}

export function SentimentDonutChart({
  support,
  neutral,
  oppose,
}: SentimentDonutChartProps) {
  const { t } = useLanguage();

  const data = [
    { name: t.charts.positive, value: support, color: "hsl(var(--sentiment-positive))" },
    { name: t.charts.neutral, value: neutral, color: "hsl(var(--sentiment-neutral))" },
    { name: t.charts.negative, value: oppose, color: "hsl(var(--sentiment-negative))" },
  ];

  const COLORS = data.map(item => item.color);

  const total = support + neutral + oppose;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const percentage = ((payload[0].value / total) * 100).toFixed(1);
      return (
        <div className="glass-dark p-3 rounded-lg border border-white/10">
          <p className="font-semibold">{payload[0].name}</p>
          <p className="text-sm">
            {payload[0].value} {t.video.comments} ({percentage}%)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="glass-dark border-white/10">
      <CardHeader>
        <CardTitle className="gradient-text">{t.charts.sentimentDistribution}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              fill="#8884d8"
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              formatter={(value, entry: any) => {
                const percentage = ((entry.payload.value / total) * 100).toFixed(1);
                return `${value}: ${entry.payload.value} (${percentage}%)`;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
