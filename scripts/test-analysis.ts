
import { AnalysisService } from '../src/lib/service/analysis-service';
import { AxisProfile, YouTubeComment } from '../src/types';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runTest() {
    console.log("Starting AnalysisService Test...");

    if (!process.env.OPENAI_API_KEY && !process.env.GROQ_API_KEY) {
        console.error("Error: No API KEYS found in .env.local");
        process.exit(1);
    }

    console.log(`Using Engine: ${process.env.LLM_ENGINE || 'default (openai)'}`);

    const service = new AnalysisService();

    // Mock Data
    const mockComments: YouTubeComment[] = [
        {
            id: "c1",
            text: "This tutorial is amazing! I finally understand the topic.",
            author: "User A",
            likeCount: 10,
            publishedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            replyCount: 0
        },
        {
            id: "c2",
            text: "I completely disagree. Your method is dangerous.",
            author: "User B",
            likeCount: 5,
            publishedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            replyCount: 0
        },
        {
            id: "c3",
            text: "What camera are you using?",
            author: "User C",
            likeCount: 1,
            publishedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            replyCount: 0
        }
    ];

    const mockProfile: AxisProfile = {
        videoId: "v1",
        mainAxis: "Teaching Method X",
        axisStatement: "Method X is the best way to learn.",
        axisType: "education",
        creatorPosition: "Pro-Method X",
        protagonists: ["Method X Users"],
        antagonists: ["Traditional Schools"],
        coreValues: ["Efficiency", "Innovation"],
        negativeValues: ["Rote memorization"],
        valuePriority: ["Efficiency", "Tradition"],
        stanceRules: [],
        lexiconHints: [],
        generatedAt: new Date().toISOString()
    };

    console.log("Analyzing batch of 3 comments...");

    try {
        const result = await service.analyzeAxisBatch({
            comments: mockComments,
            isLite: false,
            videoContext: {
                title: "Why Method X Changes Everything",
                channelName: "Test Channel",
                summary: "A video explaining why Method X is superior to traditional schooling."
            }
        }, mockProfile);

        console.log("\n--- Analysis Result ---");
        console.log(`Processed ${result.analyses.length} comments.`);
        console.log(`Tokens used: ${result.tokensUsed}`);

        result.analyses.forEach(a => {
            console.log(`\n[${a.commentId}] ${a.label} (Score: ${a.score})`);
            console.log(`Reason: ${a.reason}`);
            console.log(`Stance Direction: ${a.stanceDirection}`);
        });

        if (result.analyses.length === 3) {
            console.log("\n✅ SUCCESS: All comments analyzed.");
        } else {
            console.log("\n❌ FAILURE: Count mismatch.");
        }

    } catch (error) {
        console.error("\n❌ ERROR:", error);
    }
}

runTest();
