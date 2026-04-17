/**
 * Lengthen short multiple-choice *wrong* distractors in questions.js so they are
 * closer in length/plausibility to the correct option. Does not change stems,
 * explanations, correctIndex, or correct-option text.
 *
 * Uses pattern-based phrasing (not “exam/meta” tails). Preserves // comments.
 *
 * Run: node scripts/enhance-deer-distractors.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const QUESTIONS_PATH = path.join(ROOT, 'questions.js');

function pick(arr, bankIdx, optIdx) {
  return arr[(bankIdx * 13 + optIdx * 19) % arr.length];
}

function needsWork(wLen, cLen) {
  if (cLen < 52) return false;
  if (wLen >= 50) return false;
  if (wLen >= cLen * 0.52) return false;
  return true;
}

function looksLikeFullSentence(ws) {
  return (
    /^(They|She|He|It|We|You|I)\s+\w+/i.test(ws) &&
    (ws.split(/\s+/).length >= 5 || ws.length > 48)
  );
}

function expandWrong(w, q, bankIdx, optIdx) {
  const ws = String(w).trim();
  const stem = q.question;
  const ci = q.correctIndex;
  const cLen = String(q.options[ci]).length;
  const wLen = ws.length;
  if (!needsWork(wLen, cLen)) return w;
  if (looksLikeFullSentence(ws)) return w;

  const tailsToAnatomy = [
    ', whereas in deer that function is associated with other glands or tissues, not the structure named in the question',
    ', whereas that role is served elsewhere in the body — not by the structure referenced in the question',
    ', whereas the physiology involved is usually credited to a different organ or gland system',
  ];
  const tailsToBehaviour = [
    ', a motive sometimes suggested, though not the main reason described for this behaviour',
    ', not the primary explanation usually given for this behaviour in UK deer biology',
    ', a secondary association that is not the chief reason in the usual textbook account',
  ];
  const tailsYesNo = [
    ' — that interpretation does not match how the Deer Acts and related guidance are usually applied',
    ' — that reading is not how the statutory tests for lawful shooting are usually stated',
    ' — the legal position is narrower than this wording suggests',
  ];
  /** Only for Identification — never use on Fieldcraft, Safety, Legislation, etc. */
  const tailsShortIdentification = [
    ' — a frequent mix-up when similar species or coat stages are compared without a full view',
    ' — plausible at a glance but not the usual identification answer in UK deer reference material',
    ' — often confused with a neighbouring species or coat type in poor light or at distance',
  ];
  const tailsShortGeneral = [
    ' — often repeated in the field but not the best match on the facts',
    ' — believable in a quick discussion, but not the point qualified teaching stresses',
  ];
  const tailsGeneric = [
    ' — not the factor or pairing that best matches the detail in the question',
    ' — does not line up with the usual textbook account for this situation',
  ];

  const stemIsAnatomy =
    /gland|organ|hormone|digest|teeth|incisor|muscle|lung|liver|heart|physiology|biological|anatom|function of the/i.test(
      stem
    );
  const wrongIsAnatomy = /tear|temperature|digest|hormone|gland|blood|bone/i.test(ws);

  if (/^To\s+/i.test(ws)) {
    const isBehaviourTo = /^To\s+(hide|escape|find|roll|keep)\b/i.test(ws);
    const useAnatomy = !isBehaviourTo && (stemIsAnatomy || wrongIsAnatomy);
    const pool = useAnatomy ? tailsToAnatomy : tailsToBehaviour;
    return ws.replace(/\.$/, '') + pick(pool, bankIdx, optIdx);
  }
  if (/^(Yes|No),/i.test(ws)) {
    return ws + pick(tailsYesNo, bankIdx, optIdx);
  }
  const words = ws.split(/\s+/);
  if (words.length <= 5 && ws.length <= 44) {
    const pool = q.category === 'Identification' ? tailsShortIdentification : tailsShortGeneral;
    return ws + pick(pool, bankIdx, optIdx);
  }
  return ws + pick(tailsGeneric, bankIdx, optIdx);
}

function enhanceQuestion(q, bankIdx) {
  const ci = q.correctIndex;
  const newOpts = q.options.map((opt, i) => {
    if (i === ci) return opt;
    return expandWrong(opt, q, bankIdx, i);
  });
  return { ...q, options: newOpts };
}

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

    throw new Error(
      'Unexpected content in bank at offset ' + pos + ': ' + JSON.stringify(inner.slice(pos, pos + 80))
    );
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

function main() {
  const raw = fs.readFileSync(QUESTIONS_PATH, 'utf8');
  const marker = 'const QUESTION_BANK = ';
  const start = raw.indexOf(marker);
  if (start === -1) throw new Error('Could not find QUESTION_BANK');
  const openBracket = raw.indexOf('[', start);
  const closeBracket = findMatchingBracket(raw, openBracket);

  const inner = raw.slice(openBracket + 1, closeBracket);
  const items = parseBankInner(inner);
  const questions = items.filter((x) => x.type === 'q').map((x) => x.obj);
  if (questions.length !== 330) {
    throw new Error('Expected 330 questions, got ' + questions.length);
  }

  let changedRows = 0;
  let qi = 0;
  for (const it of items) {
    if (it.type !== 'q') continue;
    const before = JSON.stringify(it.obj.options);
    const next = enhanceQuestion(it.obj, qi);
    if (JSON.stringify(next.options) !== before) changedRows++;
    it.obj = next;
    qi++;
  }

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
  const newFile = before + '\n' + innerOut + after;

  fs.writeFileSync(QUESTIONS_PATH, newFile, 'utf8');
  console.log('OK: 330 questions | rows with at least one expanded wrong option:', changedRows);
}

main();
