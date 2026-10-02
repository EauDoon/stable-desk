import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';
import check from '../api/check.js';
import { createAPI } from '../server/api.mjs';
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

test('actual local adapter has the same method, body and traffic bounds', async () => {
  const preload = `globalThis.fetch = async () => new Response(${JSON.stringify(text)}, {headers:{'content-type':'text/plain'}});`;
  const child = spawn(process.execPath, ['--import=data:text/javascript,' + encodeURIComponent(preload), 'scripts/server.mjs', '--port', '0'], { cwd: new URL('..', import.meta.url), stdio: ['ignore','pipe','pipe'] });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timeout')), 5000);
      child.once('error', reject);
      child.stdout.on('data', chunk => { const match = String(chunk).match(/127\.0\.0\.1:(\d+)/); if (match) { clearTimeout(timer); resolve(Number(match[1])); }});
    });
    await contract(port);
  } finally { child.kill(); }
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
