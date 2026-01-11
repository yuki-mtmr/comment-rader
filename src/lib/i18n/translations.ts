export const translations = {
    en: {
        common: {
            appName: "CommentRadar",
            appSubtitle: "AI-Powered YouTube Comment Sentiment Analysis",
            search: "Analyze",
            placeholder: "Paste YouTube Video URL...",
            loading: "Analyzing video comments...",
            error: "Error",
            retry: "Retry",
        },
        quota: {
            title: "API Quota Limitation",
            message: "Some comments were analyzed using a neutral fallback due to Gemini API rate limits. The overview is still representative, but individual analysis for some comments may be missing details.",
        },
        video: {
            views: "Views",
            likes: "Likes",
            comments: "Comments",
            published: "Published",
        },
        charts: {
            sentimentDistribution: "Sentiment Distribution",
            sentimentTimeline: "Sentiment Evolution",
            scatterTitle: "Engagement vs. Sentiment",
            positive: "Positive",
            neutral: "Neutral",
            negative: "Negative",
            avgSentiment: "Average Sentiment",
            commentCount: "Comment Count",
            hoursSincePublished: "Hours since published",
            engagement: "Likes",
            sentiment: "Sentiment",
            time: "Time (Hours)",
        },
        comments: {
            title: "Comment Radar",
            topComments: "Top Comments",
            recentComments: "Recent Comments",
            searchPlaceholder: "Search comments...",
            all: "All",
            positive: "Positive",
            negative: "Negative",
            sarcasm: "Sarcasm Detected",
            repeatUser: "Repeat User",
        }
    },
    ja: {
        common: {
            appName: "CommentRadar",
            appSubtitle: "AIを搭載したYouTubeコメント感情分析ツール",
            search: "分析する",
            placeholder: "YouTubeのURLを貼り付けてください...",
            loading: "コメントを分析中...",
            error: "エラー",
            retry: "再試行",
        },
        quota: {
            title: "API利用制限",
            message: "Gemini APIの利用制限により、一部のコメントは中立的な評価として処理されました。全体の傾向は把握可能ですが、個別の詳細な分析が欠けている場合があります。",
        },
        video: {
            views: "再生回数",
            likes: "高評価",
            comments: "コメント数",
            published: "公開日",
        },
        charts: {
            sentimentDistribution: "感情分布",
            sentimentTimeline: "感情の推移",
            scatterTitle: "エンゲージメントと感情の相関",
            positive: "ポジティブ",
            neutral: "ニュートラル",
            negative: "ネガティブ",
            avgSentiment: "平均感情スコア",
            commentCount: "コメント数",
            hoursSincePublished: "公開後（時間）",
            engagement: "いいね数",
            sentiment: "感情スコア",
            time: "経過時間（時間）",
        },
        comments: {
            title: "コメントレーダー",
            topComments: "上位コメント",
            recentComments: "最新のコメント",
            searchPlaceholder: "コメントを検索...",
            all: "すべて",
            positive: "ポジティブ",
            negative: "ネガティブ",
            sarcasm: "皮肉を検出",
            repeatUser: "リピーター",
        }
    }
};

export type Language = "en" | "ja";
export type TranslationKey = typeof translations.en;
