const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'index.html');
let s = fs.readFileSync(p, 'utf8');
const re = /onclick="openLightbox\('([^']+)',(\d+)\)"/g;
let n = 0;
s = s.replace(re, (_, key, idx) => {
  n++;
  return `tabindex="0" role="button" data-fl-action="open-lightbox" data-lb-key="${key}" data-lb-idx="${idx}"`;
});
fs.writeFileSync(p, s, 'utf8');
console.log('replacements', n);
