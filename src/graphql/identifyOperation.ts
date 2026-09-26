import { COMET_RESHARES_QUERY_NAME, GRAPHQL_ENDPOINT_URL } from '../constants.js';

/**
 * Checks whether a given URL points to Facebook's GraphQL endpoint.
 */
export function isFacebookGraphqlUrl(url: string): boolean {
  return url.includes('/api/graphql/') || url.startsWith(GRAPHQL_ENDPOINT_URL);
}

/**
 * Checks whether request post data corresponds to CometResharesFeedPaginationQuery.
 */
export function isCometResharesRequest(postData: string | null | undefined): boolean {
  if (!postData) return false;
  return postData.includes(`fb_api_req_friendly_name=${COMET_RESHARES_QUERY_NAME}`) ||
         postData.includes(`"friendly_name":"${COMET_RESHARES_QUERY_NAME}"`);
}

/**
 * Validates whether an intercepted JSON response object looks like a reshares feed payload.
 */
export function isResharesPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const data = (payload as Record<string, unknown>).data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') return false;
  const node = data.node as Record<string, unknown> | undefined;
  if (!node || typeof node !== 'object') return false;
  return 'reshares' in node && typeof node.reshares === 'object';
}
