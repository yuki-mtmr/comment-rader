
import { embedMany, cosineSimilarity } from 'ai';
import { openai } from '@ai-sdk/openai';

export interface DocumentChunk {
    content: string;
    embedding?: number[];
    similarity?: number;
}

/**
 * Splits text into chunks with overlap.
 */
export function splitText(text: string, chunkSize: number = 500, overlap: number = 50): string[] {
    const chunks: string[] = [];
    if (!text) return chunks;

    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        chunks.push(text.slice(start, end));
        start += chunkSize - overlap;
    }
    return chunks;
}

/**
 * Retrieves relevant chunks using cosine similarity.
 */
export async function retrieveContext(
    query: string,
    chunks: string[],
    topK: number = 5
): Promise<DocumentChunk[]> {
    try {
        // 1. DANGER: Batch embedding all chunks can be expensive for very long videos.
        // Optimization: Limit total chunks if necessary, but for now assuming reasonable transcript length.
        if (chunks.length === 0) return [];

        // Embed both query and chunks
        const { embeddings } = await embedMany({
            model: openai.embedding('text-embedding-3-small'),
            values: [query, ...chunks],
        });

        const queryEmbedding = embeddings[0];
        const chunkEmbeddings = embeddings.slice(1);

        const scoredChunks = chunks.map((chunk, i) => ({
            content: chunk,
            embedding: chunkEmbeddings[i],
            similarity: cosineSimilarity(queryEmbedding, chunkEmbeddings[i]),
        }));

        // Sort by similarity descending
        scoredChunks.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

        return scoredChunks.slice(0, topK);
    } catch (error) {
        console.warn("[RAG] Retrieval failed, returning empty context:", error);
        return [];
    }
}
