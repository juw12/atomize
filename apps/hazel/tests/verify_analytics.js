'use strict';

const analytics = require('../engine/analytics');

function fail(msg) { console.error('FAIL: ' + msg); process.exit(1); }
function ok(msg) { console.log('ok  - ' + msg); }

(function run() {
  const csv = [
    'platform,title,views,likes,comments,date',
    'tiktok,"Hook A, the good one",12000,340,12,2026-10-01',
    'tiktok,"Hook B",8000,120,3,2026-10-02',
    'reels,"Reel 1",15000,900,40,2026-10-03'
  ].join('\n');

  const rows = analytics.parseCsv(csv);
  if (rows.length !== 4) fail('parseCsv rows: ' + rows.length);
  if (rows[1][1] !== 'Hook A, the good one') fail('quoted field with comma not handled: ' + rows[1][1]);
  ok('parseCsv handles quoted fields containing commas');

  const norm = analytics.normalizeRows(rows, 'unknown');
  if (norm.matched !== 3) fail('normalize matched: ' + norm.matched);
  if (norm.records[0].views !== 12000 || norm.records[0].likes !== 340) fail('numbers: ' + JSON.stringify(norm.records[0]));
  if (norm.records[0].platform !== 'tiktok') fail('platform: ' + norm.records[0].platform);
  ok('normalizeRows maps columns and coerces numbers');

  const s = analytics.summarize(norm.records);
  if (s.totals.posts !== 3) fail('summary posts: ' + s.totals.posts);
  if (s.totals.views !== 35000) fail('summary views: ' + s.totals.views);
  if (s.top[0].views !== 15000) fail('top should be the highest views: ' + s.top[0].views);
  if (s.byPlatform[0].platform !== 'tiktok') fail('byPlatform not sorted by total views: ' + JSON.stringify(s.byPlatform));
  ok('summarize computes totals, top performer and per-platform split');

  console.log('\nALL CHECKS PASSED');
})();
