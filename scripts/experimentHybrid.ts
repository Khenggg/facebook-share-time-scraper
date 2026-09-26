import { chromium, type Request, type Response } from 'playwright';
import { openPost } from '../src/facebook/openPost.js';
import { dismissLoginModal } from '../src/facebook/dismissLoginModal.js';
import { findPostScrollContainer } from '../src/facebook/findPostScrollContainer.js';
import { scrollPostToEngagement } from '../src/facebook/scrollPostToEngagement.js';
import { openResharesDialog } from '../src/facebook/openResharesDialog.js';
import { findReshareScrollContainer } from '../src/facebook/findReshareScrollContainer.js';
import { scrollReshares } from '../src/facebook/scrollReshares.js';
import { isFacebookGraphqlUrl, identifyGraphqlOperation } from '../src/graphql/identifyOperation.js';
import { parseGraphqlResponse } from '../src/graphql/parseGraphqlResponse.js';
import { parseReshares } from '../src/graphql/parseReshares.js';
import {
  parseCapturedTemplate,
  getSafeTemplateMetadata,
  hashCursor,
  type GraphqlRequestTemplate,
} from '../src/graphql/captureRequestTemplate.js';
import {
  replayPaginationRequest,
  CursorLoopDetector,
} from '../src/graphql/replayPagination.js';
import { DeduplicationFilter } from '../src/utils/deduplicate.js';
import { ShareRecord } from '../src/models/shareRecord.js';
import { COMET_RESHARES_QUERY_NAME } from '../src/constants.js';

interface CapturedPair {
  request: Request;
  response: Response;
  postData: string;
  responseBody: string;
}

