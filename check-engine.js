/**
 * Quick check to verify which engine is being used
 */

require('dotenv').config({ path: '.env.local' });

console.log("=== Engine Configuration Check ===\n");
console.log("Environment Variables:");
console.log(`USE_MOCK_ENGINE: ${process.env.USE_MOCK_ENGINE}`);
console.log(`LLM_ENGINE: ${process.env.LLM_ENGINE}`);
console.log(`USE_AXIS_MODE: ${process.env.USE_AXIS_MODE}`);
console.log(`GROQ_API_KEY: ${process.env.GROQ_API_KEY ? 'Set ✓' : 'Not set ✗'}`);
console.log(`GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'Set ✓' : 'Not set ✗'}`);

console.log("\nExpected Engine Selection:");

if (process.env.USE_MOCK_ENGINE === 'true') {
  console.log("→ MockEngine (USE_MOCK_ENGINE=true)");
} else if (process.env.LLM_ENGINE?.toLowerCase() === 'groq') {
  console.log("→ GroqEngine (LLM_ENGINE=groq) ✓");
  if (!process.env.GROQ_API_KEY) {
    console.log("  ⚠️  WARNING: GROQ_API_KEY not set!");
  }
} else if (process.env.LLM_ENGINE?.toLowerCase() === 'gemini') {
  console.log("→ GeminiEngine (LLM_ENGINE=gemini)");
  if (!process.env.GEMINI_API_KEY) {
    console.log("  ⚠️  WARNING: GEMINI_API_KEY not set!");
  }
} else {
  console.log("→ MockEngine (default fallback)");
}

console.log("\nAxis-Based Analysis:");
console.log(process.env.USE_AXIS_MODE === 'true' ? "✓ Enabled" : "✗ Disabled");
