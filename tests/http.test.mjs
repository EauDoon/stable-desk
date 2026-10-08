import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import check from '../api/check.js';
import { createAPI, crossSiteRefusal } from '../server/api.mjs';
import { createCheckHandler } from '../server/http.mjs';
import { collect } from '../server/collector.mjs';
const text = 'Official stablecoin merchant eligibility documentation and supported settlement restrictions. '.repeat(3);
const call = (port, method = 'GET', body, headers = {}, path = '/api/check') => new Promise((resolve, reject) => {
  const req = request({ hostname: '127.0.0.1', port, method, path, headers }, res => {
    let output = ''; res.setEncoding('utf8'); res.on('data', chunk => output += chunk);
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: output }));
  });
  req.on('error', reject); req.end(body);
});
async function contract(port) {
  for (const [method, body, headers, path, status] of [
    ['DELETE', undefined, {}, '/api/check', 405],
    ['TRACE', undefined, {}, '/api/check', 405],
    ['POST', 'hello', { 'content-type': 'text/plain' }, '/api/check', 415],
    ['POST', 'x'.repeat(16385), { 'content-type': 'application/json' }, '/api/check', 413],
    ['POST', 'x'.repeat(16385), { 'content-type': 'application/json', 'content-length': '16385' }, '/api/check', 413],
    ['GET', undefined, {}, '/api/check?url=https://example.invalid', 400],
  ]) {
    const response = await call(port, method, body, headers, path);
    assert.equal(response.status, status, JSON.stringify(response));
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
  }
  const allowed = await call(port, 'POST', '{"url":"https://example.invalid"}', { 'content-type': 'application/json' });
  assert.equal(allowed.status, 200);
  assert.equal(JSON.parse(allowed.body).capture.text, text.trim());
  const limited = await call(port);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers['retry-after']) > 0);
}

test('actual hosted adapter checks original requests and propagates headers', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++; assert.equal(url, 'https://docs.stripe.com/payments/stablecoin-payments');
    assert.equal(options.redirect, 'manual');
    return new Response(text, { headers: { 'content-type': 'text/plain' } });
  };
  const server = createServer(check);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await contract(server.address().port); assert.equal(calls, 1); }
  finally { globalThis.fetch = original; await new Promise(resolve => server.close(resolve)); }
});

