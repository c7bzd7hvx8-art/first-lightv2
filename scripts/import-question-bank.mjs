/**
 * Merge an exported JSON (e.g. exports/deer-school-question-bank-improved.json)
 * into questions.js, preserving // section comments inside QUESTION_BANK.
 *
 * Usage: node scripts/import-question-bank.mjs [path/to/file.json]
 * Default: ../exports/deer-school-question-bank-improved.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const QUESTIONS_PATH = path.join(ROOT, 'questions.js');
const DEFAULT_JSON = path.join(ROOT, 'exports', 'deer-school-question-bank-improved.json');

function findMatchingBrace(src, openPos) {
  let i = openPos;
  if (src[i] !== '{') throw new Error('expected {');
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === '\\') {
        escaped = true;
        continue;
      }
      if (c === '"') {
        inStr = false;
        continue;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error('unclosed {');
}

function findMatchingBracket(src, openPos) {
  if (src[openPos] !== '[') throw new Error('expected [');
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = openPos; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === '\\') {
        escaped = true;
        continue;
      }
      if (c === '"') {
        inStr = false;
        continue;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '[') depth++;
    if (c === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error('unclosed [');
}

function parseBankInner(inner) {
  const items = [];
  let pos = 0;
  while (pos < inner.length) {
    while (pos < inner.length && /\s/.test(inner[pos])) pos++;
    if (pos >= inner.length) break;
    if (inner.slice(pos, pos + 2) === '//') {
      const endLine = inner.indexOf('\n', pos);
      const end = endLine === -1 ? inner.length : endLine;
      items.push({ type: 'comment', text: inner.slice(pos, end) });
      pos = endLine === -1 ? inner.length : endLine + 1;
      continue;
    }
    if (inner[pos] === '{') {
      const endBrace = findMatchingBrace(inner, pos);
      const objStr = inner.slice(pos, endBrace + 1);
      const obj = new Function('return ' + objStr)();
      items.push({ type: 'q', obj });
      pos = endBrace + 1;
      while (pos < inner.length && /\s/.test(inner[pos])) pos++;
      if (inner[pos] === ',') pos++;
      continue;
    }
    if (inner[pos] === ',') {
      pos++;
      continue;
    }
    throw new Error('parse error at ' + pos);
  }
  return items;
}

function serializeQuestion(q) {
  return (
    '{' +
    'category:' +
    JSON.stringify(q.category) +
    ',question:' +
    JSON.stringify(q.question) +
    ',options:' +
    JSON.stringify(q.options) +
    ',correctIndex:' +
    q.correctIndex +
    ',explanation:' +
    JSON.stringify(q.explanation) +
    '}'
  );
}

function validateAndBuild(entry) {
  const idx = entry.index;
  if (!Array.isArray(entry.options) || entry.options.length !== 4) {
    throw new Error(`Question ${idx}: options must be an array of 4 strings`);
  }
  const ci = Number(entry.correctIndex);
  if (!Number.isInteger(ci) || ci < 0 || ci > 3) {
    throw new Error(`Question ${idx}: correctIndex must be 0–3, got ${entry.correctIndex}`);
  }
  const optAt = String(entry.options[ci]);
  if (entry.correctAnswer != null && String(entry.correctAnswer) !== optAt) {
    console.warn(
      `Question ${idx}: correctAnswer text does not match options[correctIndex]; using options[correctIndex].`
    );
  }
  return {
    category: String(entry.category),
    question: String(entry.question),
    options: entry.options.map((o) => String(o)),
    correctIndex: ci,
    explanation: String(entry.explanation),
  };
}

function main() {
  const jsonPath = path.resolve(ROOT, process.argv[2] || DEFAULT_JSON);
  if (!fs.existsSync(jsonPath)) {
    console.error('File not found:', jsonPath);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const list = payload.questions;
  if (!Array.isArray(list) || list.length !== 330) {
    throw new Error(`Expected 330 questions, got ${list?.length}`);
  }
  for (let i = 0; i < 330; i++) {
    if (list[i].index !== i) {
      console.warn(`Question array position ${i} has index ${list[i].index}; merging by array order.`);
    }
  }

  const bank = list.map((e, i) => {
    const x = { ...e, index: i };
    return validateAndBuild(x);
  });

  const raw = fs.readFileSync(QUESTIONS_PATH, 'utf8');
  const marker = 'const QUESTION_BANK = ';
  const start = raw.indexOf(marker);
  if (start === -1) throw new Error('QUESTION_BANK not found');
  const openBracket = raw.indexOf('[', start);
  const closeBracket = findMatchingBracket(raw, openBracket);
  const inner = raw.slice(openBracket + 1, closeBracket);
  const items = parseBankInner(inner);

  let qi = 0;
  for (const it of items) {
    if (it.type !== 'q') continue;
    if (qi >= bank.length) throw new Error('More question slots in questions.js than imported bank');
    it.obj = bank[qi++];
  }
  if (qi !== 330) throw new Error(`Imported ${qi} questions; expected 330`);

  let innerOut = '';
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    if (it.type === 'comment') {
      innerOut += it.text + '\n';
      continue;
    }
    innerOut += '  ' + serializeQuestion(it.obj);
    if (k < items.length - 1) innerOut += ',';
    innerOut += '\n';
  }

  const before = raw.slice(0, openBracket + 1);
  const after = raw.slice(closeBracket);
  fs.writeFileSync(QUESTIONS_PATH, before + '\n' + innerOut + after, 'utf8');
  console.log('OK: wrote', QUESTIONS_PATH, 'from', jsonPath);
}

main();
