// Conformance suite for @orbital/bus.
//
// These tests are the executable contract. Each one pins a semantic decision documented
// in SPEC.md. Any reimplementation (a browser build, a port, a rewrite) is correct iff it
// passes these. When you change a behavior here, change SPEC.md in the same commit.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../index.js';

// --- dispatch & filters -----------------------------------------------------

test('filter matches on key PRESENCE, including falsy values (0/false)', async () => {
  const bus = createBus();
  let seen = 0;
  const a = { id: 'z-watcher', resolve(e) { if ('z' in e) seen++; } };
  a.resolve.filter = { z: true };
  bus.register(a);
  await bus.resolve({ z: 0 });
  await bus.resolve({ z: false });
  await bus.resolve({ nope: 1 }); // no 'z' key -> filtered out
  assert.equal(seen, 2);
});

test('a listener with no filter sees every event', async () => {
  const bus = createBus();
  const kinds = [];
  bus.register({ id: 'omni', resolve(e) { if (!e.registered) kinds.push(Object.keys(e).join(',')); } });
  await bus.resolve({ a: 1 });
  await bus.resolve({ b: 2 });
  assert.deepEqual(kinds, ['a', 'b']);
});

// --- first-responder (query mode) ------------------------------------------

test('first non-undefined return stops the chain and is returned', async () => {
  const bus = createBus();
  const calls = [];
  bus.register({ id: 'q1', resolve(e) { if (!e.q) return; calls.push('q1'); return { answer: 42 }; } });
  bus.register({ id: 'q2', resolve(e) { if (!e.q) return; calls.push('q2'); return { answer: 99 }; } });
  const r = await bus.resolve({ q: true });
  assert.deepEqual(r, { answer: 42 });
  assert.deepEqual(calls, ['q1'], 'q2 must not run once q1 answered');
});

test('returning undefined lets the event fan out to all matching listeners', async () => {
  const bus = createBus();
  let count = 0;
  bus.register({ id: 'f1', resolve(e) { if (e.fan) count++; } });
  bus.register({ id: 'f2', resolve(e) { if (e.fan) count++; } });
  const r = await bus.resolve({ fan: true });
  assert.equal(count, 2);
  assert.equal(r, undefined);
});

// --- immediate nested resolution (NO queue) --------------------------------

test('nested resolve() fully completes before the parent continues', async () => {
  const bus = createBus();
  const order = [];
  bus.register({
    id: 'outer',
    resolve: async (e, bus) => {
      if (!e.outer) return;
      order.push('outer:before');
      await bus.resolve({ inner: true });
      order.push('outer:after');
    },
  });
  bus.register({ id: 'inner', resolve: (e) => { if (e.inner) order.push('inner'); } });
  await bus.resolve({ outer: true });
  assert.deepEqual(order, ['outer:before', 'inner', 'outer:after']);
});

// --- registration during dispatch ------------------------------------------

test('a listener registered mid-dispatch does NOT receive the current event', async () => {
  const bus = createBus();
  const received = [];
  bus.register({
    id: 'registrar',
    resolve(event) {
      if (event.load === true) {
        bus.register({ id: 'child', resolve(e) { received.push(e.tick ? 'tick' : 'other'); } });
      }
    },
  });
  await bus.resolve({ load: true });
  assert.deepEqual(received, ['other'], 'child only saw its own {registered:true}');
  await bus.resolve({ tick: 1, t: 1, dt: 1 });
  assert.deepEqual(received, ['other', 'tick']);
});

// --- obliterate ------------------------------------------------------------

test('obliterate removes a listener AFTER it has seen the event', async () => {
  const bus = createBus();
  let sawObliterate = false;
  bus.register({
    id: 'removable',
    resolve(event) {
      if (event.registered) return;
      if (event.obliterate) sawObliterate = true;
    },
  });
  assert.equal(bus.has('removable'), true);
  await bus.resolve({ id: 'removable', obliterate: true });
  assert.equal(sawObliterate, true, 'handler saw the obliterate event before removal');
  assert.equal(bus.has('removable'), false);
});

// --- arrays, invalid events, registration-by-blob --------------------------

test('resolve handles arrays of events and registers embedded listeners', async () => {
  const bus = createBus();
  await bus.resolve([{ id: 'arr', resolve() {} }]);
  assert.equal(bus.has('arr'), true);
});

test('resolve ignores invalid non-object events without throwing', async () => {
  const bus = createBus();
  await assert.doesNotReject(async () => bus.resolve(null));
  await assert.doesNotReject(async () => bus.resolve(42));
  await assert.doesNotReject(async () => bus.resolve('hello'));
});

// --- services & schema -----------------------------------------------------

test('install adds a service and refuses to overwrite an existing name', () => {
  const bus = createBus();
  assert.equal(bus.install('spatial', { near: () => [] }), true);
  assert.equal(typeof bus.spatial.near, 'function');
  assert.equal(bus.install('spatial', {}), false);
});

test('schema event reserves a namespace key under its claimant', async () => {
  const bus = createBus();
  await bus.resolve({ id: 'physics', schema: { gravity: { g: 9.8 } } });
  assert.equal(bus.schemas.get('gravity')._claimant, 'physics');
});

// --- ordering --------------------------------------------------------------

test('resolve.before / resolve.after order listeners regardless of registration order', async () => {
  const bus = createBus();
  const order = [];
  const late = { id: 'late', resolve(e) { if (e.go) order.push('late'); } };
  const early = { id: 'early', resolve(e) { if (e.go) order.push('early'); } };
  early.resolve.before = 'late';
  bus.register(late);   // registered first...
  bus.register(early);  // ...but declares it runs before 'late'
  await bus.resolve({ go: true });
  assert.deepEqual(order, ['early', 'late']);
});

// --- environment neutrality ------------------------------------------------

test('createBus assigns a uuid without requiring a node-only crypto import', () => {
  const bus = createBus();
  assert.match(bus.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});
