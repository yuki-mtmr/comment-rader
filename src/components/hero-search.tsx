"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useLanguage } from "@/lib/i18n/context";

interface HeroSearchProps {
  onSearch?: (url: string) => void;
  isLoading?: boolean;
}

export function HeroSearch({ onSearch, isLoading = false }: HeroSearchProps) {
  const [url, setUrl] = useState("");
  const { t } = useLanguage();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || isLoading) return;

    onSearch?.(url);
  };

  return (
    <div className="w-full max-w-4xl mx-auto mb-12">
      <div className="text-center mb-8">
        <h2 className="text-4xl md:text-5xl font-bold mb-4">
          <span className="gradient-text">{t.common.appName}</span>
        </h2>
        <p className="text-lg text-muted-foreground">
          {t.common.appSubtitle}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <Input
              type="text"
              placeholder={t.common.placeholder}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-12 text-lg bg-background/50 backdrop-blur-sm"
              disabled={isLoading}
            />
          </div>
          <Button
            type="submit"
            size="lg"
            className="h-12 px-8 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 font-bold"
            disabled={isLoading || !url.trim()}
          >
            <Search className="mr-2 h-5 w-5" />
            {isLoading ? t.common.loading : t.common.search}
          </Button>
        </div>

        <div className="mt-4 text-sm text-muted-foreground">
          <p>Supported formats:</p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>https://www.youtube.com/watch?v=VIDEO_ID</li>
            <li>https://youtu.be/VIDEO_ID</li>
          </ul>
        </div>
      </form>
    </div>
  );
}
