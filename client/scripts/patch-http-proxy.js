const fs = require('fs');
const path = require('path');

function safeReplace(file, from, to) {
  try {
    const p = path.resolve(__dirname, '..', 'node_modules', 'http-proxy', 'lib', 'http-proxy', file);
    if (!fs.existsSync(p)) return;
    const src = fs.readFileSync(p, 'utf8');
    const next = src.replace(from, to);
    if (src !== next) {
      fs.writeFileSync(p, next, 'utf8');
      console.log(`[patch-http-proxy] Patched ${file}`);
    } else {
      console.log(`[patch-http-proxy] No changes needed for ${file}`);
    }
  } catch (e) {
    console.warn(`[patch-http-proxy] Failed to patch ${file}:`, e.message);
  }
}

// Replace require('util')._extend with Object.assign
safeReplace('index.js', "require('util')._extend", 'Object.assign');
safeReplace('common.js', "require('util')._extend", 'Object.assign');
