// =============================================================================
// Tests for modules/photos.mjs
//
// Runtime: Node's built-in test runner + assert/strict. Zero dependencies.
//
// Run:
//   node --test tests/
//   npm test
//
// Scope: the four pure / pure-JS helpers. `compressPhotoFile` is *not*
// covered here — it depends on Image, Canvas, FileReader, and URL.createObjectURL
// which only exist in a browser. It's exercised by the diary.js smoke test
// (pick a photo, confirm the "Photo ready · NNN KB" toast).
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CULL_PHOTO_SIGN_EXPIRES,
  newCullPhotoPath,
  cullPhotoStoragePath,
  dataUrlToBlob
} from '../modules/photos.mjs';

// ── CULL_PHOTO_SIGN_EXPIRES ────────────────────────────────────────────────
test('CULL_PHOTO_SIGN_EXPIRES is 24 hours (86400 seconds)', () => {
  assert.equal(CULL_PHOTO_SIGN_EXPIRES, 86400);
  assert.equal(CULL_PHOTO_SIGN_EXPIRES, 24 * 60 * 60);
});

// ── newCullPhotoPath ───────────────────────────────────────────────────────
test('newCullPhotoPath returns "<userId>/<ms>-<rand>.jpg" shape', () => {
  const path = newCullPhotoPath('abc123');
  assert.match(path, /^abc123\/\d+-[a-z0-9]+\.jpg$/);
});

test('newCullPhotoPath includes the userId prefix', () => {
  const uid = '12345678-1234-1234-1234-123456789abc';
  const path = newCullPhotoPath(uid);
  assert.ok(path.startsWith(uid + '/'));
});

test('newCullPhotoPath avoids collision within one millisecond', () => {
  // 100 calls in the same tick should all produce distinct paths thanks to
  // the random 6-char suffix. A collision here would mean the suffix is
  // degenerate or Date.now() jitter is the only thing saving us.
  const paths = new Set();
  for (let i = 0; i < 100; i++) paths.add(newCullPhotoPath('u'));
  assert.equal(paths.size, 100);
});

test('newCullPhotoPath uses the current ms (sanity)', () => {
  const before = Date.now();
  const path = newCullPhotoPath('u');
  const after = Date.now();
  const ms = parseInt(path.match(/u\/(\d+)-/)[1], 10);
  assert.ok(ms >= before && ms <= after, `ms=${ms} not within [${before},${after}]`);
});

// ── cullPhotoStoragePath ───────────────────────────────────────────────────
test('cullPhotoStoragePath passes through a bucket-relative path', () => {
  const p = '12345678-1234-1234-1234-123456789abc/1700000000000-abcdef.jpg';
  assert.equal(cullPhotoStoragePath(p), p);
});

test('cullPhotoStoragePath extracts path from a signed URL', () => {
  const url = 'https://project.supabase.co/storage/v1/object/sign/cull-photos/uid-123/file.jpg?token=xyz';
  assert.equal(cullPhotoStoragePath(url), 'uid-123/file.jpg');
});

test('cullPhotoStoragePath extracts path from a public URL', () => {
  const url = 'https://project.supabase.co/storage/v1/object/public/cull-photos/uid-456/photo.jpg';
  assert.equal(cullPhotoStoragePath(url), 'uid-456/photo.jpg');
});

test('cullPhotoStoragePath url-decodes the extracted segment', () => {
  const url = 'https://project.supabase.co/storage/v1/object/sign/cull-photos/uid/a%20b.jpg?t=1';
  assert.equal(cullPhotoStoragePath(url), 'uid/a b.jpg');
});

test('cullPhotoStoragePath returns null for null/empty/non-string', () => {
  assert.equal(cullPhotoStoragePath(null), null);
  assert.equal(cullPhotoStoragePath(undefined), null);
  assert.equal(cullPhotoStoragePath(''), null);
  assert.equal(cullPhotoStoragePath('   '), null);
  assert.equal(cullPhotoStoragePath(123), null);
});

test('cullPhotoStoragePath returns null for a URL without cull-photos segment', () => {
  assert.equal(cullPhotoStoragePath('https://example.com/some/file.jpg'), null);
});

test('cullPhotoStoragePath returns null for a non-URL, non-UUID-prefixed string', () => {
  assert.equal(cullPhotoStoragePath('random garbage'), null);
  assert.equal(cullPhotoStoragePath('not-a-uuid/file.jpg'), null);
});

// ── dataUrlToBlob ──────────────────────────────────────────────────────────
// Needs Node 18+ (Blob, atob, Uint8Array are all global). We test the
// round-trip: known bytes → base64 data URL → Blob → bytes.

test('dataUrlToBlob round-trips a known JPEG header (FFD8 FFE0)', async () => {
  const bytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
  const b64 = Buffer.from(bytes).toString('base64');
  const dataUrl = 'data:image/jpeg;base64,' + b64;

  const blob = dataUrlToBlob(dataUrl);
  assert.equal(blob.type, 'image/jpeg');
  assert.equal(blob.size, bytes.length);

  const roundTripped = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual(Array.from(roundTripped), Array.from(bytes));
});

test('dataUrlToBlob preserves MIME from the header', () => {
  const dataUrl = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4E, 0x47]).toString('base64');
  const blob = dataUrlToBlob(dataUrl);
  assert.equal(blob.type, 'image/png');
});

test('dataUrlToBlob throws on malformed input', () => {
  assert.throws(() => dataUrlToBlob(null),           /Malformed/);
  assert.throws(() => dataUrlToBlob(''),             /Malformed/);
  assert.throws(() => dataUrlToBlob('not a data url'), /Malformed/);
  assert.throws(() => dataUrlToBlob('data:image/jpeg;base64'),  /Malformed/); // no comma / payload
  assert.throws(() => dataUrlToBlob('data:,hello'),  /Malformed/);           // no mime
});
