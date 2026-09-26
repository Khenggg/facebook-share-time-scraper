import { logger } from '../utils/logger.js';

/**
 * Raw Facebook GraphQL response deserializer.
 * Safely parses single JSON objects, anti-hijack prefixed strings (for (;;);),
 * newline-delimited JSON chunks (Relay stream / batch), and handles malformed lines gracefully.
 *
 * @param rawText Raw response body string
 * @returns Array of parsed valid JSON payload objects
 */
export function parseGraphqlResponse(rawText: string): unknown[] {
  if (!rawText || typeof rawText !== 'string' || rawText.trim() === '') {
    return [];
  }

  // Strip Facebook anti-hijack prefix: for (;;);
  const cleaned = rawText.replace(/^\s*for\s*\(\s*;\s*;\s*\)\s*;\s*/, '').trim();

  // Attempt 1: Direct JSON parse (Standard single JSON object or array)
  try {
    const parsed = JSON.parse(cleaned);
    const results = Array.isArray(parsed) ? parsed : [parsed];
    logger.debug(`[GRAPHQL] Parsed ${results.length} response payload chunk(s) via direct JSON`);
    return results;
  } catch {
    // Fall through to newline / chunked parsing
  }

  // Attempt 2: Newline-delimited JSON (Relay incremental / chunked stream)
  const results: unknown[] = [];
  const lines = cleaned.split(/\r?\n/);
  let failedChunks = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if line has for (;;); prefix individually
    const cleanLine = trimmed.replace(/^\s*for\s*\(\s*;\s*;\s*\)\s*;\s*/, '').trim();
    if (!cleanLine) continue;

    try {
      const parsedChunk = JSON.parse(cleanLine);
      results.push(parsedChunk);
    } catch {
      failedChunks += 1;
      // Gracefully ignore non-JSON or partial stream frames
    }
  }

  if (results.length > 0) {
    logger.debug(`[GRAPHQL] Parsed ${results.length} valid chunk(s) (${failedChunks} malformed/non-JSON lines ignored)`);
  } else if (failedChunks > 0) {
    logger.debug(`[GRAPHQL] Failed to parse any JSON chunks from ${lines.length} lines`);
  }

  return results;
}

/**
 * Backward compatibility alias for parseGraphqlResponse.
 */
export const parseRawGraphqlResponse = parseGraphqlResponse;
