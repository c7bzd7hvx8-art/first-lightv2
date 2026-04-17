// =============================================================================
// Tests for modules/profile.mjs
//
// Pure validators — no DOM, no Supabase — so these are straight input/output
// assertions using node:test + assert/strict.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateDisplayName,
  validatePasswordChange,
  PROFILE_LIMITS,
} from '../modules/profile.mjs';

// ── validateDisplayName ─────────────────────────────────────────────────────

test('validateDisplayName: typical names pass through', () => {
  for (const n of ['John Smith', 'Jo', 'Anne-Marie', 'O\'Brien', 'Dr. Smith']) {
    const r = validateDisplayName(n);
    assert.equal(r.ok, true, 'expected ok for ' + JSON.stringify(n));
    assert.equal(r.value, n);
  }
});

test('validateDisplayName: trims surrounding whitespace', () => {
  const r = validateDisplayName('   John Smith   ');
  assert.equal(r.ok, true);
  assert.equal(r.value, 'John Smith');
});

test('validateDisplayName: collapses internal runs of whitespace', () => {
  const r = validateDisplayName('John    Smith\t\tJr');
  assert.equal(r.ok, true);
  assert.equal(r.value, 'John Smith Jr');
});

test('validateDisplayName: accepts non-ASCII letters (\\p{L})', () => {
  for (const n of ['José', 'François', 'Siân', '李明']) {
    const r = validateDisplayName(n);
    assert.equal(r.ok, true, 'expected ok for ' + n);
  }
});

test('validateDisplayName: rejects empty / whitespace-only', () => {
  for (const n of ['', '   ', null, undefined]) {
    const r = validateDisplayName(n);
    assert.equal(r.ok, false);
    assert.match(r.error, /enter your name/i);
  }
});

test('validateDisplayName: rejects single char (below NAME_MIN)', () => {
  const r = validateDisplayName('J');
  assert.equal(r.ok, false);
  assert.match(r.error, /at least 2 characters/);
});

test('validateDisplayName: rejects over NAME_MAX chars', () => {
  const r = validateDisplayName('x'.repeat(61));
  assert.equal(r.ok, false);
  assert.match(r.error, /60 characters or fewer/);
});

test('validateDisplayName: accepts exactly NAME_MAX chars', () => {
  const r = validateDisplayName('x'.repeat(60));
  assert.equal(r.ok, true);
});

test('validateDisplayName: rejects disallowed punctuation (@ ! $)', () => {
  for (const n of ['John@Smith', 'Boom!', 'Cash$Money']) {
    const r = validateDisplayName(n);
    assert.equal(r.ok, false, 'expected error for ' + n);
    assert.match(r.error, /letters, numbers, spaces/);
  }
});

test('validateDisplayName: rejects punctuation-only even if chars pass the allow-list', () => {
  for (const n of ['...', '---', '\' \'']) {
    const r = validateDisplayName(n);
    assert.equal(r.ok, false, 'expected error for ' + JSON.stringify(n));
    assert.match(r.error, /at least one letter/);
  }
});

// ── validatePasswordChange ─────────────────────────────────────────────────

test('validatePasswordChange: happy path', () => {
  const r = validatePasswordChange('oldpass1', 'newpass1', 'newpass1');
  assert.equal(r.ok, true);
});

test('validatePasswordChange: empty current / next / confirm each fail with own message', () => {
  const a = validatePasswordChange('', 'newpass1', 'newpass1');
  assert.equal(a.ok, false);
  assert.match(a.error, /current password/);

  const b = validatePasswordChange('oldpass1', '', 'newpass1');
  assert.equal(b.ok, false);
  assert.match(b.error, /new password/i);

  const c = validatePasswordChange('oldpass1', 'newpass1', '');
  assert.equal(c.ok, false);
  assert.match(c.error, /confirm/i);
});

test('validatePasswordChange: rejects new password shorter than PW_MIN', () => {
  const r = validatePasswordChange('oldpass1', 'short', 'short');
  assert.equal(r.ok, false);
  assert.match(r.error, /at least 8 characters/);
});

test('validatePasswordChange: rejects when new equals current', () => {
  const r = validatePasswordChange('samepass', 'samepass', 'samepass');
  assert.equal(r.ok, false);
  assert.match(r.error, /different from the current/);
});

test('validatePasswordChange: rejects confirm mismatch', () => {
  const r = validatePasswordChange('oldpass1', 'newpass1', 'newpass2');
  assert.equal(r.ok, false);
  assert.match(r.error, /do not match/);
});

test('PROFILE_LIMITS mirrors the internal constants (frozen)', () => {
  assert.equal(PROFILE_LIMITS.NAME_MIN, 2);
  assert.equal(PROFILE_LIMITS.NAME_MAX, 60);
  assert.equal(PROFILE_LIMITS.PW_MIN, 8);
  assert.equal(Object.isFrozen(PROFILE_LIMITS), true);
});
