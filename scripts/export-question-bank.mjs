/**
 * Export QUESTION_BANK from ../questions.js to ../exports/
 * Run: node scripts/export-question-bank.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const QUESTIONS_PATH = path.join(ROOT, 'questions.js');
const OUT_DIR = path.join(ROOT, 'exports');

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

function main() {
  const raw = fs.readFileSync(QUESTIONS_PATH, 'utf8');
  const start = raw.indexOf('const QUESTION_BANK = ');
  if (start === -1) throw new Error('QUESTION_BANK not found');
  const openBracket = raw.indexOf('[', start);
  const closeBracket = findMatchingBracket(raw, openBracket);
  const inner = raw.slice(openBracket + 1, closeBracket);
  const items = parseBankInner(inner);
  const bank = items.filter((x) => x.type === 'q').map((x) => x.obj);

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const stamp = new Date().toISOString().slice(0, 10);
  const payload = {
    exportVersion: 1,
    exported: stamp,
    sourceFile: 'questions.js',
    count: bank.length,
    note:
      'Each item: index is 0-based position in QUESTION_BANK. correctIndex 0–3 maps to options A–D in bank order (deerschool may shuffle at runtime). When returning edits, keep index order or specify how to merge.',
    questions: bank.map((q, index) => ({
      index,
      category: q.category,
      question: q.question,
      options: [...q.options],
      optionLabels: ['A', 'B', 'C', 'D'],
      correctIndex: q.correctIndex,
      correctAnswer: q.options[q.correctIndex],
      explanation: q.explanation,
    })),
  };

  const jsonPath = path.join(OUT_DIR, 'deer-school-question-bank.json');
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');

  let md = `# Deer School — full question bank export\n\n`;
  md += `Generated: ${stamp} · ${bank.length} questions · source: \`questions.js\`\n\n`;
  md += `Option letters A–D follow **bank order** (quiz UI may shuffle).\n\n---\n\n`;

  for (const q of payload.questions) {
    md += `## Q${q.index + 1} (${q.category})\n\n`;
    md += `**Stem:** ${q.question}\n\n`;
    ['A', 'B', 'C', 'D'].forEach((L, i) => {
      const mark = i === q.correctIndex ? ' ✓ **CORRECT**' : '';
      md += `- **${L}.** ${q.options[i]}${mark}\n`;
    });
    md += `\n**Explanation:** ${q.explanation}\n\n---\n\n`;
  }

  const mdPath = path.join(OUT_DIR, 'deer-school-question-bank.md');
  fs.writeFileSync(mdPath, md, 'utf8');

  console.log('Wrote:', jsonPath);
  console.log('Wrote:', mdPath);
  console.log('Questions:', bank.length);
}

main();