test('actual local server contains files and guards collection in loopback and public preview modes', async () => {
  const preload = `globalThis.fetch = async () => new Response(${JSON.stringify(text)}, {headers:{'content-type':'text/plain'}});`;
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  const fixture = await mkdtemp(new URL('../test-results/server-', import.meta.url));
  const outside = await mkdtemp(join(tmpdir(), 'stable-desk-server-'));
  try {
    await mkdir(join(fixture, '.private'));
    await writeFile(join(fixture, '.private', 'marker.json'), '{"synthetic":"hidden"}');
    await writeFile(join(outside, 'marker.json'), '{"synthetic":"outside"}');
    await symlink(outside, join(fixture, 'portal'), process.platform === 'win32' ? 'junction' : 'dir');
    const path = `/test-results/${basename(fixture)}`;
    for (const host of ['127.0.0.1', '0.0.0.0']) {
      const child = spawn(process.execPath, ['--import=data:text/javascript,' + encodeURIComponent(preload), 'scripts/server.mjs', '--host', host, '--port', '0'], { cwd: new URL('..', import.meta.url), stdio: ['ignore','pipe','pipe'] });
      try {
        const port = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Server startup timeout')), 5000);
          child.once('error', reject);
          child.stdout.on('data', chunk => { const match = String(chunk).match(/http:\/\/[^:]+:(\d+)/); if (match) { clearTimeout(timer); resolve(Number(match[1])); }});
        });
        for (const target of [`${path}/portal/marker.json`, `${path}/%5C.private%5Cmarker.json`, `${path}/.private/marker.json`])
          assert.equal((await call(port, 'GET', undefined, {}, target)).status, 404);
        assert.equal((await call(port, 'GET', undefined, { Host: 'preview.example' }, '/package.json')).status, host === '127.0.0.1' ? 403 : 200);
        if (host === '127.0.0.1')
          assert.equal((await call(port, 'GET', undefined, { Host: `localhost:${port + 1}` }, '/package.json')).status, 403);
        assert.equal((await call(port, 'HEAD', undefined, { Host: `localhost:${port}` }, '/package.json')).body, '');
        for (const method of ['GET', 'POST'])
          assert.equal((await call(port, method, undefined, { Origin: 'https://outside.example' })).status, 403);
        assert.equal((await call(port, 'GET', undefined, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
        await contract(port);
        assert.equal((await call(port, 'GET', undefined, { Origin: `http://127.0.0.1:${port}` })).status, 429);
        if (host === '0.0.0.0')
          assert.equal((await call(port, 'GET', undefined, { Host: 'preview.example', Origin: 'https://preview.example' })).status, 429);
      } finally { child.kill(); }
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('in-flight collection and cooldown do not permit duplicate upstream calls', async () => {
  let now = 1000, calls = 0, finish;
  const api = createAPI({ now: () => now, collector: () => { calls++; return new Promise(resolve => finish = resolve); } });
  const get = () => api(new Request('https://local/api/check'));
  const first = get();
  now += 31000;
  assert.equal((await get()).status, 429);
  finish({ outcome: 'ok', text }); await first;
  const second = get(); finish({ outcome: 'ok', text }); await second;
  assert.equal((await get()).status, 429);
  assert.equal(calls, 2);
});

test('upstream redirects and oversized responses remain unresolved', async () => {
  assert.equal((await collect(async () => new Response('', { status: 302 }))).outcome, 'unreachable');
  assert.equal((await collect(async () => new Response('x'.repeat(1024 * 1024 + 1), { headers: { 'content-type': 'text/plain' } }))).outcome, 'unreachable');
});

const fakeResponse = () => ({
  status: null, headers: null, body: null, headersSent: false,
  writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; },
  end(body) { this.body = body; },
});
const assertStandardJSON = (res) => {
  assert.equal(res.headers['Content-Type'], 'application/json');
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  return JSON.parse(res.body);
};

test('hosted adapter refuses browser cross-site checks before any collection', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(text, { headers: { 'content-type': 'text/plain' } }); };
  const server = createServer(check);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    for (const [method, headers, body] of [
      ['GET', { 'Sec-Fetch-Site': 'cross-site' }],
      ['GET', { 'Sec-Fetch-Site': 'same-site' }],
      ['POST', { 'Content-Type': 'application/json', Origin: 'https://outside.example' }, '{}'],
      ['GET', { Origin: 'https://outside.example', 'Sec-Fetch-Site': 'cross-site' }],
      ['GET', { Origin: 'null' }],
      ['GET', { Origin: 'not a url' }],
      ['POST', { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port + 1}` }, '{}'],
    ]) {
      const response = await call(port, method, body, headers);
      assert.equal(response.status, 403, JSON.stringify({ method, headers, response }));
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(JSON.parse(response.body).error, 'Cross-site source checks are refused.');
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; await new Promise(resolve => server.close(resolve)); }
});

test('a same-origin call with the Vercel header set passes the cross-site guard', async () => {
  let calls = 0;
  const api = createAPI({ collector: async () => { calls++; return { outcome: 'ok', status: 200, text }; } });
  const response = await api(new Request('http://localhost/api/check', {
    method: 'POST',
    headers: {
      Host: 'stable-desk.vercel.app',
      'X-Forwarded-Host': 'stable-desk.vercel.app',
      'X-Forwarded-Proto': 'https',
      Origin: 'https://stable-desk.vercel.app',
      'Sec-Fetch-Site': 'same-origin',
      'Content-Type': 'application/json',
    },
    body: '{}',
  }));
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(calls, 1);
  const headers = (entries) => new Headers(entries);
  // The function may see an internal Host while X-Forwarded-Host names the public one.
  assert.equal(crossSiteRefusal(headers({ Host: 'internal.example', 'X-Forwarded-Host': 'stable-desk.vercel.app', Origin: 'https://stable-desk.vercel.app' })), false);
  assert.equal(crossSiteRefusal(headers({ Host: '127.0.0.1:4173', Origin: 'http://127.0.0.1:4173', 'Sec-Fetch-Site': 'same-origin' })), false);
  assert.equal(crossSiteRefusal(headers({ Host: 'stable-desk.vercel.app:443', Origin: 'https://stable-desk.vercel.app' })), false);
  // A same-origin GET from fetch sends no Origin; a non-browser client sends neither header.
  assert.equal(crossSiteRefusal(headers({ Host: 'stable-desk.vercel.app', 'Sec-Fetch-Site': 'same-origin' })), false);
  assert.equal(crossSiteRefusal(headers({ Host: 'stable-desk.vercel.app' })), false);
  assert.equal(crossSiteRefusal(headers({ Host: 'stable-desk.vercel.app', Origin: 'https://stable-desk.vercel.app.evil.example' })), true);
  assert.equal(crossSiteRefusal(headers({ Host: 'stable-desk.vercel.app', Origin: 'http://stable-desk.vercel.app:8080' })), true);
});

test('hosted adapter answers its JSON contract when the platform body parser throws', async () => {
  let calls = 0;
  const handler = createCheckHandler({ collector: async () => { calls++; return { outcome: 'ok', status: 200, text }; } });
  const res = fakeResponse();
  await handler({
    method: 'POST',
    url: '/api/check',
    headers: { host: 'stable-desk.vercel.app', 'content-type': 'application/json' },
    get body() { throw new SyntaxError('Invalid JSON'); },
  }, res);
  assert.equal(res.status, 400);
  assert.equal(assertStandardJSON(res).error, 'JSON request required.');
  assert.equal(calls, 0);
  const failed = fakeResponse();
  await handler({ method: 'GET', url: '//[', headers: {} }, failed);
  assert.equal(failed.status, 500);
  assert.match(assertStandardJSON(failed).error, /coverage remains unresolved/);
  assert.equal(calls, 0);
});

test('unread upstream bodies are released on refusal paths', async () => {
  for (const response of [
    new Response('moved', { status: 302, headers: { location: 'https://elsewhere.example' } }),
    new Response('<binary>', { headers: { 'content-type': 'application/octet-stream' } }),
  ]) {
    const result = await collect(async () => response);
    assert.equal(result.outcome, 'unreachable');
    assert.equal(response.bodyUsed, true);
    await assert.rejects(response.text(), TypeError);
  }
});
