import { ShareRecord } from '../models/shareRecord.js';
import {
  ComparisonReport,
  ComparisonDiffRow,
  ScrapeRunResult,
} from '../models/comparison.js';

/**
 * Extracts a deterministic, unique identity for a ShareRecord.
 * Priority:
 *   1. shareStoryId (Relay node/story GraphQL ID)
 *   2. sharePostId (Outer reshare post ID)
 *   3. shareUrl (Outer reshare permalink URL)
 *   4. Fallback: Compound key of sharerId/name + sharedAtUnix + shareUrl
 */
export function getShareIdentity(record: ShareRecord): string {
  if (record.shareStoryId && record.shareStoryId.trim() !== '') {
    return `story:${record.shareStoryId.trim()}`;
  }

  if (record.sharePostId && record.sharePostId.trim() !== '') {
    return `post:${record.sharePostId.trim()}`;
  }

  if (record.shareUrl && record.shareUrl.trim() !== '') {
    return `url:${record.shareUrl.trim().toLowerCase()}`;
  }

  const sharerKey = record.sharerId?.trim() || (record.sharerName || '').trim().toLowerCase();
  return `compound:${sharerKey}_${record.sharedAtUnix}_${record.shareUrl || ''}`;
}

/**
 * Extracts a unique identity for the sharer (user or page).
 * Priority:
 *   1. sharerId
 *   2. Normalized sharerProfileUrl
 *   3. Fallback: sharerName
 */
export function getSharerIdentity(record: ShareRecord): string {
  if (record.sharerId && record.sharerId.trim() !== '') {
    return `id:${record.sharerId.trim()}`;
  }

  if (record.sharerProfileUrl && record.sharerProfileUrl.trim() !== '') {
    try {
      const parsed = new URL(record.sharerProfileUrl);
      const cleanUrl = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '').toLowerCase();
      return `profile:${cleanUrl}`;
    } catch {
      return `profile:${record.sharerProfileUrl.trim().toLowerCase()}`;
    }
  }

  return `name:${(record.sharerName || '').trim().toLowerCase()}`;
}

/**
 * Counts the number of distinct sharers in a list of ShareRecords.
 */
export function countUniqueSharers(records: ShareRecord[]): number {
  const seen = new Set<string>();
  for (const record of records) {
    seen.add(getSharerIdentity(record));
  }
  return seen.size;
}

export interface SetComparisonResult {
  overlap: ShareRecord[];
  anonymousOnly: ShareRecord[];
  authenticatedOnly: ShareRecord[];
  unionCount: number;
  jaccardSimilarity: number;
  anonUniqueSharerCount: number;
  authUniqueSharerCount: number;
}

/**
 * Compares two sets of ShareRecords (Anonymous vs Authenticated).
 */
export function compareShareSets(
  anonRecords: ShareRecord[],
  authRecords: ShareRecord[]
): SetComparisonResult {
  // Deduplicate each input set first by canonical share identity
  const anonMap = new Map<string, ShareRecord>();
  for (const rec of anonRecords) {
    const key = getShareIdentity(rec);
    if (!anonMap.has(key)) {
      anonMap.set(key, rec);
    }
  }

  const authMap = new Map<string, ShareRecord>();
  for (const rec of authRecords) {
    const key = getShareIdentity(rec);
    if (!authMap.has(key)) {
      authMap.set(key, rec);
    }
  }

  const overlap: ShareRecord[] = [];
  const anonymousOnly: ShareRecord[] = [];
  const authenticatedOnly: ShareRecord[] = [];

  for (const [key, record] of anonMap.entries()) {
    if (authMap.has(key)) {
      overlap.push(record);
    } else {
      anonymousOnly.push(record);
    }
  }

  for (const [key, record] of authMap.entries()) {
    if (!anonMap.has(key)) {
      authenticatedOnly.push(record);
    }
  }

  const unionCount = anonMap.size + authMap.size - overlap.length;
  const jaccardSimilarity = unionCount === 0 ? 1.0 : overlap.length / unionCount;

  return {
    overlap,
    anonymousOnly,
    authenticatedOnly,
    unionCount,
    jaccardSimilarity,
    anonUniqueSharerCount: countUniqueSharers(Array.from(anonMap.values())),
    authUniqueSharerCount: countUniqueSharers(Array.from(authMap.values())),
  };
}

