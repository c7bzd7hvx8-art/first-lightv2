#!/usr/bin/env node
/**
 * Validates scripts/supabase-audit-rls-snapshot.json structure and coverage.
 * Optional: --max-age-days=N fails if _meta.captured is older than N days (UTC).
 *
 * Usage:
 *   node scripts/validate-rls-snapshot.mjs
 *   node scripts/validate-rls-snapshot.mjs --max-age-days=75
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, 'supabase-audit-rls-snapshot.json');

/** Must match tables listed in supabase-rls-audit-queries.sql */
const REQUIRED_PUBLIC_TABLES = [
  'cull_entries',
  'cull_targets',
  'grounds',
  'ground_targets',
  'syndicates',
  'syndicate_members',
  'syndicate_invites',
  'syndicate_targets',
  'syndicate_member_allocations',
  'syndicate_anonymous_culls',
];

function fail(msg) {
  console.error('validate-rls-snapshot:', msg);
  process.exit(1);
}

function parseMaxAgeDays(argv) {
  var a = argv.find(function(x) { return x.indexOf('--max-age-days=') === 0; });
  if (!a) return null;
  var n = parseInt(a.split('=')[1], 10);
  if (isNaN(n) || n < 1) fail('Invalid --max-age-days (use positive integer, e.g. --max-age-days=75)');
  return n;
}

function ageDaysCaptured(capturedStr) {
  if (!capturedStr || typeof capturedStr !== 'string') return null;
  var d = new Date(capturedStr + 'T12:00:00Z');
  if (isNaN(d.getTime())) return null;
  var now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (86400 * 1000));
}

var maxAgeDays = parseMaxAgeDays(process.argv.slice(2));

var raw;
try {
  raw = readFileSync(SNAPSHOT_PATH, 'utf8');
} catch (e) {
  fail('Cannot read ' + SNAPSHOT_PATH + ': ' + (e && e.message));
}

var data;
try {
  data = JSON.parse(raw);
} catch (e) {
  fail('Invalid JSON: ' + (e && e.message));
}

if (!data._meta || typeof data._meta !== 'object') fail('Missing _meta object');
if (!data._meta.captured || typeof data._meta.captured !== 'string') {
  fail('Missing _meta.captured (ISO date YYYY-MM-DD)');
}

if (maxAgeDays != null) {
  var age = ageDaysCaptured(data._meta.captured);
  if (age == null) fail('Could not parse _meta.captured as a date: ' + data._meta.captured);
  if (age > maxAgeDays) {
    fail(
      'Snapshot is stale: _meta.captured is ' + data._meta.captured + ' (~' + age + ' days old). ' +
      'Max allowed: ' + maxAgeDays + ' days. Re-run scripts/supabase-rls-audit-queries.sql in Supabase SQL Editor, update supabase-audit-rls-snapshot.json, set _meta.captured to today.'
    );
  }
}

if (!Array.isArray(data.rls_enabled_by_table)) fail('Missing or invalid rls_enabled_by_table array');
if (!Array.isArray(data.public_policies)) fail('Missing or invalid public_policies array');
if (!Array.isArray(data.storage_policies)) fail('Missing or invalid storage_policies array');

var rlsMap = {};
data.rls_enabled_by_table.forEach(function(row) {
  if (row && row.table_name) rlsMap[row.table_name] = row;
});

REQUIRED_PUBLIC_TABLES.forEach(function(t) {
  var row = rlsMap[t];
  if (!row) fail('RLS inventory missing table: ' + t);
  if (row.rls_enabled !== true) fail('RLS must be enabled for ' + t + ' (got rls_enabled=' + JSON.stringify(row.rls_enabled) + ')');
});

var policyCountByTable = {};
data.public_policies.forEach(function(p) {
  if (!p || !p.tablename) return;
  policyCountByTable[p.tablename] = (policyCountByTable[p.tablename] || 0) + 1;
});

REQUIRED_PUBLIC_TABLES.forEach(function(t) {
  var n = policyCountByTable[t] || 0;
  if (n < 1) fail('public_policies has no rows for table: ' + t);
});

if (data.storage_policies.length < 1) {
  fail('storage_policies is empty (expected cull-photos policies on storage.objects)');
}

var storageText = JSON.stringify(data.storage_policies);
if (storageText.indexOf('cull-photos') === -1) {
  fail('storage_policies JSON does not mention cull-photos bucket (unexpected drift)');
}

console.log('validate-rls-snapshot: OK (' + REQUIRED_PUBLIC_TABLES.length + ' public tables, ' +
  data.public_policies.length + ' public policies, ' + data.storage_policies.length + ' storage policies)' +
  (maxAgeDays != null ? ', captured ' + data._meta.captured + ' within ' + maxAgeDays + 'd' : '') + ')');
