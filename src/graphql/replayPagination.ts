import type { Page } from 'playwright';
import { GraphqlRequestTemplate, cloneRequestWithCursor, hashCursor } from './captureRequestTemplate.js';
import { ScraperError } from '../models/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Tracks observed cursor hashes to detect and prevent infinite pagination loops.
 */
export class CursorLoopDetector {
  private readonly seenCursors = new Set<string>();

  public register(cursor: string): void {
    if (!cursor) return;
    if (this.seenCursors.has(cursor)) {
      throw new ScraperError(
        'GRAPHQL_PAGINATION_LOOP_DETECTED',
        `Cursor loop detected: cursor hash [${hashCursor(cursor)}] has already been visited.`
      );
    }
    this.seenCursors.add(cursor);
  }

  public hasSeen(cursor: string): boolean {
    return this.seenCursors.has(cursor);
  }

  public size(): number {
    return this.seenCursors.size;
  }
}

/**
 * Replays a captured GraphQL pagination request directly from within the browser page context.
 *
 * CRITICAL ADVANTAGES:
 * 1. Executes in the exact same anonymous browser context (same origin, cookies, headers, and JS state).
 * 2. Requires zero UI scrolling.
 * 3. Does not forge or reverse-engineer signed tokens (uses original browser session bootstrap).
 *
 * @param page Active Playwright Page instance
 * @param template The captured request template
 * @param nextCursor The end_cursor retrieved from previous page
 * @param countOverride Optional override for items per page
 * @returns Raw GraphQL response string
 */
export async function replayPaginationRequest(
  page: Page,
  template: GraphqlRequestTemplate,
  nextCursor: string,
  countOverride?: number
): Promise<string> {
  const { body, variables } = cloneRequestWithCursor(template, nextCursor, countOverride);

  logger.debug(
    `[HYBRID] Replaying pagination request with cursor hash [${hashCursor(nextCursor)}] (count: ${variables.count ?? 'default'})`
  );

  try {
    const rawResponse = await page.evaluate(
      async ({ endpoint, requestBody }: { endpoint: string; requestBody: string }) => {
        const res = await window.fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: requestBody,
          credentials: 'include',
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        return await res.text();
      },
      {
        endpoint: '/api/graphql/',
        requestBody: body,
      }
    );

    if (!rawResponse || rawResponse.trim() === '') {
      throw new ScraperError(
        'GRAPHQL_REPLAY_RETURNED_NO_DATA',
        'Replayed GraphQL request succeeded with HTTP 200 but returned an empty response body.'
      );
    }

    return rawResponse;
  } catch (err) {
    if (err instanceof ScraperError) {
      throw err;
    }
    throw new ScraperError(
      'GRAPHQL_REPLAY_FAILED',
      `Failed to replay pagination request via page.evaluate(fetch): ${String(err)}`
    );
  }
}
