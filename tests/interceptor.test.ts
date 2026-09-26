import { describe, it, expect, vi } from 'vitest';
import { ReshareNetworkInterceptor } from '../src/crawler/requestHandler.js';
import { COMET_RESHARES_QUERY_NAME, COMET_RESHARES_DIALOG_QUERY_NAME } from '../src/constants.js';
import type { Page, Request as PlaywrightRequest, Response as PlaywrightResponse } from 'playwright';

describe('ReshareNetworkInterceptor', () => {
  it('captures dialog and pagination responses correctly', async () => {
    const interceptor = new ReshareNetworkInterceptor();

    const listeners: Record<string, Function> = {};
    const mockPage = {
      on: (event: string, handler: Function) => {
        listeners[event] = handler;
      },
    } as unknown as Page;

    interceptor.attach(mockPage);
    expect(listeners['request']).toBeDefined();
    expect(listeners['response']).toBeDefined();

    // 1. Simulate Dialog Query Request and Response
    const mockDialogReq = {
      url: () => 'https://www.facebook.com/api/graphql/',
      method: () => 'POST',
      postData: () => `fb_api_req_friendly_name=${COMET_RESHARES_DIALOG_QUERY_NAME}&variables=%7B%7D`,
    } as unknown as PlaywrightRequest;

    const mockDialogRes = {
      url: () => 'https://www.facebook.com/api/graphql/',
      request: () => mockDialogReq,
      text: async () => '{"data":{"feedback":{"reshares":{"edges":[{"node":{"id":"1","creation_time":1774006209}}]}}}}',
    } as unknown as PlaywrightResponse;

    listeners['request'](mockDialogReq);
    await listeners['response'](mockDialogRes);

    const dialogBodies = interceptor.getCapturedDialogBodies();
    expect(dialogBodies.length).toBe(1);
    expect(dialogBodies[0]).toContain('1774006209');

    // 2. Simulate Pagination Query Request and Response
    const mockPagReq = {
      url: () => 'https://www.facebook.com/api/graphql/',
      method: () => 'POST',
      postData: () => `fb_api_req_friendly_name=${COMET_RESHARES_QUERY_NAME}&doc_id=123456&variables=%7B%22cursor%22%3A%22cur1%22%7D`,
    } as unknown as PlaywrightRequest;

    const mockPagRes = {
      url: () => 'https://www.facebook.com/api/graphql/',
      request: () => mockPagReq,
      text: async () => '{"data":{"node":{"reshares":{"edges":[{"node":{"id":"2","creation_time":1789824168}}],"page_info":{"has_next_page":false}}}}}',
    } as unknown as PlaywrightResponse;

    listeners['request'](mockPagReq);
    await listeners['response'](mockPagRes);

    expect(interceptor.hasCapturedPagination()).toBe(true);

    const pair = await interceptor.waitForPagination(100);
    expect(pair).not.toBeNull();
    expect(pair!.postData).toContain(COMET_RESHARES_QUERY_NAME);
    expect(pair!.responseBody).toContain('1789824168');
  });

  it('resolves pending waiter when pagination arrives later', async () => {
    const interceptor = new ReshareNetworkInterceptor();

    const listeners: Record<string, Function> = {};
    const mockPage = {
      on: (event: string, handler: Function) => {
        listeners[event] = handler;
      },
    } as unknown as Page;

    interceptor.attach(mockPage);

    // Call waitForPagination before the response has arrived
    const waitPromise = interceptor.waitForPagination(1000);

    const mockReq = {
      url: () => 'https://www.facebook.com/api/graphql/',
      method: () => 'POST',
      postData: () => `fb_api_req_friendly_name=${COMET_RESHARES_QUERY_NAME}&variables=%7B%7D`,
    } as unknown as PlaywrightRequest;

    const mockRes = {
      url: () => 'https://www.facebook.com/api/graphql/',
      request: () => mockReq,
      text: async () => '{"data":{"node":{"reshares":{"edges":[]}}}}',
    } as unknown as PlaywrightResponse;

    listeners['request'](mockReq);
    await listeners['response'](mockRes);

    const result = await waitPromise;
    expect(result).not.toBeNull();
    expect(result!.postData).toContain(COMET_RESHARES_QUERY_NAME);
  });

  it('times out and returns null if no pagination arrives', async () => {
    const interceptor = new ReshareNetworkInterceptor();
    const mockPage = {
      on: () => {},
    } as unknown as Page;

    interceptor.attach(mockPage);
    const result = await interceptor.waitForPagination(50);
    expect(result).toBeNull();
  });
});
