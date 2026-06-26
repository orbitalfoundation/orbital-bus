import test from 'node:test';
import assert from 'node:assert/strict';
import Logger from '../src/logger.js';
import { mulberry32 } from '../src/random.js';

function captureStdout(fn) {
  const out = [];
  const orig = process.stdout.write;
  process.stdout.write = (chunk, encoding, cb) => { out.push(String(chunk)); if (typeof cb === 'function') cb(); return true; };
  try { fn(); } finally { process.stdout.write = orig; }
  return out.join('');
}

function captureStderr(fn) {
  const out = [];
  const orig = process.stderr.write;
  process.stderr.write = (chunk, encoding, cb) => { out.push(String(chunk)); if (typeof cb === 'function') cb(); return true; };
  try { fn(); } finally { process.stderr.write = orig; }
  return out.join('');
}

function singleNonEmptyLine(s) {
  return s.split('\n').map(l => l.trim()).filter(Boolean);
}

test('Logger.log: timestamp, level, args on one line', () => {
  const out = captureStdout(() => Logger.log('hello', { a: 1 }, 42));
  assert.ok(out.includes('LOG'));
  assert.ok(out.includes('hello'));
  assert.ok(out.includes('"a":1') || out.includes('a:1'));
  assert.ok(out.includes('42'));
  assert.ok(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/.test(out));
  assert.equal(singleNonEmptyLine(out).length, 1);
});

test('Logger.info includes INFO level', () => {
  const out = captureStdout(() => Logger.info('info!', { ok: true }));
  assert.ok(out.includes('INFO'));
});

test('Logger.debug includes DEBUG level', () => {
  const out = captureStdout(() => Logger.debug('dbg', [1, 2, 3]));
  assert.ok(out.includes('DEBUG'));
});

test('Logger.warn goes to stderr with caller file:line', () => {
  const out = captureStderr(() => Logger.warn('watch out', { x: 2 }));
  assert.ok(out.includes('WARN'));
  assert.ok(/test\.js:\d+/.test(out), 'should include caller file:line');
  assert.equal(singleNonEmptyLine(out).length, 1);
});

test('Logger.error with Error prints message on one line', () => {
  const out = captureStderr(() => Logger.error(new Error('boom'), 'extra'));
  assert.ok(out.includes('ERROR'));
  assert.ok(out.includes('boom'));
  assert.equal(singleNonEmptyLine(out).length, 1);
});

test('mulberry32 produces deterministic sequence', () => {
  const r = mulberry32(42);
  const a = [r(), r(), r()];
  const r2 = mulberry32(42);
  const b = [r2(), r2(), r2()];
  assert.deepEqual(a, b);
});

test('mulberry32 values are in [0, 1)', () => {
  const r = mulberry32(99);
  for (let i = 0; i < 100; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});
