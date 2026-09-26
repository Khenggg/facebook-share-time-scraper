import type { Browser } from 'playwright';
import { ShareRecord } from '../models/shareRecord.js';
import { ScrapeRunResult, PlaywrightCookie } from '../models/comparison.js';
import { ScraperError } from '../models/errors.js';
import { createAnonymousContext } from '../facebook/session/createAnonymousContext.js';
import { createAuthenticatedContext } from '../facebook/session/createAuthenticatedContext.js';
import { verifyFacebookSession } from '../facebook/session/verifyFacebookSession.js';
import { openPost } from '../facebook/openPost.js';
import { dismissLoginModal } from '../facebook/dismissLoginModal.js';
import { findPostScrollContainer } from '../facebook/findPostScrollContainer.js';
import { scrollPostToEngagement } from '../facebook/scrollPostToEngagement.js';
import { openResharesDialog } from '../facebook/openResharesDialog.js';
import { findReshareScrollContainer } from '../facebook/findReshareScrollContainer.js';
import { scrollReshares } from '../facebook/scrollReshares.js';
import { parseGraphqlResponse } from '../graphql/parseGraphqlResponse.js';
import { parseReshares } from '../graphql/parseReshares.js';
import { createInitialPaginationState, updatePaginationState } from '../graphql/pagination.js';
import {
  parseCapturedTemplate,
  getSafeTemplateMetadata,
  hashCursor,
} from '../graphql/captureRequestTemplate.js';
import {
  replayPaginationRequest,
  CursorLoopDetector,
} from '../graphql/replayPagination.js';
import { DeduplicationFilter } from '../utils/deduplicate.js';
import { countUniqueSharers } from '../comparison/compareShareSets.js';
import { ReshareNetworkInterceptor } from './requestHandler.js';
import { logger } from '../utils/logger.js';
import {
  DEFAULT_MAX_SCROLL_ATTEMPTS,
  DEFAULT_SCROLL_DELAY_MS,
  DEFAULT_TIMEZONE,
} from '../constants.js';

export interface RunSinglePostScrapeOptions {
  maxSharesPerPost?: number;
  maxScrollAttempts?: number;
  scrollDelayMs?: number;
  timezone?: string;
  maxRunTimeSeconds?: number;
  paginationMode?: 'AUTO' | 'HYBRID' | 'UI_SCROLL';
  capturedTemplate?: any;
}

/**
 * Executes a self-contained, isolated scrape of a single Facebook post
 * under either Anonymous or Authenticated mode.
 */
