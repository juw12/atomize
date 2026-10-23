'use strict';

// Hazel publish helpers (v1: manual-first).
//
// No platform API keys are required. Hazel prepares a "publish package" — the
// right aspect-ratio export, a caption, and a one-tap deep link to the
// platform's own uploader. Direct API posting is a later, review-gated phase.

const PLATFORMS = {
  tiktok: { key: 'tiktok', name: 'TikTok', ratio: '9x16', uploadUrl: 'https://www.tiktok.com/upload', captionLimit: 2200, hashtags: '#fyp #foryou' },
  reels: { key: 'reels', name: 'Instagram Reels', ratio: '9x16', uploadUrl: 'https://www.instagram.com/', captionLimit: 2200, hashtags: '#reels #explore' },
  shorts: { key: 'shorts', name: 'YouTube Shorts', ratio: '9x16', uploadUrl: 'https://studio.youtube.com/', captionLimit: 5000, hashtags: '#shorts' },
  facebook: { key: 'facebook', name: 'Facebook', ratio: '1x1', uploadUrl: 'https://www.facebook.com/', captionLimit: 63206, hashtags: '' },
  x: { key: 'x', name: 'X', ratio: '16x9', uploadUrl: 'https://x.com/compose/post', captionLimit: 280, hashtags: '' }
};

function listPlatforms() {
  return Object.values(PLATFORMS);
}

function getPlatform(key) {
  return PLATFORMS[key] || null;
}

// Join copy + hashtags, then clamp to the platform's caption limit.
function buildCaption(text, platformKey, hashtags) {
  const p = PLATFORMS[platformKey] || {};
  const tags = hashtags != null ? hashtags : (p.hashtags || '');
  const cap = [String(text || '').trim(), String(tags || '').trim()].filter(Boolean).join('\n\n');
  const limit = p.captionLimit || 2200;
  return cap.length > limit ? cap.slice(0, limit - 1).trimEnd() + '\u2026' : cap;
}

function packageReadme(p, caption, videoName) {
  return [
    `Hazel publish package \u2014 ${p.name}`,
    '',
    `Format:   ${p.ratio}`,
    `Video:    ${videoName}`,
    `Upload:   ${p.uploadUrl}`,
    '',
    'Steps:',
    `  1. Open ${p.uploadUrl}`,
    `  2. Upload ${videoName}`,
    '  3. Paste caption.txt',
    ''
  ].join('\n');
}

module.exports = { PLATFORMS, listPlatforms, getPlatform, buildCaption, packageReadme };
