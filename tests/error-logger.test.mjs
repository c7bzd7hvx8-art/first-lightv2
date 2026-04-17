// =============================================================================
// Tests for modules/error-logger.mjs
//
// Runtime: Node's built-in test runner + assert/strict. Zero dependencies.
//
// Strategy
//   We stub globalThis.window / location / navigator before the module's
//   internal closures capture them, so install() actually registers
//   listeners onto our fake window. A `FakeSupabase` records every .insert()
//   call as a row so we can assert on payload shape, dedupe, cap, etc.
//   _resetErrorLoggerForTests() runs at the start of each test so module
//   state doesn't leak between cases.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Browser-global stubs (set before module import) ──────────────────────────
// Node >=22 ships built-in `navigator` + `location` globals on an immutable
// descriptor, so we have to go through defineProperty to stomp them. We save
// whatever was there and restore it after each test.
function defineStub(name, value) {
  const prev = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    value, writable: true, configurable: true, enumerable: true,
  });
  return () => {
    if (prev) Object.defineProperty(globalThis, name, prev);
    else delete globalThis[name];
  };
}

function installWindowStub() {
  const listeners = { error: [], unhandledrejection: [] };
  const fakeWindow = {
    addEventListener(type, fn) {
      if (listeners[type]) listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!listeners[type]) return;
      const i = listeners[type].indexOf(fn);
      if (i >= 0) listeners[type].splice(i, 1);
    },
  };
  const restoreWin = defineStub('window',    fakeWindow);
  const restoreLoc = defineStub('location',  { href: 'https://example.test/diary' });
  const restoreNav = defineStub('navigator', { userAgent: 'FakeUA/1.0' });
  return {
    listeners,
    restore() { restoreNav(); restoreLoc(); restoreWin(); },
  };
}

class FakeSupabase {
  constructor({ throwOnInsert = false } = {}) {
    this.rows = [];
    this.throwOnInsert = throwOnInsert;
  }
  from(table) {
    const self = this;
    return {
      async insert(row) {
        if (self.throwOnInsert) throw new Error('boom');
        self.rows.push({ table, row });
        return { data: null, error: null };
      },
    };
  }
}

// Deferred import so every test gets a freshly-stubbed window.
const mod = await import('../modules/error-logger.mjs');
const {
  installErrorLogger,
  logErrorManually,
  _resetErrorLoggerForTests,
} = mod;

// Small helper so async .insert() from the non-awaited fire-and-forget path
// has a chance to land before we assert.
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('install() registers window.error + unhandledrejection listeners once', () => {
  _resetErrorLoggerForTests();
  const w = installWindowStub();
  try {
    const sb = new FakeSupabase();
    installErrorLogger(sb, { appVersion: 'diary@7.73' });
    assert.equal(w.listeners.error.length, 1);
    assert.equal(w.listeners.unhandledrejection.length, 1);
    installErrorLogger(sb, { appVersion: 'diary@7.73' }); // second call is a no-op
    assert.equal(w.listeners.error.length, 1);
    assert.equal(w.listeners.unhandledrejection.length, 1);
  } finally { w.restore(); }
});

test('error event is POSTed with message/stack/url/source/app_version', async () => {
  _resetErrorLoggerForTests();
  const w = installWindowStub();
  try {
    const sb = new FakeSupabase();
    installErrorLogger(sb, { appVersion: 'diary@7.73' });
    const handler = w.listeners.error[0];
    handler({
      error: Object.assign(new Error('kaboom'), { stack: 'Error: kaboom\n    at foo' }),
      lineno: 42,
      colno: 7,
    });
    await flush();
    assert.equal(sb.rows.length, 1);
    const row = sb.rows[0].row;
    assert.equal(row.source, 'error');
    assert.equal(row.message, 'kaboom');
    assert.match(row.stack, /kaboom/);
    assert.equal(row.lineno, 42);
    assert.equal(row.colno, 7);
    assert.equal(row.url, 'https://example.test/diary');
    assert.equal(row.user_agent, 'FakeUA/1.0');
    assert.equal(row.app_version, 'diary@7.73');
    assert.equal(row.user_id, null);
  } finally { w.restore(); }
});

test('unhandledrejection with Error reason captures message + stack', async () => {
  _resetErrorLoggerForTests();
  const w = installWindowStub();
  try {
    const sb = new FakeSupabase();
    installErrorLogger(sb, {});
    const handler = w.listeners.unhandledrejection[0];
    handler({ reason: Object.assign(new Error('rejected'), { stack: 'Error: rejected\n    at bar' }) });
    await flush();
    assert.equal(sb.rows.length, 1);
    const row = sb.rows[0].row;
    assert.equal(row.source, 'unhandledrejection');
    assert.equal(row.message, 'rejected');
    assert.match(row.stack, /rejected/);
    assert.equal(row.lineno, null);
    assert.equal(row.colno, null);
  } finally { w.restore(); }
});

test('unhandledrejection with primitive reason coerces to string', async () => {
  _resetErrorLoggerForTests();
  const w = installWindowStub();
  try {
    const sb = new FakeSupabase();
    installErrorLogger(sb, {});
    w.listeners.unhandledrejection[0]({ reason: 'plain string oops' });
    await flush();
    assert.equal(sb.rows.length, 1);
    assert.equal(sb.rows[0].row.message, 'plain string oops');
    assert.equal(sb.rows[0].row.stack, null);
  } finally { w.restore(); }
});

