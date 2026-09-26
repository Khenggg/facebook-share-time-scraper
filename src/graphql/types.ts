/**
 * Types and interfaces representing Facebook GraphQL structures and pagination state.
 */

export interface RawActor {
  __typename?: string;
  id?: string;
  name?: string;
  profile_url?: string;
}

export interface RawAttachedStory {
  __typename?: string;
  post_id?: string;
  creation_time?: number;
  [key: string]: unknown;
}

export interface RawReshareNode {
  __typename?: string;
  id?: string;
  post_id?: string;
  creation_time: number;
  permalink_url?: string;
  comet_sections?: {
    context_layout?: {
      story?: {
        actors?: RawActor[];
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  attached_story?: RawAttachedStory | null;
  privacy_scope?: {
    description?: string;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

export interface RawReshareEdge {
  cursor?: string;
  node: RawReshareNode;
}

export interface RawPageInfo {
  end_cursor?: string | null;
  has_next_page?: boolean;
  start_cursor?: string | null;
  has_previous_page?: boolean;
}

export interface RawResharesConnection {
  edges?: RawReshareEdge[];
  page_info?: RawPageInfo;
  count?: number;
}

export interface RawFeedbackNode {
  __typename?: string;
  id?: string;
  reshares?: RawResharesConnection;
  [key: string]: unknown;
}

export interface CometResharesResponse {
  data?: {
    node?: RawFeedbackNode;
    [key: string]: unknown;
  };
  extensions?: unknown;
  [key: string]: unknown;
}

/**
 * Runtime state tracking pagination progress for a single target post.
 */
export interface PaginationState {
  endCursor: string | null;
  hasNextPage: boolean;
  totalCollected: number;
  scrollAttempts: number;
  stalledAttempts: number;
  isTerminated: boolean;
  terminationReason?: string | null;
}