/**
 * Builds the comprehensive ComparisonReport.
 */
export function generateComparisonReport(
  postUrl: string,
  anonResult: ScrapeRunResult,
  authResult: ScrapeRunResult
): ComparisonReport {
  const comparison = compareShareSets(anonResult.records, authResult.records);

  return {
    postUrl,
    anonymous: {
      recordCount: anonResult.records.length,
      uniqueSharerCount: comparison.anonUniqueSharerCount,
      pagesFetched: anonResult.pagesFetched,
      stopReason: anonResult.stopReason,
      graphqlOperationNames: anonResult.graphqlOperationNames,
      startedAt: anonResult.startedAt,
      completedAt: anonResult.completedAt,
    },
    authenticated: {
      recordCount: authResult.records.length,
      uniqueSharerCount: comparison.authUniqueSharerCount,
      pagesFetched: authResult.pagesFetched,
      stopReason: authResult.stopReason,
      graphqlOperationNames: authResult.graphqlOperationNames,
      startedAt: authResult.startedAt,
      completedAt: authResult.completedAt,
    },
    overlapCount: comparison.overlap.length,
    anonymousOnlyCount: comparison.anonymousOnly.length,
    authenticatedOnlyCount: comparison.authenticatedOnly.length,
    unionCount: comparison.unionCount,
    jaccardSimilarity: Number(comparison.jaccardSimilarity.toFixed(4)),
    anonymousOnly: comparison.anonymousOnly,
    authenticatedOnly: comparison.authenticatedOnly,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Builds rows for CSV export of differences.
 */
export function generateComparisonDiffRows(
  anonRecords: ShareRecord[],
  authRecords: ShareRecord[]
): ComparisonDiffRow[] {
  const comparison = compareShareSets(anonRecords, authRecords);
  const rows: ComparisonDiffRow[] = [];

  const toRow = (
    record: ShareRecord,
    classification: 'COMMON' | 'ANON_ONLY' | 'AUTH_ONLY'
  ): ComparisonDiffRow => ({
    classification,
    shareStoryId: record.shareStoryId ?? null,
    sharePostId: record.sharePostId ?? null,
    sharerId: record.sharerId ?? null,
    sharerName: record.sharerName ?? 'Unknown',
    sharedAtUnix: record.sharedAtUnix,
    sharedAtIso: record.sharedAtIso,
    shareUrl: record.shareUrl ?? null,
  });

  for (const r of comparison.overlap) {
    rows.push(toRow(r, 'COMMON'));
  }

  for (const r of comparison.anonymousOnly) {
    rows.push(toRow(r, 'ANON_ONLY'));
  }

  for (const r of comparison.authenticatedOnly) {
    rows.push(toRow(r, 'AUTH_ONLY'));
  }

  return rows;
}

/**
 * Converts comparison diff rows into standard CSV text.
 */
export function formatComparisonDiffCsv(rows: ComparisonDiffRow[]): string {
  const headers = [
    'classification',
    'shareStoryId',
    'sharePostId',
    'sharerId',
    'sharerName',
    'sharedAtUnix',
    'sharedAtIso',
    'shareUrl',
  ];

  const escapeCsv = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.classification,
        escapeCsv(row.shareStoryId),
        escapeCsv(row.sharePostId),
        escapeCsv(row.sharerId),
        escapeCsv(row.sharerName),
        row.sharedAtUnix,
        escapeCsv(row.sharedAtIso),
        escapeCsv(row.shareUrl),
      ].join(',')
    );
  }

  return lines.join('\n');
}
