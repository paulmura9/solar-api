import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { Request, Response } from 'express';
import type { Express } from 'express';
import type { Server } from 'node:http';

import { withCacheHeaders } from '../middleware/cacheHeaders';
import type { CacheDirective } from '../config/cachePolicy';

const TEST_DIRECTIVE: CacheDirective = {
  maxAge: 10,
  staleWhileRevalidate: 60,
  isPrivate: true,
};

const CACHED_PATH = '/cached';
const ERROR_PATH = '/error';

type HttpResponse = {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
};

function buildApp(): Express {
  const app = express();
  app.disable('etag');
  app.get(CACHED_PATH, withCacheHeaders(TEST_DIRECTIVE), (_req: Request, res: Response) => {
    res.json({ data: { value: 'ok' } });
  });
  app.get(ERROR_PATH, withCacheHeaders(TEST_DIRECTIVE), (_req: Request, res: Response) => {
    res.status(500).json({ error: 'fail' });
  });
  return app;
}

function startServer(app: Express): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      resolve({ server, port: addr.port });
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function fetchPath(port: number, path: string, headers: Record<string, string> = {}): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'GET', headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('200 response carries Cache-Control, ETag, and Vary', async () => {
  const { server, port } = await startServer(buildApp());
  try {
    const res = await fetchPath(port, CACHED_PATH);
    assert.equal(res.status, 200);
    const cacheControl = res.headers['cache-control'];
    assert.equal(typeof cacheControl, 'string');
    assert.match(cacheControl as string, /private, max-age=10, stale-while-revalidate=60/);
    const etag = res.headers['etag'];
    assert.equal(typeof etag, 'string');
    assert.match(etag as string, /^W\/"[a-f0-9]+"$/);
    const vary = res.headers['vary'];
    assert.equal(typeof vary, 'string');
    assert.match(vary as string, /Authorization/i);
  } finally {
    await closeServer(server);
  }
});

test('matching If-None-Match returns 304 with empty body', async () => {
  const { server, port } = await startServer(buildApp());
  try {
    const first = await fetchPath(port, CACHED_PATH);
    const etag = first.headers['etag'];
    assert.equal(typeof etag, 'string');
    const second = await fetchPath(port, CACHED_PATH, { 'if-none-match': etag as string });
    assert.equal(second.status, 304);
    assert.equal(second.body, '');
  } finally {
    await closeServer(server);
  }
});

test('500 response sets no-store and omits ETag', async () => {
  const { server, port } = await startServer(buildApp());
  try {
    const res = await fetchPath(port, ERROR_PATH);
    assert.equal(res.status, 500);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.headers['etag'], undefined);
  } finally {
    await closeServer(server);
  }
});
