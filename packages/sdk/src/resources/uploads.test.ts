import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { ValidationError } from '../transport/errors.js';
import { HttpClient } from '../transport/http-client.js';
import type { UploadResult } from './uploads.js';
import { createUploadsResource } from './uploads.js';

async function resource(fetchImpl: typeof fetch) {
  const http = new HttpClient({ baseUrl: 'https://api.example.com', fetch: fetchImpl });
  const session = new SessionManager({ httpClient: http, emitter: new SessionEventEmitter() });
  await session.establish({
    accessToken: 'a',
    refreshToken: 'r',
    expiresIn: 900,
    sessionId: 's1',
    identifier: 'alice/example.com',
  });
  return createUploadsResource(session);
}

const method = (call: { init: RequestInit | undefined } | undefined) => call?.init?.method;
const header = (call: { init: RequestInit | undefined } | undefined, name: string) =>
  new Headers(call?.init?.headers).get(name);

function rawResponse(status: number, headers: Record<string, string>, body: unknown = null) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

const FINAL_RESULT: UploadResult = {
  id: 'u1',
  state: 'ready',
  contentType: 'text/plain',
  sizeBytes: '10',
  width: null,
  height: null,
  durationMs: null,
  hasThumbnail: false,
};

describe('uploads resource', () => {
  it('upload() creates then chunks the file, reporting progress', async () => {
    const file = new Blob([new Uint8Array(10).fill(65)], { type: 'text/plain' });
    const fetchMock = createFetchMock(
      rawResponse(201, { Location: '/uploads/u1', 'Upload-Expires': 'later' }),
      rawResponse(204, { 'Upload-Offset': '4' }),
      rawResponse(204, { 'Upload-Offset': '8' }),
      rawResponse(200, { 'Upload-Offset': '10', 'Ekoz-Upload': JSON.stringify(FINAL_RESULT) }),
    );
    const uploads = await resource(fetchMock);
    const progress: Array<[number, number]> = [];

    const handle = await uploads.upload(file, {
      chunkSize: 4,
      onProgress: (sent, total) => progress.push([sent, total]),
    });

    expect(handle.id).toBe('u1');
    await expect(handle.promise).resolves.toEqual(FINAL_RESULT);
    expect(progress).toEqual([
      [4, 10],
      [8, 10],
      [10, 10],
    ]);
    expect(method(fetchMock.calls[0])).toBe('POST');
    expect(header(fetchMock.calls[0], 'Upload-Length')).toBe('10');
    expect(method(fetchMock.calls[1])).toBe('PATCH');
    expect(header(fetchMock.calls[1], 'Upload-Offset')).toBe('0');
    expect(header(fetchMock.calls[2], 'Upload-Offset')).toBe('4');
    expect(header(fetchMock.calls[3], 'Upload-Offset')).toBe('8');
  });

  it('resume() heads the upload then continues from the server offset', async () => {
    const file = new Blob([new Uint8Array(10).fill(65)]);
    const fetchMock = createFetchMock(
      rawResponse(200, { 'Upload-Offset': '6', 'Upload-Length': '10' }),
      rawResponse(200, { 'Upload-Offset': '10', 'Ekoz-Upload': JSON.stringify(FINAL_RESULT) }),
    );
    const uploads = await resource(fetchMock);

    const handle = await uploads.resume('u1', file, { chunkSize: 4 });

    await expect(handle.promise).resolves.toEqual(FINAL_RESULT);
    expect(method(fetchMock.calls[0])).toBe('HEAD');
    expect(method(fetchMock.calls[1])).toBe('PATCH');
    expect(header(fetchMock.calls[1], 'Upload-Offset')).toBe('6');
  });

  it('recovers from a mid-chunk network error by resyncing the offset via HEAD', async () => {
    const file = new Blob([new Uint8Array(10).fill(65)]);
    const fetchMock = createFetchMock(
      rawResponse(201, { Location: '/uploads/u1' }),
      new Error('socket hang up'),
      rawResponse(200, { 'Upload-Offset': '10', 'Upload-Length': '10' }),
      rawResponse(200, { 'Upload-Offset': '10', 'Ekoz-Upload': JSON.stringify(FINAL_RESULT) }),
    );
    const uploads = await resource(fetchMock);

    const handle = await uploads.upload(file, { chunkSize: 10 });

    await expect(handle.promise).resolves.toEqual(FINAL_RESULT);
    // POST, failed PATCH, recovery HEAD, retried PATCH now sending an empty tail.
    expect(fetchMock.callCount).toBe(4);
    expect(method(fetchMock.calls[2])).toBe('HEAD');
    expect(header(fetchMock.calls[3], 'Upload-Offset')).toBe('10');
  });

  it('does not retry once the signal is aborted', async () => {
    const file = new Blob([new Uint8Array(10).fill(65)]);
    const fetchMock = createFetchMock(rawResponse(201, { Location: '/uploads/u1' }));
    const uploads = await resource(fetchMock);
    const controller = new AbortController();
    controller.abort();

    const handle = await uploads.upload(file, { chunkSize: 10, signal: controller.signal });

    await expect(handle.promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock.callCount).toBe(1);
  });

  it('cancel() DELETEs /uploads/:id', async () => {
    const fetchMock = createFetchMock(jsonResponse({ status: 204 }));
    const uploads = await resource(fetchMock);

    await expect(uploads.cancel('u1')).resolves.toBeUndefined();

    expect(method(fetchMock.calls[0])).toBe('DELETE');
    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/uploads/u1');
  });

  it('get() reads the recovery view', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        body: {
          id: 'u1',
          state: 'receiving',
          offset: '4',
          length: '10',
          filename: 'a.txt',
          expiresAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    );
    const uploads = await resource(fetchMock);

    const status = await uploads.get('u1');

    expect(method(fetchMock.calls[0])).toBe('GET');
    expect(status.offset).toBe('4');
  });

  it('surfaces a decoded problem when creation is rejected', async () => {
    const file = new Blob([new Uint8Array(10)]);
    const fetchMock = createFetchMock(
      jsonResponse({
        status: 422,
        body: { code: 'validation_failed', title: 'Invalid', status: 422, issues: [] },
      }),
    );
    const uploads = await resource(fetchMock);

    await expect(uploads.upload(file, { chunkSize: 10 })).rejects.toBeInstanceOf(ValidationError);
  });
});
