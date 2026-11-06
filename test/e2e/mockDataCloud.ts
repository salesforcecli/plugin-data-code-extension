/*
 * Copyright 2026, Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer, type Server } from 'node:https';
import { type AddressInfo } from 'node:net';
import JSZip from 'jszip';

/**
 * One request the plugin made against the mock org. Only the Data Cloud custom
 * code calls and the zip upload are recorded; the REST API version discovery
 * and auth refresh that `@salesforce/core` performs are answered but not
 * recorded, since they belong to the library rather than to this plugin.
 */
export type RecordedRequest = {
  method: string;
  path: string;
  body?: unknown;
  /** Sorted entry names of the uploaded deployment.zip. */
  zipEntries?: string[];
};

export type MockDataCloud = {
  url: string;
  requests: RecordedRequest[];
  close: () => Promise<void>;
};

const API_VERSION = '63.0';
const CUSTOM_CODE_PATH = /^\/services\/data\/v\d+\.\d+\/ssot\/data-custom-code(?:\/([^/?]+))?$/;
const DATA_TRANSFORMS_PATH = /^\/services\/data\/v\d+\.\d+\/ssot\/data-transforms$/;
const UPLOAD_PATH = /^\/upload\/([^/?]+)$/;

/**
 * Sorted file entries of a zip, without Python bytecode. Whether `.pyc` files
 * exist depends on how the SDK was installed (pip compiles them by default),
 * so they are left out to keep the expected files portable.
 */
export async function listZipEntries(data: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(data);
  return Object.keys(zip.files)
    .filter((name) => !zip.files[name].dir && !name.split('/').includes('__pycache__') && !name.endsWith('.pyc'))
    .sort();
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function parseJson(raw: Buffer): unknown {
  if (raw.length === 0) return undefined;
  try {
    return JSON.parse(raw.toString('utf8')) as unknown;
  } catch {
    return raw.toString('utf8');
  }
}

/**
 * Answers the GETs that `@salesforce/core` / jsforce make on their own (API
 * version discovery, the Organization SOQL probe, the refreshAuth ping).
 * Returns false when `urlPath` is not one of them.
 */
function answerLibraryProbe(urlPath: string, res: ServerResponse): boolean {
  if (/^\/services\/data\/?$/.test(urlPath)) {
    sendJson(res, 200, [{ label: 'Smoke', url: `/services/data/v${API_VERSION}`, version: API_VERSION }]);
  } else if (/^\/services\/data\/v\d+\.\d+\/query\/?$/.test(urlPath)) {
    sendJson(res, 200, { totalSize: 0, done: true, records: [] });
  } else if (/^\/services\/data\/v\d+\.\d+\/?$/.test(urlPath)) {
    sendJson(res, 200, {});
  } else {
    return false;
  }
  return true;
}

/**
 * Starts an HTTPS server on 127.0.0.1 that stands in for a Data Cloud org.
 *
 * HTTPS is required: the plugin refuses to upload a package to a non-https
 * URL. Callers pass a self-signed key/cert and trust it in the plugin process
 * via `NODE_EXTRA_CA_CERTS`.
 *
 * Each package name reports "Deploying" on its first status poll and
 * "Deployed" afterwards, so the plugin's polling loop is exercised.
 */
export async function startMockDataCloud(tls: { key: Buffer; cert: Buffer }): Promise<MockDataCloud> {
  const requests: RecordedRequest[] = [];
  const statusPolls = new Map<string, number>();
  let baseUrl = '';

  const handleUpload = async (method: string, urlPath: string, raw: Buffer, res: ServerResponse): Promise<void> => {
    requests.push({ method, path: urlPath, zipEntries: await listZipEntries(raw) });
    res.writeHead(200);
    res.end();
  };

  const handleStatusPoll = (method: string, urlPath: string, encodedName: string, res: ServerResponse): void => {
    const name = decodeURIComponent(encodedName);
    const polls = (statusPolls.get(name) ?? 0) + 1;
    statusPolls.set(name, polls);
    // Record only the first poll: the number of polls depends on timing.
    if (polls === 1) requests.push({ method, path: urlPath });
    sendJson(res, 200, { name, deploymentStatus: polls === 1 ? 'Deploying' : 'Deployed' });
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? 'GET';
    const urlPath = new URL(req.url ?? '/', baseUrl).pathname;
    const raw = await readBody(req);
    const customCode = CUSTOM_CODE_PATH.exec(urlPath);

    if (method === 'PUT' && UPLOAD_PATH.test(urlPath)) {
      await handleUpload(method, urlPath, raw, res);
    } else if (method === 'POST' && customCode && !customCode[1]) {
      const body = parseJson(raw) as { name?: string } | undefined;
      requests.push({ method, path: urlPath, body });
      sendJson(res, 201, { fileUploadUrl: `${baseUrl}/upload/${body?.name ?? 'package'}` });
    } else if (method === 'GET' && customCode?.[1]) {
      handleStatusPoll(method, urlPath, customCode[1], res);
    } else if (method === 'POST' && DATA_TRANSFORMS_PATH.test(urlPath)) {
      requests.push({ method, path: urlPath, body: parseJson(raw) });
      sendJson(res, 201, { id: '0dtSMOKE0000001' });
    } else if (!(method === 'GET' && answerLibraryProbe(urlPath, res))) {
      requests.push({ method, path: urlPath, body: parseJson(raw) });
      sendJson(res, 404, [{ errorCode: 'NOT_FOUND', message: `mock has no route for ${method} ${urlPath}` }]);
    }
  };

  const server: Server = createServer({ key: tls.key, cert: tls.cert }, (req, res) => {
    handle(req, res).catch((err: unknown) => {
      sendJson(res, 500, [{ errorCode: 'MOCK_ERROR', message: String(err) }]);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url: baseUrl,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
