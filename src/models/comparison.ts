import { ShareRecord } from './shareRecord.js';

/**
 * Execution modes supported by comparison framework.
 */
export type ComparisonMode = 'anonymous' | 'authenticated' | 'compare';

/**
 * Playwright cookie format contract.
 */
export interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * Result of session verification for either mode.
 */
export interface FacebookSessionState {
  mode: 'anonymous' | 'authenticated';
  verified: boolean;
  userId?: string | null; // Masked / redacted ID, e.g. '****1234'
  evidence: string[];
}

/**
 * Result of a single scraping execution pass (Anonymous or Authenticated).
 */
export interface ScrapeRunResult {
  mode: 'anonymous' | 'authenticated';
  postUrl: string;
  records: ShareRecord[];
  uniqueSharerCount: number;
  pagesFetched: number;
  graphqlOperationNames: string[];
  stopReason: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  sessionState: FacebookSessionState;
}

/**
 * Structured comparison report comparing Anonymous and Authenticated scraping results.
 */
export interface ComparisonReport {
  postUrl: string;

  anonymous: {
    recordCount: number;
    uniqueSharerCount: number;
    pagesFetched: number;
    stopReason: string;
    graphqlOperationNames: string[];
    startedAt: string;
    completedAt: string;
  };

  authenticated: {
    recordCount: number;
    uniqueSharerCount: number;
    pagesFetched: number;
    stopReason: string;
    graphqlOperationNames: string[];
    startedAt: string;
    completedAt: string;
  };

  overlapCount: number;
  anonymousOnlyCount: number;
  authenticatedOnlyCount: number;

  unionCount: number;
  jaccardSimilarity: number;

  anonymousOnly: ShareRecord[];
  authenticatedOnly: ShareRecord[];

  generatedAt: string;
}

/**
 * Flattened row representation for CSV export of differences.
 */
export interface ComparisonDiffRow {
  classification: 'COMMON' | 'ANON_ONLY' | 'AUTH_ONLY';
  shareStoryId: string | null;
  sharePostId: string | null;
  sharerId: string | null;
  sharerName: string;
  sharedAtUnix: number;
  sharedAtIso: string;
  shareUrl: string | null;
}
