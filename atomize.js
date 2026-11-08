/*
 * Atomize engine: turns one article into social drafts, entirely in the browser.
 * No AI and no network: sentences are scored by keyword weight and position,
 * then the best ones are reshaped for each channel. Pure functions, so the
 * same code runs in the page and in the Node tests.
 */
(function (root) {
  'use strict';

  const STOP = new Set((
    'a an the and or but if then so of to in on at by for with from as is are was were be been being ' +
    'it its this that these those i you he she we they me my your our their them his her not no do does did ' +
    'have has had can could will would should may might must just also very more most less than too into ' +
    'about over after before when while where which who whom what why how all any each few other some such ' +
    'only own same there here up down out off again further once both because until through during above below ' +
    'between under same yet nor s t don now get got one two new like'
  ).split(/\s+/));

  const LIMITS = { tweet: 280, linkedin: 1300 };

  function clean(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .replace(/^#+\s*/gm, '')
      .replace(/[*_`>]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  function splitSentences(text) {
    const flat = clean(text).replace(/\n{2,}/g, '\n').replace(/\n/g, ' ');
    const parts = flat.match(/[^.!?]+(?:[.!?]+["')\]]?|$)/g) || [];
    return parts.map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 4);
  }

  function words(text) {
    return (text.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || []).filter((w) => w.length > 2 && !STOP.has(w));
  }

  function keywords(text, count) {
    const freq = new Map();
    words(text).forEach((w) => freq.set(w, (freq.get(w) || 0) + 1));
    return [...freq.entries()]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, count || 8)
      .map(([w]) => w);
  }

  function rankSentences(text) {
    const sentences = splitSentences(text);
    const freq = new Map();
    words(text).forEach((w) => freq.set(w, (freq.get(w) || 0) + 1));
    const max = Math.max(1, ...freq.values());
    return sentences.map((sentence, index) => {
      const ws = words(sentence);
      const weight = ws.reduce((sum, w) => sum + (freq.get(w) || 0) / max, 0) / Math.max(4, ws.length);
      const position = index === 0 ? 0.25 : index < 3 ? 0.1 : 0;
      const hasNumber = /\d/.test(sentence) ? 0.08 : 0;
      const length = sentence.length > 260 ? -0.15 : 0;
      return { sentence, index, score: weight + position + hasNumber + length };
    });
  }

  function topSentences(text, count) {
    return rankSentences(text)
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .sort((a, b) => a.index - b.index)
      .map((item) => item.sentence);
  }

  function title(text) {
    const first = clean(text).split('\n').map((l) => l.trim()).find(Boolean) || '';
    return first.length <= 90 && !/[.!?]$/.test(first) ? first : '';
  }

  function hashtags(text, count) {
    return keywords(text, count || 3).map((w) => '#' + w.replace(/[^a-z0-9]/g, '').replace(/^./, (c) => c.toUpperCase()));
  }

  function fit(text, limit) {
    if (text.length <= limit) return text;
    const cut = text.slice(0, limit - 1);
    return cut.slice(0, Math.max(cut.lastIndexOf(' '), limit - 20)).trim() + '…';
  }

  function linkedinPosts(text, count) {
    const picks = topSentences(text, Math.max(count * 2, 6));
    const tags = hashtags(text, 3).join(' ');
    const head = title(text);
    const posts = [];
    for (let i = 0; i < count && i * 2 < picks.length; i += 1) {
      const hook = picks[i * 2];
      const body = picks[i * 2 + 1] || '';
      const lines = [hook, '', body];
      if (head) lines.push('', `From my write-up: "${head}".`);
      lines.push('', 'What would you add?', '', tags);
      posts.push(fit(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), LIMITS.linkedin));
    }
    return posts;
  }

  function tweetThread(text, count) {
    const picks = topSentences(text, count);
    const total = picks.length;
    return picks.map((sentence, i) => {
      const suffix = ` ${i + 1}/${total}`;
      return fit(sentence, LIMITS.tweet - suffix.length) + suffix;
    });
  }

  function newsletter(text) {
    const head = title(text) || 'This week';
    const summary = topSentences(text, 3);
    const points = topSentences(text, 7).filter((s) => !summary.includes(s)).slice(0, 4);
    const lines = [`Subject: ${head}`, '', 'Hi,', '', summary.join(' '), ''];
    if (points.length) {
      lines.push('Key points:');
      points.forEach((p) => lines.push(`- ${p}`));
      lines.push('');
    }
    lines.push('Reply and tell me which part was most useful.', '', 'Thanks for reading.');
    return lines.join('\n');
  }

  function shortScript(text) {
    const picks = topSentences(text, 4);
    const [hook, ...rest] = picks;
    const lines = [`HOOK (0-3s): ${hook || ''}`];
    rest.forEach((p, i) => lines.push(`BEAT ${i + 1} (${3 + i * 12}-${15 + i * 12}s): ${p}`));
    lines.push(`CLOSE: Follow for the full ${title(text) ? `"${title(text)}"` : 'breakdown'}.`);
    return lines.join('\n');
  }

  function atomize(text, options) {
    const opts = Object.assign({ linkedin: 5, tweets: 8 }, options || {});
    const sentences = splitSentences(text);
    if (sentences.length < 3) {
      return { ok: false, error: 'Paste at least three full sentences so there is something to work with.' };
    }
    return {
      ok: true,
      stats: { sentences: sentences.length, words: clean(text).split(/\s+/).filter(Boolean).length, keywords: keywords(text, 6) },
      linkedin: linkedinPosts(text, opts.linkedin),
      thread: tweetThread(text, Math.min(opts.tweets, sentences.length)),
      newsletter: newsletter(text),
      script: shortScript(text),
    };
  }

  const api = { atomize, splitSentences, keywords, topSentences, hashtags, fit, LIMITS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Atomize = api;
})(typeof window !== 'undefined' ? window : globalThis);