export async function runSinglePostScrape(
  browser: Browser,
  postUrl: string,
  mode: 'anonymous' | 'authenticated',
  cookies?: PlaywrightCookie[],
  options?: RunSinglePostScrapeOptions
): Promise<ScrapeRunResult> {
  const startedAt = new Date().toISOString();
  const startTimeMs = Date.now();

  const maxShares = options?.maxSharesPerPost ?? 1000;
  const maxScrolls = options?.maxScrollAttempts ?? DEFAULT_MAX_SCROLL_ATTEMPTS;
  const scrollDelay = options?.scrollDelayMs ?? DEFAULT_SCROLL_DELAY_MS;
  const timezone = options?.timezone ?? DEFAULT_TIMEZONE;
  const paginationMode = options?.paginationMode ?? 'AUTO';
  const maxRunTimeSeconds = options?.maxRunTimeSeconds;

  const modePrefix = mode === 'authenticated' ? '[AUTH]' : '[ANON]';
  console.log(`\n================================================================`);
  console.log(`${modePrefix} Starting scrape pass for: ${postUrl}`);
  console.log(`${modePrefix} Mode: ${mode} | Max Shares: ${maxShares} | Timeout: ${maxRunTimeSeconds ?? 'none'}s`);
  console.log(`================================================================\n`);

  const context =
    mode === 'authenticated'
      ? await createAuthenticatedContext(browser, cookies ?? [])
      : await createAnonymousContext(browser);

  let pagesFetched = 0;
  let stopReason = 'HAS_NEXT_PAGE_FALSE';
  const collectedRecords: ShareRecord[] = [];
  const dedupeFilter = new DeduplicationFilter();
  const interceptor = new ReshareNetworkInterceptor();
  let currentTemplate: any = options?.capturedTemplate ?? null;

  const isTimeLimitReached = (): boolean => {
    if (maxRunTimeSeconds && (Date.now() - startTimeMs) >= maxRunTimeSeconds * 1000) {
      stopReason = 'TIMEOUT';
      logger.dialog(`${modePrefix} Reached maxRunTimeSeconds limit (${maxRunTimeSeconds}s). Gracefully stopping.`);
      return true;
    }
    return false;
  };

  try {
    const page = await context.newPage();

    // 1. Verify session
    const sessionState = await verifyFacebookSession(context, mode, page);
    console.log(`${modePrefix} Session verified: ${sessionState.verified} (User ID: ${sessionState.userId ?? 'None'})`);

    // 2. Attach Network Interceptor
    interceptor.attach(page);

    // 3. Open post URL
    await openPost(page, postUrl);

    // In anonymous mode, dismiss login modal if present
    if (mode === 'anonymous') {
      await dismissLoginModal(page);
    }

    if (mode === 'authenticated' && currentTemplate) {
      logger.dialog(`${modePrefix} Replaying with captured template under authenticated session...`);
      // Extract c_user and dtsg from page
      const authEnv = await page.evaluate(() => {
        const cUserMatch = document.cookie.match(/c_user=(\d+)/);
        const cUserId = cUserMatch ? cUserMatch[1] : null;
        let dtsg: string | null = null;
        try {
          const scripts = Array.from(document.querySelectorAll('script'));
          for (const s of scripts) {
            const text = s.textContent || '';
            const match = text.match(/"DTSGInitialData"[^}]*"token":"([^"]+)"/);
            if (match) {
              dtsg = match[1];
              break;
            }
          }
        } catch {}
        return { cUserId, dtsg };
      });

      const authUserId = authEnv.cUserId || (sessionState.userId ? sessionState.userId.replace(/\*/g, '') : null);
      const params = new URLSearchParams(currentTemplate.body);
      if (authUserId) {
        params.set('__user', authUserId);
        params.set('av', authUserId);
      }
      if (authEnv.dtsg) {
        params.set('fb_dtsg', authEnv.dtsg);
      }
      const authTemplate = {
        ...currentTemplate,
        body: params.toString(),
      };

      let currentCursor = (authTemplate.variables?.cursor as string) || '';
      let hasNextPage = true;
      const cursorLoopDetector = new CursorLoopDetector();
      if (currentCursor) cursorLoopDetector.register(currentCursor);

      let directIteration = 0;
      let consecutiveStalls = 0;

      while (
        hasNextPage &&
        collectedRecords.length < maxShares &&
        directIteration < maxScrolls &&
        !isTimeLimitReached()
      ) {
        directIteration++;
        pagesFetched++;

        let replayedRawResponse: string;
        try {
          replayedRawResponse = await replayPaginationRequest(page, authTemplate, currentCursor);
        } catch (replayErr) {
          stopReason = 'GRAPHQL_REPLAY_FAILED';
          break;
        }

        const chunks = parseGraphqlResponse(replayedRawResponse);
        const replayedRecords: ShareRecord[] = [];
        let loopPageInfo: { has_next_page?: boolean; end_cursor?: string | null } | undefined;

        for (const chunk of chunks) {
          const parsed = parseReshares(chunk, postUrl, timezone);
          replayedRecords.push(...parsed.records);
          if (parsed.pageInfo) loopPageInfo = parsed.pageInfo;
        }

        const uniqueRecords = dedupeFilter.filterBatch(replayedRecords);
        for (const r of uniqueRecords) {
          collectedRecords.push(r);
          if (collectedRecords.length >= maxShares) {
            stopReason = 'MAX_SHARES_REACHED';
            break;
          }
        }

        if (uniqueRecords.length === 0) {
          consecutiveStalls++;
          if (consecutiveStalls >= 3) {
            stopReason = 'PAGINATION_STALLED';
            break;
          }
        } else {
          consecutiveStalls = 0;
        }

        hasNextPage = Boolean(loopPageInfo?.has_next_page);
        currentCursor = loopPageInfo?.end_cursor ?? '';

        if (!hasNextPage) {
          stopReason = 'HAS_NEXT_PAGE_FALSE';
          break;
        }

        if (currentCursor) {
          try {
            cursorLoopDetector.register(currentCursor);
          } catch {
            stopReason = 'GRAPHQL_PAGINATION_LOOP_DETECTED';
            break;
          }
        }
      }
    } else {
      // 4. Locate Post Scroll Container and Engagement Trigger
      const { container: postContainer } = await findPostScrollContainer(page);
      const { trigger } = await scrollPostToEngagement(postContainer, page);

    // 5. Open Reshares Dialog
    const reshareDialog = await openResharesDialog(page, trigger);
    const { container: reshareContainer } = await findReshareScrollContainer(reshareDialog);

    // Wait for initial modal render
    await page.waitForTimeout(1500);

    // Parse initial modal dialog query responses
    const dialogBodies = interceptor.getCapturedDialogBodies();
    for (const body of dialogBodies) {
      const chunks = parseGraphqlResponse(body);
      for (const chunk of chunks) {
        const parsed = parseReshares(chunk, postUrl, timezone);
        const unique = dedupeFilter.filterBatch(parsed.records);
        for (const r of unique) {
          collectedRecords.push(r);
          if (collectedRecords.length >= maxShares) {
            stopReason = 'MAX_SHARES_REACHED';
            break;
          }
        }
        if (stopReason === 'MAX_SHARES_REACHED') break;
      }
      if (stopReason === 'MAX_SHARES_REACHED') break;
    }

    if (collectedRecords.length >= maxShares || isTimeLimitReached()) {
      if (collectedRecords.length >= maxShares) stopReason = 'MAX_SHARES_REACHED';
    } else {
      // Reusable UI scroll fallback
      const runUiScrollFallback = async (startAttempt: number) => {
        logger.dialog(`${modePrefix} Running UI scroll fallback (attempts ${startAttempt} to ${maxScrolls})...`);
        let paginationState = createInitialPaginationState();

        for (let attempt = startAttempt; attempt <= maxScrolls; attempt++) {
          if (collectedRecords.length >= maxShares) {
            stopReason = 'MAX_SHARES_REACHED';
            break;
          }
          if (isTimeLimitReached()) break;

          pagesFetched++;
          let rawResponse: string | null = null;
          if (interceptor.hasCapturedPagination()) {
            const pair = await interceptor.waitForPagination(200);
            rawResponse = pair?.responseBody ?? null;
          } else {
            await scrollReshares(reshareContainer, 800);
            await page.keyboard.press('PageDown').catch(() => {});
            const pair = await interceptor.waitForPagination(scrollDelay + 6000);
            rawResponse = pair?.responseBody ?? null;
          }

          if (!rawResponse) {
            paginationState = updatePaginationState(paginationState, undefined, 0, maxShares, maxScrolls);
            if (paginationState.isTerminated) {
              stopReason = paginationState.terminationReason || 'UI_SCROLL_EXHAUSTED';
              break;
            }
            continue;
          }

          const payloadChunks = parseGraphqlResponse(rawResponse);
          for (const chunk of payloadChunks) {
            const parsed = parseReshares(chunk, postUrl, timezone);
            if (parsed.records.length === 0) continue;

            const uniqueRecords = dedupeFilter.filterBatch(parsed.records);
            for (const r of uniqueRecords) {
              collectedRecords.push(r);
              if (collectedRecords.length >= maxShares) {
                stopReason = 'MAX_SHARES_REACHED';
                break;
              }
            }

            paginationState = updatePaginationState(
              paginationState,
              parsed.pageInfo,
              uniqueRecords.length,
              maxShares,
              maxScrolls
            );

            if (isTimeLimitReached() || stopReason === 'MAX_SHARES_REACHED') break;
          }

          if (paginationState.isTerminated) {
            stopReason = paginationState.terminationReason || 'HAS_NEXT_PAGE_FALSE';
            break;
          }

          await page.waitForTimeout(scrollDelay);
        }
      };

      // Pagination phase
      if (paginationMode === 'UI_SCROLL') {
        await runUiScrollFallback(1);
      } else {
        // Trigger initial UI scroll to capture template
        logger.dialog(`${modePrefix} Triggering initial UI scroll to capture pagination template...`);
        await scrollReshares(reshareContainer, 800);
        await page.keyboard.press('PageDown').catch(() => {});

        let initialPair = await interceptor.waitForPagination(
          interceptor.hasCapturedPagination() ? 500 : scrollDelay + 6000
        );

        if (!initialPair) {
          await scrollReshares(reshareContainer, 800);
          await page.keyboard.press('PageDown').catch(() => {});
          initialPair = await interceptor.waitForPagination(scrollDelay + 4000);
        }

        if (!initialPair) {
          if (paginationMode === 'AUTO') {
            logger.dialog(`${modePrefix} Initial pagination query not detected. Falling back to UI scroll.`);
            await runUiScrollFallback(1);
          } else {
            stopReason = 'GRAPHQL_RESPONSE_NOT_FOUND';
          }
        } else {
          pagesFetched++;
          const template = parseCapturedTemplate(initialPair.postData);
          currentTemplate = template;
          const safeMeta = getSafeTemplateMetadata(template);
          logger.dialog(`${modePrefix} Captured template: ${safeMeta.friendlyName} (cursorHash: ${safeMeta.cursorHash})`);

          // Parse Page 1 response
          const initialChunks = parseGraphqlResponse(initialPair.responseBody);
          let initialPageInfo: { has_next_page?: boolean; end_cursor?: string | null } | undefined;

          for (const chunk of initialChunks) {
            const parsed = parseReshares(chunk, postUrl, timezone);
            const unique = dedupeFilter.filterBatch(parsed.records);
            for (const r of unique) {
              collectedRecords.push(r);
              if (collectedRecords.length >= maxShares) {
                stopReason = 'MAX_SHARES_REACHED';
                break;
              }
            }
            if (parsed.pageInfo) initialPageInfo = parsed.pageInfo;
            if (stopReason === 'MAX_SHARES_REACHED') break;
          }

          let hasNextPage = Boolean(initialPageInfo?.has_next_page);
          let currentCursor = initialPageInfo?.end_cursor ?? null;

          if (!hasNextPage) {
            stopReason = 'HAS_NEXT_PAGE_FALSE';
          }

          if (hasNextPage && currentCursor && collectedRecords.length < maxShares && !isTimeLimitReached()) {
            const cursorLoopDetector = new CursorLoopDetector();
            if (template.variables.cursor && typeof template.variables.cursor === 'string') {
              cursorLoopDetector.register(template.variables.cursor);
            }
            cursorLoopDetector.register(currentCursor);

            let directIteration = 1;
            let consecutiveStalls = 0;

            while (
              hasNextPage &&
              currentCursor &&
              collectedRecords.length < maxShares &&
              directIteration < maxScrolls &&
              !isTimeLimitReached()
            ) {
              directIteration++;
              pagesFetched++;

              let replayedRawResponse: string;
              try {
                replayedRawResponse = await replayPaginationRequest(page, template, currentCursor);
              } catch (replayErr) {
                if (paginationMode === 'AUTO') {
                  logger.dialog(`${modePrefix} Direct replay failed: ${(replayErr as Error).message}. Falling back to UI scroll.`);
                  await runUiScrollFallback(directIteration);
                  break;
                } else {
                  stopReason = 'GRAPHQL_REPLAY_FAILED';
                  break;
                }
              }

              const chunks = parseGraphqlResponse(replayedRawResponse);
              const replayedRecords: ShareRecord[] = [];
              let loopPageInfo: { has_next_page?: boolean; end_cursor?: string | null } | undefined;

              for (const chunk of chunks) {
                const parsed = parseReshares(chunk, postUrl, timezone);
                replayedRecords.push(...parsed.records);
                if (parsed.pageInfo) loopPageInfo = parsed.pageInfo;
              }

              const uniqueRecords = dedupeFilter.filterBatch(replayedRecords);
              for (const r of uniqueRecords) {
                collectedRecords.push(r);
                if (collectedRecords.length >= maxShares) {
                  stopReason = 'MAX_SHARES_REACHED';
                  break;
                }
              }

              if (uniqueRecords.length === 0) {
                consecutiveStalls++;
                if (consecutiveStalls >= 3) {
                  stopReason = 'PAGINATION_STALLED';
                  break;
                }
              } else {
                consecutiveStalls = 0;
              }

              hasNextPage = Boolean(loopPageInfo?.has_next_page);
              currentCursor = loopPageInfo?.end_cursor ?? null;

              if (!hasNextPage) {
                stopReason = 'HAS_NEXT_PAGE_FALSE';
                break;
              }

              if (currentCursor) {
                try {
                  cursorLoopDetector.register(currentCursor);
                } catch {
                  stopReason = 'GRAPHQL_PAGINATION_LOOP_DETECTED';
                  break;
                }
              }
            }
          }
        }
      }
    }
  }

  const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTimeMs;

    return {
      mode,
      postUrl,
      records: collectedRecords,
      uniqueSharerCount: countUniqueSharers(collectedRecords),
      pagesFetched,
      graphqlOperationNames: interceptor.getObservedOperationNames(),
      stopReason,
      startedAt,
      completedAt,
      durationMs,
      sessionState,
      template: currentTemplate,
    };
  } catch (err) {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTimeMs;

    let finalStopReason = 'FAILED';
    if (err instanceof ScraperError) {
      finalStopReason = err.code;
    }

    console.error(`${modePrefix} Scrape failed: ${(err as Error).message}`);

    return {
      mode,
      postUrl,
      records: collectedRecords,
      uniqueSharerCount: countUniqueSharers(collectedRecords),
      pagesFetched,
      graphqlOperationNames: interceptor.getObservedOperationNames(),
      stopReason: finalStopReason,
      startedAt,
      completedAt,
      durationMs,
      sessionState: {
        mode,
        verified: false,
        userId: null,
        evidence: [(err as Error).message],
      },
    };
  } finally {
    await context.close().catch(() => {});
  }
}
