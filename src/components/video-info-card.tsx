"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, ThumbsUp, MessageSquare, Calendar } from "lucide-react";

import { useLanguage } from "@/lib/i18n/context";

interface VideoInfoCardProps {
  title: string;
  channelName: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
}

export function VideoInfoCard({
  title,
  channelName,
  thumbnailUrl,
  viewCount,
  likeCount,
  commentCount,
  publishedAt,
}: VideoInfoCardProps) {
  const { language, t } = useLanguage();

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const locale = language === "ja" ? "ja-JP" : "en-US";
    return date.toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Card className="glass-dark border-white/10 overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-col md:flex-row gap-6 p-6">
          {/* Thumbnail */}
          <div className="flex-shrink-0">
            <img
              src={thumbnailUrl}
              alt={title}
              className="w-full md:w-64 h-auto rounded-lg object-cover"
            />
          </div>

          {/* Video Details */}
          <div className="flex-1 space-y-4">
            <div>
              <h3 className="text-2xl font-bold mb-2 line-clamp-2">{title}</h3>
              <p className="text-muted-foreground">{channelName}</p>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-4">
              <Badge variant="secondary" className="glass text-sm py-1 px-3">
                <Eye className="w-4 h-4 mr-2" />
                {formatNumber(viewCount)} {t.video.views}
              </Badge>
              <Badge variant="secondary" className="glass text-sm py-1 px-3">
                <ThumbsUp className="w-4 h-4 mr-2" />
                {formatNumber(likeCount)} {t.video.likes}
              </Badge>
              <Badge variant="secondary" className="glass text-sm py-1 px-3">
                <MessageSquare className="w-4 h-4 mr-2" />
                {formatNumber(commentCount)} {t.video.comments}
              </Badge>
              <Badge variant="secondary" className="glass text-sm py-1 px-3">
                <Calendar className="w-4 h-4 mr-2" />
                {formatDate(publishedAt)}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
