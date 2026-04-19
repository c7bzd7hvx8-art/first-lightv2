/**
 * Recreate a deploy folder with all static files needed for web hosting.
 * Run from repo root:
 *   node scripts/build-betav2.mjs           → ../betav2/
 *   node scripts/build-betav2.mjs beta_v2  → ../beta_v2/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = process.argv[2] || 'betav2';
const DEST = path.join(ROOT, OUT_DIR);

const ROOT_FILES = [
  'index.html',
  'styles.css',
  'app.js',
  'diary.html',
  'diary.css',
  'diary.js',
  'sw.js',
  'questions.js',
  'deerschool.html',
  'deerschool.css',
  'deerschool.js',
  'privacy.html',
  'terms.html',
  'diary-guide.html',
  'manifest.json',
  'manifest-diary.json',
  'icon-152.png',
  'icon-167.png',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
];

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function cp(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, name.name);
    const d = path.join(dst, name.name);
    if (name.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function main() {
  const readmePath = path.join(DEST, 'README.md');
  let readmeBackup = null;
  try {
    readmeBackup = fs.readFileSync(readmePath, 'utf8');
  } catch {
    /* first run */
  }

  rmrf(DEST);
  fs.mkdirSync(DEST, { recursive: true });

  for (const f of ROOT_FILES) {
    cp(path.join(ROOT, f), path.join(DEST, f));
  }

  copyDir(path.join(ROOT, 'modules'), path.join(DEST, 'modules'));
  fs.mkdirSync(path.join(DEST, 'lib'), { recursive: true });
  cp(path.join(ROOT, 'lib', 'fl-pure.mjs'), path.join(DEST, 'lib', 'fl-pure.mjs'));
  copyDir(path.join(ROOT, 'vendor'), path.join(DEST, 'vendor'));

  const speciesDir = path.join(ROOT, 'species');
  if (fs.existsSync(speciesDir)) {
    copyDir(speciesDir, path.join(DEST, 'species'));
  }

  if (readmeBackup) {
    fs.writeFileSync(path.join(DEST, 'README.md'), readmeBackup, 'utf8');
  }

  let n = 0;
  function count(dir) {
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, name.name);
      if (name.isDirectory()) count(p);
      else n++;
    }
  }
  count(DEST);
  console.log('OK:', DEST, '| files:', n, '| out:', OUT_DIR);
}

main();
