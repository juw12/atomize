'use strict';

// Hazel analytics: turn platform CSV exports into one unified view.
//
// v1 is manual-first (no platform API access). Users export a CSV from
// TikTok/Instagram/YouTube/etc. and Hazel normalizes the columns.

const FIELD_ALIASES = {
  platform: ['platform', 'network', 'app', 'channel', 'source'],
  title: ['title', 'post', 'name', 'caption', 'video', 'content', 'text'],
  views: ['views', 'view', 'plays', 'play', 'impressions', 'reach'],
  likes: ['likes', 'like', 'hearts', 'favourites', 'favorites'],
  comments: ['comments', 'comment', 'replies'],
  shares: ['shares', 'share', 'reposts', 'retweets', 'sends'],
  date: ['date', 'posted', 'published', 'day', 'time'],
  url: ['url', 'link', 'permalink']
};

function parseCsv(text) {
  const s = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  return rows.filter((r) => !(r.length === 1 && String(r[0]).trim() === ''));
}

function indexFor(header, aliases) {
  const lower = header.map((h) => String(h).toLowerCase().trim());
  for (const a of aliases) {
    const idx = lower.indexOf(a);
    if (idx >= 0) return idx;
  }
  return -1;
}

function toNumber(v) {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : 0;
}

function normalizeRows(rows, defaultPlatform) {
  if (!rows || rows.length < 2) return { records: [], mapping: {}, matched: 0 };

  const header = rows[0];
  const mapping = {};
  for (const key of Object.keys(FIELD_ALIASES)) mapping[key] = indexFor(header, FIELD_ALIASES[key]);

  const records = [];
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const get = (key) => (mapping[key] >= 0 ? row[mapping[key]] : undefined);
    const rec = {
      platform: (get('platform') || defaultPlatform || 'unknown').toString().trim(),
      title: (get('title') || '').toString().trim(),
      views: toNumber(get('views')),
      likes: toNumber(get('likes')),
      comments: toNumber(get('comments')),
      shares: toNumber(get('shares')),
      date: (get('date') || '').toString().trim(),
      url: (get('url') || '').toString().trim()
    };
    if (rec.title || rec.views || rec.likes) records.push(rec);
  }
  return { records, mapping, matched: records.length };
}

function summarize(records) {
  const list = Array.isArray(records) ? records : [];
  const totals = { posts: list.length, views: 0, likes: 0, comments: 0, shares: 0 };
  const byPlatformMap = new Map();

  for (const r of list) {
    totals.views += r.views; totals.likes += r.likes; totals.comments += r.comments; totals.shares += r.shares;
    const key = r.platform || 'unknown';
    const agg = byPlatformMap.get(key) || { platform: key, posts: 0, views: 0, likes: 0 };
    agg.posts += 1; agg.views += r.views; agg.likes += r.likes;
    byPlatformMap.set(key, agg);
  }

  const top = list.slice().sort((a, b) => b.views - a.views).slice(0, 10);
  return {
    totals,
    byPlatform: [...byPlatformMap.values()].sort((a, b) => b.views - a.views),
    top
  };
}

module.exports = { FIELD_ALIASES, parseCsv, normalizeRows, summarize };
