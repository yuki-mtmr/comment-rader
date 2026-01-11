"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface SentimentDonutChartProps {
  positive: number;
  neutral: number;
  negative: number;
}

export function SentimentDonutChart({
  positive,
  neutral,
  negative,
}: SentimentDonutChartProps) {
  const data = [
    { name: "Positive", value: positive, color: "hsl(var(--sentiment-positive))" },
    { name: "Neutral", value: neutral, color: "hsl(var(--sentiment-neutral))" },
    { name: "Negative", value: negative, color: "hsl(var(--sentiment-negative))" },
  ];

  const COLORS = data.map(item => item.color);

  const total = positive + neutral + negative;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const percentage = ((payload[0].value / total) * 100).toFixed(1);
      return (
        <div className="glass-dark p-3 rounded-lg border border-white/10">
          <p className="font-semibold">{payload[0].name}</p>
          <p className="text-sm">
            {payload[0].value} comments ({percentage}%)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="glass-dark border-white/10">
      <CardHeader>
        <CardTitle className="gradient-text">Sentiment Overview</CardTitle>
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
