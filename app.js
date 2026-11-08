(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const STORE = 'atomize.source';

  const SAMPLE = [
    '# Why small teams should ship weekly',
    '',
    'Shipping every week forces a team to cut scope until the work fits. That constraint is the point: it turns vague plans into small, testable changes.',
    'In our last quarter we moved from monthly to weekly releases and cut the average bug-fix time from 9 days to 2 days.',
    'Weekly releases also make feedback cheap. Customers see progress, and the team learns which features nobody uses before investing more.',
    'The hard part is not tooling. It is agreeing that an unfinished feature stays behind a flag instead of delaying the release.',
    'Start with one rule: every Friday something reaches users, even if it is small. After a month the habit carries itself.',
    'Teams that ship weekly also write smaller pull requests, which makes code review faster and safer.',
  ].join('\n');

  function card(text, label) {
    const box = document.createElement('article');
    box.className = 'draft';
    const pre = document.createElement('pre');
    pre.textContent = text;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const count = document.createElement('span');
    count.textContent = `${text.length} characters`;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'ghost small';
    copy.textContent = 'Copy';
    copy.setAttribute('aria-label', `Copy ${label}`);
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = 'Copied';
      } catch (error) {
        copy.textContent = 'Select and copy';
      }
      setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
    });
    meta.append(count, copy);
    box.append(pre, meta);
    return box;
  }

  function fill(id, items, label) {
    const host = $(id);
    host.replaceChildren(...items.map((text, i) => card(text, `${label} ${i + 1}`)));
  }

  function run() {
    const text = $('source').value;
    try { localStorage.setItem(STORE, text); } catch (error) { /* private mode */ }
    const result = window.Atomize.atomize(text, {
      linkedin: Number($('nLinkedin').value) || 5,
      tweets: Number($('nTweets').value) || 8,
    });
    if (!result.ok) {
      $('status').textContent = result.error;
      $('out').hidden = true;
      return;
    }
    $('status').textContent = '';
    $('stats').textContent = `${result.stats.words} words, ${result.stats.sentences} sentences. Main themes: ${result.stats.keywords.join(', ') || 'none found'}.`;
    fill('linkedin', result.linkedin, 'LinkedIn post');
    fill('thread', result.thread, 'tweet');
    fill('newsletter', [result.newsletter], 'newsletter');
    fill('script', [result.script], 'script');
    $('out').hidden = false;
  }

  $('go').addEventListener('click', run);
  $('sample').addEventListener('click', () => {
    $('source').value = SAMPLE;
    run();
  });
  try {
    const saved = localStorage.getItem(STORE);
    if (saved) $('source').value = saved;
  } catch (error) { /* private mode */ }
})();
