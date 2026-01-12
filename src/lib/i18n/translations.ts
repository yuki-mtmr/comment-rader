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
            message: "Some comments were analyzed using a neutral fallback due to API rate limits. The overview is still representative, but individual analysis for some comments may be missing details.",
        },
        video: {
            views: "Views",
            likes: "Likes",
            comments: "Comments",
            published: "Published",
        },
        charts: {
            sentimentDistribution: "Stance Distribution",
            sentimentTimeline: "Stance Evolution",
            scatterTitle: "Engagement vs. Stance",
            positive: "Support",
            neutral: "Neutral",
            negative: "Oppose",
            avgSentiment: "Average Stance",
            commentCount: "Comment Count",
            hoursSincePublished: "Hours since published",
            engagement: "Likes",
            sentiment: "Stance Score",
            time: "Time (Hours)",
        },
        comments: {
            title: "Comment Radar",
            topComments: "Top Comments",
            recentComments: "Recent Comments",
            searchPlaceholder: "Search comments...",
            all: "All",
            positive: "Support",
            negative: "Oppose",
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
            message: "APIの利用制限により、一部のコメントは中立的な評価として処理されました。全体の傾向は把握可能ですが、個別の詳細な分析が欠けている場合があります。",
        },
        video: {
            views: "再生回数",
            likes: "高評価",
            comments: "コメント数",
            published: "公開日",
        },
        charts: {
            sentimentDistribution: "スタンス分布",
            sentimentTimeline: "スタンスの推移",
            scatterTitle: "エンゲージメントとスタンスの相関",
            positive: "賛成",
            neutral: "中立",
            negative: "反対",
            avgSentiment: "平均スタンス",
            commentCount: "コメント数",
            hoursSincePublished: "公開後（時間）",
            engagement: "いいね数",
            sentiment: "スタンススコア",
            time: "経過時間（時間）",
        },
        comments: {
            title: "コメントレーダー",
            topComments: "上位コメント",
            recentComments: "最新のコメント",
            searchPlaceholder: "コメントを検索...",
            all: "すべて",
            positive: "賛成",
            negative: "反対",
            sarcasm: "皮肉を検出",
            repeatUser: "リピーター",
        }
    }
};

export type Language = "en" | "ja";
export type TranslationKey = typeof translations.en;
