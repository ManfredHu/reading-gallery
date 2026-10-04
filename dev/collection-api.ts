import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { normalizeCollection } from '../src/data.ts';

const limit = 20 * 1024 * 1024;
const revisionOf = (raw: string) => `"${createHash('sha256').update(raw).digest('hex')}"`;

function respond(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) { reject(new Error('请求不能超过 20 MB。')); return; }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
    request.on('aborted', () => reject(new Error('请求已中断。')));
  });
}

export function createCollectionHandler(file: string) {
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (request.url?.split('?')[0] !== '/api/collection') { next(); return; }
    // A browser on an unrelated site must not be able to write local project files.
    const host = request.headers.host || '';
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress || '');
    const validHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
    if (!loopback || !validHost || (request.headers.origin && request.headers.origin !== `http://${host}`)
      || (request.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(String(request.headers['sec-fetch-site'])))) {
      respond(response, 403, { error: '仅允许本机同源调用。' }); return;
    }
    try {
      if (request.method === 'GET') {
        const raw = readFileSync(file, 'utf8');
        respond(response, 200, { revision: revisionOf(raw), collection: normalizeCollection(JSON.parse(raw)) }); return;
      }
      if (request.method !== 'PUT') {
        response.setHeader('Allow', 'GET, PUT');
        respond(response, 405, { error: '仅支持 GET 和 PUT。' }); return;
      }
      if (request.headers['x-gallery-update'] !== '1') {
        respond(response, 403, { error: '需要 X-Gallery-Update: 1 请求头。' }); return;
      }
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
        respond(response, 415, { error: '需要 application/json。' }); return;
      }
      if (!request.headers['if-match']) {
        respond(response, 428, { error: '请先 GET 获取 revision，再以 If-Match 提交。' }); return;
      }
      if (Number(request.headers['content-length']) > limit) {
        request.resume(); respond(response, 413, { error: '请求不能超过 20 MB。' }); return;
      }
      let body: string;
      try { body = await readBody(request); }
      catch { respond(response, 413, { error: '请求中断或超过 20 MB。' }); return; }
      let collection;
      try { collection = normalizeCollection(JSON.parse(body)); }
      catch (error) { respond(response, 400, { error: error instanceof Error ? error.message : '数据格式错误。' }); return; }
      const raw = readFileSync(file, 'utf8');
      if (request.headers['if-match'] !== revisionOf(raw)) {
        respond(response, 412, { error: '收藏已被其他操作更新，请刷新页面或重新 GET 后再合并。' }); return;
      }
      const output = `${JSON.stringify(collection, null, 2)}\n`;
      // ponytail: one local file; synchronous compare-and-rename avoids concurrent writes. Use transactions for multi-user hosting.
      const backupDir = join(dirname(file), '..', '.local');
      const temporary = join(dirname(file), `.collection-${randomUUID()}.tmp`);
      try {
        mkdirSync(backupDir, { recursive: true, mode: 0o700 });
        writeFileSync(join(backupDir, 'collection.previous.json'), raw, { mode: 0o600 });
        writeFileSync(temporary, output, { flag: 'wx', mode: 0o600 });
        renameSync(temporary, file);
      } finally { rmSync(temporary, { force: true }); }
      respond(response, 200, { revision: revisionOf(output), collection });
    } catch {
      respond(response, 500, { error: '无法读写项目数据文件。请检查 JSON 格式和文件权限；不要继续覆盖。' });
    }
  };
}
