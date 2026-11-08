// Engine checks that run in CI with plain Node (no dependencies).
// Run: node tests/engine.test.js
const assert = require('node:assert/strict');
const path = require('node:path');
const { atomize, splitSentences, LIMITS } = require(path.join(__dirname, '..', 'atomize.js'));

const article = [
  '# Why small factories should log every test',
  'Most small factories throw away their test logs after a product ships.',
  'That habit hides the slow drift that shows up as field returns months later.',
  'Logging every test run costs almost nothing when the tester already writes a file.',
  'A weekly chart of first-pass yield turns those files into an early warning.',
  'When yield drops by two points, the team can check fixtures before customers notice.',
  'We cut returns on one product line by a third after six months of doing this.',
  'Start with one station, one CSV and one chart, and grow from there.',
  'The tooling matters less than the habit of looking at the numbers every week.',
  'Share the chart in the line meeting so operators see their own impact.',
].join('\n');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check('splits sentences', () => {
  assert.ok(splitSentences(article).length >= 8);
});

check('rejects too-short input', () => {
  const result = atomize('Too short.');
  assert.equal(result.ok, false);
});

const result = atomize(article, { linkedin: 5, tweets: 8 });

check('returns every format', () => {
  assert.equal(result.ok, true);
  assert.equal(result.linkedin.length, 5);
  assert.equal(result.thread.length, 8);
  assert.match(result.newsletter, /^Subject: /);
  assert.match(result.script, /^HOOK/);
});

check('respects platform limits', () => {
  result.linkedin.forEach((post) => assert.ok(post.length <= LIMITS.linkedin));
  result.thread.forEach((tweet) => assert.ok(tweet.length <= LIMITS.tweet));
});

check('numbers the thread', () => {
  result.thread.forEach((tweet, i) => assert.ok(tweet.endsWith(` ${i + 1}/8`)));
});

check('is deterministic', () => {
  assert.deepEqual(atomize(article, { linkedin: 5, tweets: 8 }), result);
});

console.log(`${passed} checks passed`);
