import { ShareRecord } from '../models/shareRecord.js';
import { formatUnixToIso, formatUnixToLocal } from '../utils/timestamp.js';
import { CometResharesResponse, RawActor, RawPageInfo, RawReshareEdge } from './types.js';

export interface ParseResharesResult {
  records: ShareRecord[];
  pageInfo?: RawPageInfo;
  feedbackId?: string | null;
}

/**
 * Pure parsing function to extract ShareRecords from a CometResharesFeedPaginationQuery response.
 *
 * CRITICAL ARCHITECTURAL CONTRACT:
 * - Canonical share timestamp is ALWAYS extracted from edge.node.creation_time.
 * - edge.node.attached_story.creation_time represents the original post's publication time
 *   and MUST BE EXPLICITLY REJECTED as the share time.
 */
export function parseReshares(
  payload: unknown,
  originalPostUrl: string,
  timezone: string = 'Asia/Ho_Chi_Minh'
): ParseResharesResult {
  const result: ParseResharesResult = {
    records: [],
  };

  if (!payload || typeof payload !== 'object') {
    return result;
  }

  const typedPayload = payload as CometResharesResponse;
  const node = typedPayload.data?.node ?? typedPayload.data?.feedback;
  if (!node) {
    return result;
  }

  const feedbackId = node.id ?? null;
  result.feedbackId = feedbackId;

  const resharesConn = node.reshares;
  if (!resharesConn) {
    return result;
  }

  if (resharesConn.page_info) {
    result.pageInfo = {
      end_cursor: resharesConn.page_info.end_cursor ?? null,
      has_next_page: Boolean(resharesConn.page_info.has_next_page),
      start_cursor: resharesConn.page_info.start_cursor ?? null,
      has_previous_page: Boolean(resharesConn.page_info.has_previous_page),
    };
  }

  const edges = resharesConn.edges;
  if (!Array.isArray(edges)) {
    return result;
  }

  const scrapedAt = new Date().toISOString();

  for (const edge of edges) {
    const shareRecord = extractSingleShareRecord(edge, originalPostUrl, feedbackId, timezone, scrapedAt);
    if (shareRecord) {
      result.records.push(shareRecord);
    }
  }

  return result;
}

/**
 * Extracts and validates a single ShareRecord from a GraphQL edge.
 */
function extractSingleShareRecord(
  edge: RawReshareEdge,
  originalPostUrl: string,
  feedbackId: string | null,
  timezone: string,
  scrapedAt: string
): ShareRecord | null {
  const node = edge?.node;
  if (!node || typeof node !== 'object') {
    return null;
  }

  // 1. CANONICAL TIMESTAMP EXTRACTION
  // Must come from outer node.creation_time.
  // NEVER from attached_story.creation_time!
  const sharedAtUnix = node.creation_time;
  if (typeof sharedAtUnix !== 'number' || isNaN(sharedAtUnix) || sharedAtUnix <= 0) {
    // Missing or invalid canonical creation_time
    return null;
  }

  // 2. ACTOR EXTRACTION (with resilient fallbacks)
  const anyNode = node as Record<string, unknown>;
  const storyObj = (anyNode.story as Record<string, unknown> | undefined);
  const actor =
    node.comet_sections?.context_layout?.story?.actors?.[0] ||
    (Array.isArray(anyNode.actors) ? (anyNode.actors[0] as RawActor) : undefined) ||
    (Array.isArray(storyObj?.actors) ? (storyObj?.actors[0] as RawActor) : undefined);

  const sharerId = actor?.id ?? null;
  const sharerName = actor?.name ?? null;
  let sharerProfileUrl = actor?.profile_url ?? null;
  if (!sharerProfileUrl && sharerId) {
    sharerProfileUrl = `https://www.facebook.com/${sharerId}`;
  }

  // 3. STORY IDENTIFIERS & PERMALINK
  const shareStoryId = node.id ?? (storyObj?.id as string | undefined) ?? null;
  const sharePostId = node.post_id ?? (storyObj?.post_id as string | undefined) ?? null;
  const shareUrl = node.permalink_url ?? (anyNode.url as string | undefined) ?? (anyNode.share_url as string | undefined) ?? null;

  // 4. PRIVACY SCOPE
  const visibility =
    node.privacy_scope?.description ??
    ((storyObj?.privacy_scope as Record<string, unknown> | undefined)?.description as string | undefined) ??
    null;

  return {
    originalPostUrl,
    feedbackId,
    sharerId,
    sharerName,
    sharerProfileUrl,
    shareStoryId,
    sharePostId,
    shareUrl,
    sharedAtUnix,
    sharedAtIso: formatUnixToIso(sharedAtUnix),
    sharedAtLocal: formatUnixToLocal(sharedAtUnix, timezone),
    visibility,
    scrapedAt,
  };
}
