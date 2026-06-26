// Loader conformance — the manifest pattern, on the filesystem side.
// (The same loader runs in the browser against http(s) URLs; that path is exercised
//  by the URL-resolution logic these tests cover, plus the documented browser usage.)

import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createBus } from '../index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('loads a manifest by absolute path and registers its agent', async () => {
  const bus = createBus();
  const result = await bus.resolve({ load: join(__dirname, 'empty-manifest.js') });
  assert.equal(result.ok, true);
  assert.equal(result.agents.length, 1);
  assert.equal(bus.has('log_activity_agent'), true);
});

test('loads a manifest by file:// URL', async () => {
  const bus = createBus();
  const url = new URL('./empty-manifest.js', import.meta.url).href;
  const result = await bus.resolve({ load: url });
  assert.equal(result.ok, true);
  assert.equal(bus.has('log_activity_agent'), true);
});

test('inherits resolves a RELATIVE template against the manifest URL and shallow-overrides', async () => {
  const bus = createBus();
  await bus.resolve({ load: join(__dirname, 'inherits-manifest.js') });
  assert.equal(bus.has('derived-agent'), true);
  const agent = bus.get('derived-agent');
  assert.equal(agent.kind, 'base', 'inherited from template');
  assert.equal(agent.extra, 'from-manifest', 'manifest entry overrides template');
  assert.equal(typeof agent.resolve, 'function', 'inherited the resolve()');
});

test('an array of manifests loads each in turn', async () => {
  const bus = createBus();
  const a = join(__dirname, 'empty-manifest.js');
  const b = join(__dirname, 'inherits-manifest.js');
  await bus.resolve({ load: [a, b] });
  assert.equal(bus.has('log_activity_agent'), true);
  assert.equal(bus.has('derived-agent'), true);
});

test('a missing manifest is non-fatal (speculative-load pattern)', async () => {
  const bus = createBus();
  const result = await bus.resolve({ load: join(__dirname, 'does-not-exist.js') });
  assert.equal(result.ok, false);
  assert.deepEqual(result.agents, []);
});
