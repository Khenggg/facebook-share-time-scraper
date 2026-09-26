import { MAX_CONSECUTIVE_STALLED_SCROLLS } from '../constants.js';
import { PaginationState, RawPageInfo } from './types.js';

/**
 * Creates initial pagination state.
 */
export function createInitialPaginationState(): PaginationState {
  return {
    endCursor: null,
    hasNextPage: true,
    totalCollected: 0,
    scrollAttempts: 0,
    stalledAttempts: 0,
    isTerminated: false,
    terminationReason: null,
  };
}

/**
 * Updates pagination state after processing a page/response.
 */
export function updatePaginationState(
  state: PaginationState,
  pageInfo: RawPageInfo | undefined,
  newRecordsAdded: number,
  maxShares: number,
  maxScrolls: number
): PaginationState {
  state.scrollAttempts += 1;
  state.totalCollected += newRecordsAdded;

  if (pageInfo) {
    state.endCursor = pageInfo.end_cursor ?? state.endCursor;
    state.hasNextPage = Boolean(pageInfo.has_next_page);
  }

  if (newRecordsAdded === 0) {
    state.stalledAttempts += 1;
  } else {
    state.stalledAttempts = 0;
  }

  // Evaluate termination conditions
  if (state.totalCollected >= maxShares) {
    state.isTerminated = true;
    state.terminationReason = `MAX_SHARES_REACHED (${state.totalCollected}/${maxShares})`;
  } else if (!state.hasNextPage) {
    state.isTerminated = true;
    state.terminationReason = 'NO_MORE_PAGES (has_next_page=false)';
  } else if (state.scrollAttempts >= maxScrolls) {
    state.isTerminated = true;
    state.terminationReason = `MAX_SCROLLS_REACHED (${state.scrollAttempts}/${maxScrolls})`;
  } else if (state.stalledAttempts >= MAX_CONSECUTIVE_STALLED_SCROLLS) {
    state.isTerminated = true;
    state.terminationReason = `PAGINATION_STALLED (${state.stalledAttempts} consecutive scrolls with 0 new records)`;
  }

  return state;
}
