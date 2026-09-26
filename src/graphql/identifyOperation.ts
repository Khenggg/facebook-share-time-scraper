import { COMET_RESHARES_QUERY_NAME, COMET_RESHARES_DIALOG_QUERY_NAME, GRAPHQL_ENDPOINT_URL } from '../constants.js';

export interface GraphqlOperationInfo {
  friendlyName?: string;
  isResharePagination: boolean;
  variables?: Record<string, unknown>;
}

/**
 * Checks whether a given URL points to Facebook's GraphQL endpoint.
 */
export function isFacebookGraphqlUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const isFbDomain = url.includes('facebook.com') || url.includes('fb.com') || url.startsWith('/');
  return isFbDomain && url.includes('/api/graphql/');
}

/**
 * Inspects raw POST data from a GraphQL request and extracts operation metadata.
 * Strips all sensitive tokens (lsd, fb_dtsg, jazoest, cookies).
 */
export function identifyGraphqlOperation(postData: string | null | undefined): GraphqlOperationInfo {
  if (!postData || typeof postData !== 'string' || postData.trim() === '') {
    return { isResharePagination: false };
  }

  const trimmed = postData.trim();
  let friendlyName: string | undefined;
  let variables: Record<string, unknown> | undefined;

  // Approach 1: Check if POST data is JSON formatted
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      friendlyName = parsed.fb_api_req_friendly_name || parsed.friendly_name;
      if (parsed.variables && typeof parsed.variables === 'object') {
        variables = parsed.variables;
      }
    } catch {
      // Continue to URLSearchParams fallback
    }
  }

  // Approach 2: URL-encoded Form Data (Standard for Facebook RelayModern)
  if (!friendlyName) {
    try {
      const params = new URLSearchParams(trimmed);
      friendlyName = params.get('fb_api_req_friendly_name') || params.get('friendly_name') || undefined;

      const rawVars = params.get('variables');
      if (rawVars) {
        try {
          variables = JSON.parse(rawVars);
        } catch {
          // If variables cannot be parsed as JSON, keep undefined
        }
      }
    } catch {
      // Continue to regex fallback
    }
  }

  // Approach 3: Regex fallback if URLSearchParams had parsing anomalies
  if (!friendlyName) {
    const match = trimmed.match(/(?:fb_api_req_friendly_name|friendly_name)=([^&]+)/);
    if (match && match[1]) {
      try {
        friendlyName = decodeURIComponent(match[1]);
      } catch {
        friendlyName = match[1];
      }
    }
  }

  const isResharePagination =
    friendlyName === COMET_RESHARES_QUERY_NAME || friendlyName === COMET_RESHARES_DIALOG_QUERY_NAME;

  return {
    friendlyName,
    isResharePagination,
    variables,
  };
}

/**
 * Checks whether request post data corresponds to CometResharesFeedPaginationQuery or CometResharesDialogQuery.
 */
export function isCometResharesRequest(postData: string | null | undefined): boolean {
  return identifyGraphqlOperation(postData).isResharePagination;
}

/**
 * Validates whether an intercepted JSON response object looks like a reshares feed payload.
 */
export function isResharesPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const data = (payload as Record<string, unknown>).data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') return false;
  const node = (data.node ?? data.feedback) as Record<string, unknown> | undefined;
  if (!node || typeof node !== 'object') return false;
  return 'reshares' in node && typeof node.reshares === 'object';
}