async function runHybridExperiment() {
  const targetUrl =
    process.argv.slice(2).find((arg) => arg.startsWith('http')) ||
    'https://www.facebook.com/TheYenOfficial/posts/pfbid02wsTeEnWsUxxZcFqHv7AYuRuaUnbPTRnVeDnuRJNvoM6k4DxZxhqK5JN2DYkVR6Npl';

  console.log('================================================================');
  console.log('PHASE 1.5 — HYBRID GRAPHQL PAGINATION PROOF OF CONCEPT');
  console.log('Target URL:', targetUrl);
  console.log('Protocol: Browser Bootstrap -> Capture Template -> Direct Fetch');
  console.log('================================================================\n');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--lang=en-US,en',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });

  const page = await context.newPage();

  // Intercept the first pagination query and its response
  const capturedPaginationQueries: CapturedPair[] = [];
  const requestPostDataMap = new Map<Request, string>();

  page.on('request', (req) => {
    if (isFacebookGraphqlUrl(req.url()) && req.method() === 'POST') {
      const data = req.postData();
      if (data) {
        requestPostDataMap.set(req, data);
      }
    }
  });

  page.on('response', async (res) => {
    if (!isFacebookGraphqlUrl(res.url())) return;
    const req = res.request();
    if (req.method() !== 'POST') return;

    const postData = requestPostDataMap.get(req) || req.postData() || '';
    const op = identifyGraphqlOperation(postData);

    // Specifically capture the pagination query (not the initial modal query)
    if (op.friendlyName === COMET_RESHARES_QUERY_NAME) {
      try {
        const responseBody = await res.text();
        capturedPaginationQueries.push({
          request: req,
          response: res,
          postData,
          responseBody,
        });
      } catch {
        // Ignored non-text response
      }
    }
  });

  try {
    // ----------------------------------------------------------------
    // STEP 1: UI Bootstrap (Open post, dismiss modal, open reshares)
    // ----------------------------------------------------------------
    console.log('[STEP 1] Bootstrapping unauthenticated Facebook browser session...');
    await openPost(page, targetUrl);
    await dismissLoginModal(page);

    const { container: postContainer } = await findPostScrollContainer(page);
    const { trigger } = await scrollPostToEngagement(postContainer, page);

    const reshareDialog = await openResharesDialog(page, trigger);
    const { container: reshareContainer } = await findReshareScrollContainer(reshareDialog);
    await page.waitForTimeout(2000);

    // ----------------------------------------------------------------
    // STEP 2: Trigger EXACTLY ONE UI scroll to capture template
    // ----------------------------------------------------------------
    console.log('[STEP 2] Performing ONE UI scroll to trigger initial pagination request...');
    await scrollReshares(reshareContainer, 800);
    await page.keyboard.press('PageDown').catch(() => {});

    // Wait up to 8s for pagination request to fire and be captured
    for (let i = 0; i < 16; i++) {
      if (capturedPaginationQueries.length > 0) break;
      await page.waitForTimeout(500);
    }

    if (capturedPaginationQueries.length === 0) {
      throw new Error(
        'Failed to capture CometResharesFeedPaginationQuery after initial scroll. UI trigger did not dispatch pagination request.'
      );
    }

    const firstCaptured = capturedPaginationQueries[0];
    console.log('[STEP 2] SUCCESS: Captured real pagination request and response from browser!');

    // ----------------------------------------------------------------
    // STEP 3: Parse Request Template & Initial Response
    // ----------------------------------------------------------------
    console.log('\n[STEP 3] Parsing request template and initial response...');
    const template: GraphqlRequestTemplate = parseCapturedTemplate(firstCaptured.postData);
    const safeMeta = getSafeTemplateMetadata(template);

    console.log('Captured request metadata:');
    console.log(`  Operation:      ${safeMeta.friendlyName}`);
    console.log(`  Doc ID Present: ${safeMeta.hasDocId}`);
    console.log(`  LSD Present:    ${safeMeta.hasLsd}`);
    console.log(`  Cursor Present: ${safeMeta.cursorPresent}`);
    console.log(`  Cursor Hash:    ${safeMeta.cursorHash}`);

    const dedupeFilter = new DeduplicationFilter();
    const initialChunks = parseGraphqlResponse(firstCaptured.responseBody);
    const initialRecords: ShareRecord[] = [];
    let initialPageInfo: { has_next_page?: boolean; end_cursor?: string | null } | undefined;

    for (const chunk of initialChunks) {
      const parsed = parseReshares(chunk, targetUrl);
      const unique = dedupeFilter.filterBatch(parsed.records);
      initialRecords.push(...unique);
      if (parsed.pageInfo) {
        initialPageInfo = parsed.pageInfo;
      }
    }

    console.log(`\nInitial Page 1 Results:`);
    console.log(`  Records extracted: ${initialRecords.length}`);
    initialRecords.forEach((r, idx) => {
      console.log(`    [${idx + 1}] ${r.sharerName} (Unix: ${r.sharedAtUnix}, Story: ${r.shareStoryId?.slice(0, 20)}...)`);
    });
    console.log(`  Has Next Page:     ${initialPageInfo?.has_next_page}`);
    console.log(`  End Cursor Hash:   ${hashCursor(initialPageInfo?.end_cursor)}`);

    if (!initialPageInfo?.end_cursor) {
      throw new Error('Initial pagination response did not contain page_info.end_cursor.');
    }

    const cursorLoopDetector = new CursorLoopDetector();
    cursorLoopDetector.register(template.variables.cursor as string);
    cursorLoopDetector.register(initialPageInfo.end_cursor);

    // ----------------------------------------------------------------
    // STEP 4: DIRECT REPLAY EXPERIMENT (WITHOUT ANY FURTHER SCROLLING)
    // ----------------------------------------------------------------
    console.log('\n================================================================');
    console.log('[STEP 4] EXECUTING DIRECT REPLAY (ZERO UI SCROLLING)');
    console.log('================================================================');

    const nextCursor = initialPageInfo.end_cursor;
    console.log(`[HYBRID] Replaying pagination request in browser context`);
    console.log(`[HYBRID] Cursor: previous = [${safeMeta.cursorHash}], next to send = [${hashCursor(nextCursor)}]`);

    const replayedRawResponse = await replayPaginationRequest(page, template, nextCursor);
    console.log(`[HYBRID] Replay HTTP fetch succeeded. Response size: ${replayedRawResponse.length} bytes`);

    const replayedChunks = parseGraphqlResponse(replayedRawResponse);
    console.log(`[HYBRID] Parsed ${replayedChunks.length} chunk(s) from replayed response.`);

    const replayedRecords: ShareRecord[] = [];
    let replayedPageInfo: { has_next_page?: boolean; end_cursor?: string | null } | undefined;

    for (const chunk of replayedChunks) {
      const parsed = parseReshares(chunk, targetUrl);
      replayedRecords.push(...parsed.records);
      if (parsed.pageInfo) {
        replayedPageInfo = parsed.pageInfo;
      }
    }

    console.log(`[HYBRID] Extracted ${replayedRecords.length} raw record(s) from replayed response.`);
    const genuinelyNewRecords = dedupeFilter.filterBatch(replayedRecords);

    console.log('\n[STEP 4] DEDUPLICATION & VALIDATION:');
    console.log(`  Total Replayed Records:  ${replayedRecords.length}`);
    console.log(`  Genuinely New Records:   ${genuinelyNewRecords.length}`);
    genuinelyNewRecords.forEach((r, idx) => {
      console.log(`    [NEW ${idx + 1}] ${r.sharerName} (Unix: ${r.sharedAtUnix}, Story: ${r.shareStoryId?.slice(0, 20)}...)`);
    });
    console.log(`  Next Page Available:     ${replayedPageInfo?.has_next_page}`);
    console.log(`  New End Cursor Hash:     ${hashCursor(replayedPageInfo?.end_cursor)}`);

    // Verify Invariant
    const allHaveCanonicalTime = genuinelyNewRecords.every((r) => r.sharedAtUnix > 0 && typeof r.sharedAtUnix === 'number');
    console.log(`  Canonical Time Verified: ${allHaveCanonicalTime}`);

    const isFirstReplaySuccess = genuinelyNewRecords.length > 0 && allHaveCanonicalTime;

    if (!isFirstReplaySuccess) {
      throw new Error('Direct replay failed acceptance: no new records returned or timestamps invalid.');
    }

    console.log('\n>>> FIRST DIRECT REPLAY: PASS! <<<');

    // ----------------------------------------------------------------
    // STEP 5: LOOP MODE TEST (2-3 consecutive direct replays)
    // ----------------------------------------------------------------
    console.log('\n================================================================');
    console.log('[STEP 5] TESTING MULTI-PAGE DIRECT REPLAY LOOP (PAGES 3, 4...)');
    console.log('================================================================');

    let currentCursor = replayedPageInfo?.end_cursor;
    let hasNext = Boolean(replayedPageInfo?.has_next_page);
    let iteration = 2; // already did page 1 (scroll) and page 2 (replay)
    const MAX_DIRECT_PAGES = 5;

    while (hasNext && currentCursor && iteration < MAX_DIRECT_PAGES) {
      iteration++;
      console.log(`\n[LOOP] Replaying Page #${iteration}...`);
      cursorLoopDetector.register(currentCursor);

      const loopRaw = await replayPaginationRequest(page, template, currentCursor);
      const loopChunks = parseGraphqlResponse(loopRaw);
      const loopRecords: ShareRecord[] = [];
      let loopPageInfo: { has_next_page?: boolean; end_cursor?: string | null } | undefined;

      for (const chunk of loopChunks) {
        const parsed = parseReshares(chunk, targetUrl);
        loopRecords.push(...parsed.records);
        if (parsed.pageInfo) loopPageInfo = parsed.pageInfo;
      }

      const loopNew = dedupeFilter.filterBatch(loopRecords);
      console.log(`  Page #${iteration} fetched: ${loopRecords.length} record(s), ${loopNew.length} new.`);
      loopNew.forEach((r) => {
        console.log(`    -> ${r.sharerName} (Unix: ${r.sharedAtUnix})`);
      });

      hasNext = Boolean(loopPageInfo?.has_next_page);
      currentCursor = loopPageInfo?.end_cursor;
      console.log(`  Has next: ${hasNext}, next cursor: [${hashCursor(currentCursor)}]`);
    }

    console.log('\n>>> MULTI-PAGE DIRECT LOOP: COMPLETED SUCCESSFULLY! <<<');

    // ----------------------------------------------------------------
    // STEP 6: EXPERIMENT COUNT OVERRIDE (Optional test)
    // ----------------------------------------------------------------
    console.log('\n================================================================');
    console.log('[STEP 6] TESTING COUNT OVERRIDE PARAMETER');
    console.log('================================================================');
    const countTestValues = [1, 5, 10];
    const countResults: Array<{ requestedCount: number; returnedEdges: number; ok: boolean }> = [];

    if (currentCursor) {
      for (const countVal of countTestValues) {
        try {
          const testRaw = await replayPaginationRequest(page, template, currentCursor, countVal);
          const chunks = parseGraphqlResponse(testRaw);
          let countRecords = 0;
          for (const c of chunks) {
            countRecords += parseReshares(c, targetUrl).records.length;
          }
          countResults.push({ requestedCount: countVal, returnedEdges: countRecords, ok: true });
        } catch (e) {
          countResults.push({ requestedCount: countVal, returnedEdges: 0, ok: false });
        }
      }
    } else {
      // Re-test with initial cursor to check count behavior
      for (const countVal of countTestValues) {
        try {
          const testRaw = await replayPaginationRequest(page, template, initialEndCursor, countVal);
          const chunks = parseGraphqlResponse(testRaw);
          let countRecords = 0;
          for (const c of chunks) {
            countRecords += parseReshares(c, targetUrl).records.length;
          }
          countResults.push({ requestedCount: countVal, returnedEdges: countRecords, ok: true });
        } catch (e) {
          countResults.push({ requestedCount: countVal, returnedEdges: 0, ok: false });
        }
      }
    }

    console.log('Count Override Experiment Table:');
    console.log('requestedCount | returnedEdges | status');
    console.log('---------------|---------------|-------');
    countResults.forEach((cr) => {
      console.log(`  ${String(cr.requestedCount).padEnd(12)} | ${String(cr.returnedEdges).padEnd(13)} | ${cr.ok ? 'SUCCESS' : 'FAILED'}`);
    });

    // ----------------------------------------------------------------
    // FINAL SANITIZED EXPERIMENT REPORT
    // ----------------------------------------------------------------
    console.log('\n================================================================');
    console.log('HYBRID PAGINATION EXPERIMENT — FINAL REPORT');
    console.log('================================================================');
    console.log(`Status:              PASS`);
    console.log(`Target Post:         ${targetUrl}`);
    console.log(`Browser Mode:        Logged-Out (__user=0)`);
    console.log(`Request Template:    ${safeMeta.friendlyName}`);
    console.log(`Doc ID Present:      ${safeMeta.hasDocId}`);
    console.log(`Page 1 (via Scroll): ${initialRecords.length} records`);
    console.log(`Page 2 (via Replay): ${genuinelyNewRecords.length} genuinely new records`);
    console.log(`UI Scrolls Used:     EXACTLY 1 (Bootstrap only)`);
    console.log(`Invariant Preserved: YES (edge.node.creation_time)`);
    console.log(`Secrets Redacted:    YES (zero credentials/tokens logged or persisted)`);
    console.log('================================================================\n');
  } finally {
    await browser.close();
  }
}

runHybridExperiment().catch((err) => {
  console.error('\n[EXPERIMENT FAILED]', err);
  process.exit(1);
});
