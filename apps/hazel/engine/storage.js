'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi']);
const ARCHIVE_DIRNAME = '_hazel-archive';

function summarizeUsage(files) {
  const list = Array.isArray(files) ? files : [];
  const byExt = new Map();
  let totalBytes = 0;

  for (const f of list) {
    const size = f.size || 0;
    totalBytes += size;
    const ext = (path.extname(f.path) || '').toLowerCase() || '(none)';
    const agg = byExt.get(ext) || { ext, count: 0, bytes: 0 };
    agg.count += 1;
    agg.bytes += size;
    byExt.set(ext, agg);
  }

  return {
    count: list.length,
    totalBytes,
    byExt: [...byExt.values()].sort((a, b) => b.bytes - a.bytes)
  };
}

// Fast content signature: size + first/last chunk. Good enough to spot
// duplicate raws without hashing multi-GB files end to end.
function signature(file, opts = {}) {
  const chunk = opts.chunk || 1024 * 1024;
  const size = fs.statSync(file).size;
  const fd = fs.openSync(file, 'r');
  try {
    const headLen = Math.min(chunk, size);
    const head = Buffer.alloc(headLen);
    fs.readSync(fd, head, 0, headLen, 0);

    const tailLen = Math.min(chunk, size);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, Math.max(0, size - tailLen));

    const h = crypto.createHash('md5');
    h.update(String(size));
    h.update(head);
    h.update(tail);
    return h.digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}

function groupDuplicates(files, sigFn) {
  const groups = new Map();
  for (const f of files || []) {
    const sig = sigFn ? sigFn(f) : null;
    if (!sig) continue;
    const g = groups.get(sig) || [];
    g.push(f);
    groups.set(sig, g);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

function scanDir(dir, opts = {}) {
  const out = [];
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== ARCHIVE_DIRNAME && opts.recursive !== false) walk(p);
      } else if (VIDEO_EXT.has(path.extname(e.name).toLowerCase())) {
        let st;
        try { st = fs.statSync(p); } catch { continue; }
        out.push({ path: p, name: e.name, size: st.size, mtime: st.mtimeMs });
      }
    }
  };
  walk(dir);
  return out;
}

function autoArchiveTarget(file) {
  return path.join(path.dirname(file), ARCHIVE_DIRNAME);
}

function archiveFiles(files, archiveDir) {
  fs.mkdirSync(archiveDir, { recursive: true });
  const archived = [];

  for (const f of files || []) {
    const src = f.path;
    if (!src || path.dirname(src) === archiveDir) continue;

    let dest = path.join(archiveDir, path.basename(src));
    let n = 1;
    while (fs.existsSync(dest)) {
      const ext = path.extname(src);
      dest = path.join(archiveDir, `${path.basename(src, ext)}-${n}${ext}`);
      n += 1;
    }

    try {
      fs.renameSync(src, dest);
      archived.push({ from: src, to: dest });
    } catch {
      try {
        fs.copyFileSync(src, dest);
        fs.unlinkSync(src);
        archived.push({ from: src, to: dest });
      } catch { /* skip unrecoverable */ }
    }
  }

  return { dir: archiveDir, archived };
}

module.exports = {
  VIDEO_EXT,
  ARCHIVE_DIRNAME,
  summarizeUsage,
  signature,
  groupDuplicates,
  scanDir,
  autoArchiveTarget,
  archiveFiles
};
