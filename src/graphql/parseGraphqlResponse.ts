/**
 * Raw Facebook GraphQL response deserializer.
 * Safely parses single JSON objects, anti-hijack prefixed strings (for (;;);),
 * and newline-delimited JSON chunks.
 */

export function parseRawGraphqlResponse(rawText: string): unknown[] {
  if (!rawText || rawText.trim() === '') {
    return [];
  }

  // Strip Facebook anti-hijack prefix: for (;;);
  let cleaned = rawText.replace(/^\s*for\s*\(\s*;\s*;\s*\)\s*;\s*/, '').trim();

  // Attempt 1: Direct JSON parse
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // Fall through to line-by-line / chunk parsing
  }

  // Attempt 2: Newline-delimited JSON (Relay chunked stream)
  const results: unknown[] = [];
  const lines = cleaned.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsedChunk = JSON.parse(trimmed);
      results.push(parsedChunk);
    } catch {
      // Ignore non-JSON lines or partial frames
    }
  }

  return results;
}
