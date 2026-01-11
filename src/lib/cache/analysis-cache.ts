/**
 * Analysis Cache - Client-side caching for video analysis results
 *
 * Uses localStorage for persistence across sessions.
 */

import type { VideoAnalysis } from "@/types";

const CACHE_KEY_PREFIX = "comment-radar:analysis:";
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  data: VideoAnalysis;
  timestamp: number;
}

/**
 * Generate cache key from video URL
 */
function getCacheKey(videoUrl: string): string {
  // Extract video ID or use full URL
  const videoIdMatch = videoUrl.match(/(?:v=|\/|embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  const videoId = videoIdMatch ? videoIdMatch[1] : videoUrl;
  return `${CACHE_KEY_PREFIX}${videoId}`;
}

/**
 * Check if cache entry is still valid
 */
function isValid(entry: CacheEntry): boolean {
  const now = Date.now();
  return now - entry.timestamp < CACHE_EXPIRY_MS;
}

/**
 * Get cached analysis result
 */
export function getCachedAnalysis(videoUrl: string): VideoAnalysis | null {
  if (typeof window === "undefined") return null;

  try {
    const cacheKey = getCacheKey(videoUrl);
    const cached = localStorage.getItem(cacheKey);

    if (!cached) return null;

    const entry: CacheEntry = JSON.parse(cached);

    if (!isValid(entry)) {
      // Remove expired entry
      localStorage.removeItem(cacheKey);
      return null;
    }

    return entry.data;
  } catch (error) {
    console.error("Failed to retrieve cached analysis:", error);
    return null;
  }
}

/**
 * Cache analysis result
 */
export function setCachedAnalysis(videoUrl: string, analysis: VideoAnalysis): void {
  if (typeof window === "undefined") return;

  try {
    const cacheKey = getCacheKey(videoUrl);
    const entry: CacheEntry = {
      data: analysis,
      timestamp: Date.now(),
    };

    localStorage.setItem(cacheKey, JSON.stringify(entry));
  } catch (error) {
    console.error("Failed to cache analysis:", error);
    // Quota exceeded - clear old entries
    clearOldEntries();
  }
}

/**
 * Clear cached analysis for a specific video
 */
export function clearCachedAnalysis(videoUrl: string): void {
  if (typeof window === "undefined") return;

  try {
    const cacheKey = getCacheKey(videoUrl);
    localStorage.removeItem(cacheKey);
  } catch (error) {
    console.error("Failed to clear cached analysis:", error);
  }
}

/**
 * Clear all cached analyses
 */
export function clearAllCache(): void {
  if (typeof window === "undefined") return;

  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error("Failed to clear all cache:", error);
  }
}

/**
 * Clear old/expired entries to free up space
 */
function clearOldEntries(): void {
  if (typeof window === "undefined") return;

  try {
    const keys = Object.keys(localStorage);
    const now = Date.now();

    keys.forEach((key) => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        try {
          const cached = localStorage.getItem(key);
          if (cached) {
            const entry: CacheEntry = JSON.parse(cached);
            if (now - entry.timestamp >= CACHE_EXPIRY_MS) {
              localStorage.removeItem(key);
            }
          }
        } catch {
          // Invalid entry, remove it
          localStorage.removeItem(key);
        }
      }
    });
  } catch (error) {
    console.error("Failed to clear old entries:", error);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { count: number; size: number } {
  if (typeof window === "undefined") return { count: 0, size: 0 };

  try {
    const keys = Object.keys(localStorage);
    let count = 0;
    let size = 0;

    keys.forEach((key) => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        count++;
        const value = localStorage.getItem(key);
        if (value) {
          size += value.length;
        }
      }
    });

    return { count, size };
  } catch (error) {
    console.error("Failed to get cache stats:", error);
    return { count: 0, size: 0 };
  }
}
