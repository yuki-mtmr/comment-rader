/**
 * Test script for Axis-based analysis
 *
 * Usage: node test-axis-analysis.js
 */

const YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"; // Replace with actual video URL
const MAX_COMMENTS = 20; // Small number for quick testing

async function testAxisAnalysis() {
  console.log("=== Axis-Based Analysis Test ===\n");
  console.log(`Testing with: ${YOUTUBE_URL}`);
  console.log(`Max comments: ${MAX_COMMENTS}\n`);

  try {
    const response = await fetch("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: YOUTUBE_URL,
        maxComments: MAX_COMMENTS,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("❌ API Error:", error);
      return;
    }

    const data = await response.json();

    console.log("✅ Analysis Complete!\n");
    console.log("--- Video Info ---");
    console.log(`Title: ${data.video.title}`);
    console.log(`Channel: ${data.video.channelName}`);
    console.log(`Comments analyzed: ${data.comments.length}\n`);

    // Check if Axis-based fields are present
    const axisComments = data.comments.filter(c => c.label);
    console.log("--- Axis-Based Analysis Results ---");
    console.log(`Comments with stance labels: ${axisComments.length}/${data.comments.length}`);

    if (axisComments.length > 0) {
      console.log("\n✅ Axis-based analysis is working!\n");

      // Show distribution of stance labels
      const labelCounts = {
        Support: 0,
        Oppose: 0,
        Neutral: 0,
        Unknown: 0,
      };

      axisComments.forEach(c => {
        labelCounts[c.label]++;
      });

      console.log("Stance Distribution:");
      console.log(`  Support: ${labelCounts.Support} (${((labelCounts.Support / axisComments.length) * 100).toFixed(1)}%)`);
      console.log(`  Oppose: ${labelCounts.Oppose} (${((labelCounts.Oppose / axisComments.length) * 100).toFixed(1)}%)`);
      console.log(`  Neutral: ${labelCounts.Neutral} (${((labelCounts.Neutral / axisComments.length) * 100).toFixed(1)}%)`);
      console.log(`  Unknown: ${labelCounts.Unknown} (${((labelCounts.Unknown / axisComments.length) * 100).toFixed(1)}%)`);

      // Show sample comments
      console.log("\n--- Sample Analyzed Comments (Top 5) ---");
      axisComments.slice(0, 5).forEach((comment, idx) => {
        console.log(`\n${idx + 1}. [${comment.label}] ${comment.confidence ? `(${Math.round(comment.confidence * 100)}%)` : ''}`);
        console.log(`   Text: "${comment.text.slice(0, 80)}..."`);
        if (comment.axisEvidence) {
          console.log(`   Evidence: "${comment.axisEvidence.slice(0, 100)}..."`);
        }
        if (comment.replyRelation) {
          console.log(`   Reply relation: ${comment.replyRelation}`);
        }
      });

      // Check for thread-aware synthesis
      const repliesWithSynthesis = axisComments.filter(c => c.replyRelation && c.axisEvidence?.includes("Thread Context"));
      if (repliesWithSynthesis.length > 0) {
        console.log(`\n✅ Thread-aware synthesis detected in ${repliesWithSynthesis.length} replies!`);
      }
    } else {
      console.log("\n⚠️ No Axis-based labels found. Using legacy sentiment analysis.");
      console.log("Make sure USE_AXIS_MODE=true in .env.local");
    }

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error(error);
  }
}

testAxisAnalysis();
