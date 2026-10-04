import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createCollectionHandler } from './collection-api.ts';

test('local update API validates, backs up, rejects cross-origin and stale writes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gallery-api-'));
  mkdirSync(join(root, 'public'));
  const file = join(root, 'public/collection.json');
  const original = JSON.stringify({ version: 1, items: [] });
  writeFileSync(file, original);
  const handler = createCollectionHandler(file);
  const server = createServer((request, response) => void handler(request, response, () => { response.writeHead(404); response.end(); }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/collection`;
  try {
    const initial = await (await fetch(url)).json();
    const body = JSON.stringify({ version: 1, profile: { name: '测试' }, items: [{ type: 'book', title: '测试书籍', rating: 5, review: '我的书评' }] });
    const headers = { 'Content-Type': 'application/json', 'X-Gallery-Update': '1', 'If-Match': initial.revision };
    assert.equal((await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
    assert.equal((await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Gallery-Update': '1' }, body })).status, 428);
    assert.equal((await fetch(url, { method: 'PUT', headers: { ...headers, Origin: 'https://evil.example' }, body })).status, 403);
    // Node fetch replaces Host, so use the HTTP client to exercise DNS-rebinding protection.
    const spoofedHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const call = request(url, { headers: { Host: 'evil.example' } }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode));
      });
      call.on('error', reject); call.end();
    });
    assert.equal(spoofedHostStatus, 403);
    assert.equal((await fetch(url, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await fetch(url, { method: 'PUT', headers: { ...headers, 'Content-Type': 'text/plain' }, body })).status, 415);
    assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 405);
    assert.equal((await fetch(url, { method: 'PUT', headers, body: '{bad' })).status, 400);
    assert.equal((await fetch(url, { method: 'PUT', headers, body: '[{"type":"book","title":"bad","rating":9}]' })).status, 400);
    assert.equal(readFileSync(file, 'utf8'), original);
    const response = await fetch(url, { method: 'PUT', headers, body });
    assert.equal(response.status, 200);
    const updated = await response.json();
    assert.notEqual(updated.revision, initial.revision);
    assert.equal(updated.collection.items[0].review, '我的书评');
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), updated.collection);
    assert.equal(readFileSync(join(root, '.local/collection.previous.json'), 'utf8'), original);
    assert.equal((await fetch(url, { method: 'PUT', headers, body })).status, 412);
    const refreshed = await (await fetch(url)).json();
    const concurrent = await Promise.all(['第一份', '第二份'].map(title => fetch(url, {
      method: 'PUT', headers: { ...headers, 'If-Match': refreshed.revision },
      body: JSON.stringify([{ type: 'movie', title }]),
    })));
    assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 412]);
    const latest = await (await fetch(url)).json();
    assert.equal((await fetch(url, { method: 'PUT', headers: { ...headers, 'If-Match': latest.revision }, body: ' '.repeat(20 * 1024 * 1024 + 1) })).status, 413);
    assert.equal((await (await fetch(url)).json()).revision, latest.revision);
    assert.equal((await fetch(url, { method: 'PUT', headers: { ...headers, 'If-Match': latest.revision }, body: '[]' })).status, 200);
    assert.equal((await (await fetch(url)).json()).collection.items.length, 0);
    assert.equal((await fetch(`${url}/other`)).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