test('dedupe: identical error twice results in only one row', async () => {
  _resetErrorLoggerForTests();
  const w = installWindowStub();
  try {
    const sb = new FakeSupabase();
    installErrorLogger(sb, {});
    const handler = w.listeners.error[0];
    const ev = { error: Object.assign(new Error('dup'), { stack: 'Error: dup\n    at same' }) };
    handler(ev);
    handler(ev);
    handler(ev);
    await flush();
    assert.equal(sb.rows.length, 1);
  } finally { w.restore(); }
});

test('dedupe: different messages are not deduped', async () => {
  _resetErrorLoggerForTests();
  const w = installWindowStub();
  try {
    const sb = new FakeSupabase();
    installErrorLogger(sb, {});
    const handler = w.listeners.error[0];
    handler({ error: new Error('alpha') });
    handler({ error: new Error('beta') });
    handler({ error: new Error('gamma') });
    await flush();
    assert.equal(sb.rows.length, 3);
  } finally { w.restore(); }
});

test('per-session cap: at most 25 rows are ever POSTed', async () => {
  _resetErrorLoggerForTests();
  const w = installWindowStub();
  try {
    const sb = new FakeSupabase();
    installErrorLogger(sb, {});
    const handler = w.listeners.error[0];
    for (let i = 0; i < 50; i++) {
      handler({ error: new Error('uniq-' + i) });
    }
    await flush();
    assert.equal(sb.rows.length, 25);
  } finally { w.restore(); }
});

test('getUserId is called and its return value is stored in user_id', async () => {
  _resetErrorLoggerForTests();
  const w = installWindowStub();
  try {
    const sb = new FakeSupabase();
    installErrorLogger(sb, { getUserId: () => 'user-abc' });
    w.listeners.error[0]({ error: new Error('with-user') });
    await flush();
    assert.equal(sb.rows[0].row.user_id, 'user-abc');
  } finally { w.restore(); }
});

test('getUserId that throws is swallowed; row still sent with null user_id', async () => {
  _resetErrorLoggerForTests();
  const w = installWindowStub();
  try {
    const sb = new FakeSupabase();
    installErrorLogger(sb, { getUserId: () => { throw new Error('no auth'); } });
    w.listeners.error[0]({ error: new Error('uid-throws') });
    await flush();
    assert.equal(sb.rows.length, 1);
    assert.equal(sb.rows[0].row.user_id, null);
  } finally { w.restore(); }
});

test('sb.insert throwing is swallowed and does not recurse', async () => {
  _resetErrorLoggerForTests();
  const w = installWindowStub();
  try {
    const sb = new FakeSupabase({ throwOnInsert: true });
    installErrorLogger(sb, {});
    const handler = w.listeners.error[0];
    handler({ error: new Error('insert-throws') });
    await flush();
    assert.equal(sb.rows.length, 0); // throwOnInsert never records
  } finally { w.restore(); }
});

test('long messages / stacks / urls are clipped', async () => {
  _resetErrorLoggerForTests();
  const w = installWindowStub();
  globalThis.location.href = 'https://example.test/' + 'x'.repeat(2000);
  try {
    const sb = new FakeSupabase();
    installErrorLogger(sb, {});
    w.listeners.error[0]({
      error: Object.assign(new Error('m'.repeat(2000)), { stack: 's'.repeat(10000) }),
    });
    await flush();
    const row = sb.rows[0].row;
    assert.ok(row.message.length <= 500, 'message clipped to 500');
    assert.ok(row.stack.length <= 4000, 'stack clipped to 4000');
    assert.ok(row.url.length <= 500, 'url clipped to 500');
  } finally { w.restore(); }
});

test('logErrorManually sends a source="manual" row', async () => {
  _resetErrorLoggerForTests();
  const w = installWindowStub();
  try {
    const sb = new FakeSupabase();
    installErrorLogger(sb, {});
    logErrorManually(new Error('hand-logged'), { entryId: 42 });
    await flush();
    assert.equal(sb.rows.length, 1);
    assert.equal(sb.rows[0].row.source, 'manual');
    assert.equal(sb.rows[0].row.message, 'hand-logged');
    assert.deepEqual(sb.rows[0].row.extra, { entryId: 42 });
  } finally { w.restore(); }
});

test('logErrorManually on a primitive coerces to string', async () => {
  _resetErrorLoggerForTests();
  const w = installWindowStub();
  try {
    const sb = new FakeSupabase();
    installErrorLogger(sb, {});
    logErrorManually('just a string');
    await flush();
    assert.equal(sb.rows[0].row.message, 'just a string');
    assert.equal(sb.rows[0].row.stack, null);
  } finally { w.restore(); }
});

test('no Supabase client → silent no-op (no crash)', async () => {
  _resetErrorLoggerForTests();
  const w = installWindowStub();
  try {
    installErrorLogger(null, {});
    w.listeners.error[0]({ error: new Error('nobody home') });
    await flush();
    // Nothing to assert beyond "it did not throw".
    assert.ok(true);
  } finally { w.restore(); }
});

test('_resetErrorLoggerForTests removes listeners and resets counters', async () => {
  _resetErrorLoggerForTests();
  const w = installWindowStub();
  try {
    const sb = new FakeSupabase();
    installErrorLogger(sb, {});
    assert.equal(w.listeners.error.length, 1);
    _resetErrorLoggerForTests();
    assert.equal(w.listeners.error.length, 0);
    assert.equal(w.listeners.unhandledrejection.length, 0);
    // After reset we can install again fresh.
    const sb2 = new FakeSupabase();
    installErrorLogger(sb2, {});
    w.listeners.error[0]({ error: new Error('post-reset') });
    await flush();
    assert.equal(sb2.rows.length, 1);
  } finally { w.restore(); }
});
