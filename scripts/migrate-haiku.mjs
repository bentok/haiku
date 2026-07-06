// One-off migration script: converts legacy pages/*.mdx haiku files into
// Astro content-collection entries under src/content/haiku/*.md.
// Kept in the repo as documentation of the migration; not part of the build.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const PAGES_DIR = new URL('../pages/', import.meta.url).pathname;
const OUT_DIR = new URL('../src/content/haiku/', import.meta.url).pathname;

// Real publish dates, pulled from the old Blogspot feed
// (https://bentokhaiku.blogspot.com/feeds/posts/default?max-results=500&alt=json)
// and matched to entries by exact 3-line content. Two entries
// (dad-what-does-this-say, word-salads-nurse) were added later directly to
// the newer site and never existed on the old blog, so they have no date.
const KNOWN = {
  'a-quiet-moment': { date: '2012-04-03' },
  'amidst-the-noise': { date: '2011-12-07' },
  'arms-stretched-fingers-point': { date: '2011-11-03' },
  'arrhythmic-tapping-on': { date: '2014-08-02' },
  'bartender-fans-through': { date: '2011-11-03' },
  'blanket-of-fog': { date: '2012-10-25' },
  'bowl-full-of-burley': { date: '2011-11-03' },
  'budding-leaves': { date: '2013-04-16' },
  'cello-notes-resonate': { date: '2011-11-06' },
  'chianti-at-the-villa': { date: '2011-11-03' },
  'chop-sticks-down': { date: '2012-09-25' },
  'coffee-brewing': { date: '2013-05-08' },
  'cool-spring-breeze-and': { date: '2013-04-11' },
  'craft-room-time': { date: '2011-11-06' },
  'crawling-after-a-leaf': { date: '2014-08-25' },
  'decayed-feet-shuffling': { date: '2011-11-03' },
  'design-in-progress': { date: '2012-09-27' },
  'designer-on-the-hunt': { date: '2012-05-27' },
  'dog-bites-at-a-moth': { date: '2011-11-03' },
  'downtown-pavilion': { date: '2012-08-09' },
  'each-morning-two-cardinals': { date: '2012-04-27' },
  'faithful-worshiper': { date: '2011-11-03' },
  'fathers-care-is-felt': { date: '2011-11-03' },
  'gray-skied-funeral': { date: '2011-11-03' },
  'guiness-and-a-pipe': { date: '2011-11-03' },
  'her-gifts-wrapped': { date: '2011-12-11' },
  'home-from-work': { date: '2012-09-26' },
  'ignorant-tears': { date: '2011-11-03' },
  'lonely-sidewalk': { date: '2014-08-06' },
  'long-empty-bar': { date: '2014-08-14' },
  'looming-spring-shower': { date: '2012-04-03' },
  'man-overboard': { date: '2011-11-03' },
  'morning-commute': { date: '2013-01-15' },
  'mothers-voice-is-heard': { date: '2011-11-03' },
  'myriads-of-choices': { date: '2012-08-11' },
  'neighbors-walking': { date: '2012-09-23' },
  'oblivious-natives': { date: '2011-11-03' },
  'paint-fumes-fading': { date: '2012-08-11' },
  'painted-canyon-walls': { date: '2011-11-03' },
  'pastor-gently-pats': { date: '2011-11-03' },
  'photo-shoot-challenge': { date: '2011-11-03' },
  'pine-covered-peaks': { date: '2011-11-03' },
  'pint-night': { date: '2012-09-24' },
  'reflections-from-the-wind': { date: '2013-04-12' },
  'rosso-on-the-shelf': { date: '2011-11-03' },
  'selfish-dinner-guest': { date: '2011-11-03' },
  'silver-moon': { date: '2011-11-03' },
  'smoke-dances-around': { date: '2011-11-03' },
  'sparrow-hops-along': { date: '2013-07-17' },
  'sprawling-oak-tree': { date: '2013-07-15' },
  'steam-rises-above': { date: '2011-11-03' },
  'still-asleep': { date: '2013-03-23' },
  'tea-steeping': { date: '2011-11-03' },
  'told-to-spread-abroad': { date: '2011-11-03' },
  'told-to-unite-all': { date: '2011-11-03' },
  'twilight-softly': { date: '2014-02-02' },
  'young-rosso-unleashed': { date: '2011-11-03' },
};

// pages/_meta.json's key order is the site's real reading/nav order — use it
// instead of alphabetical filename order. The "index" key points at content
// identical to dad_what_does_this_say.mdx (index.mdx was an accidental
// duplicate of that file, never given its own key), so map it there directly.
const meta = JSON.parse(readFileSync(join(PAGES_DIR, '_meta.json'), 'utf8'));
const files = Object.keys(meta)
  .filter((key) => key !== 'about')
  .map((key) => (key === 'index' ? 'dad_what_does_this_say.mdx' : `${key}.mdx`));

function slugify(line) {
  return line
    .normalize('NFKD')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function cleanLine(line) {
  return line
    .replace(/\\$/, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .trim();
}

mkdirSync(OUT_DIR, { recursive: true });

// First pass: collect every haiku (splitting two-stanza files) in _meta.json
// order, without yet knowing the total count.
const slugs = new Set();
const entries = [];

for (const file of files) {
  const raw = readFileSync(join(PAGES_DIR, file), 'utf8');
  const stanzas = raw
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stanza of stanzas) {
    const lines = stanza.split('\n').map(cleanLine).filter(Boolean);
    if (lines.length !== 3) {
      throw new Error(`${file}: expected 3 lines per stanza, got ${lines.length}: ${JSON.stringify(lines)}`);
    }

    let slug = slugify(lines[0]);
    if (slugs.has(slug)) {
      let n = 2;
      while (slugs.has(`${slug}-${n}`)) n++;
      slug = `${slug}-${n}`;
    }
    slugs.add(slug);

    entries.push({ slug, lines });
  }
}

// order is "higher = newer/first" (see src/lib/haiku.ts's descending sort;
// the highest order is shown as the homepage's featured haiku), so the first
// entry in _meta.json's reading order gets the highest number.
entries.forEach((entry, index) => {
  const known = KNOWN[entry.slug];
  const frontmatter = {
    lines: entry.lines,
    order: entries.length - index,
    ...(known?.date ? { date: known.date } : {}),
  };

  const yamlLines = [
    '---',
    'lines:',
    ...frontmatter.lines.map((l) => `  - ${JSON.stringify(l)}`),
    ...(frontmatter.date ? [`date: "${frontmatter.date}"`] : []),
    `order: ${frontmatter.order}`,
    '---',
    '',
  ];

  writeFileSync(join(OUT_DIR, `${entry.slug}.md`), yamlLines.join('\n'));
});

console.log(`Wrote ${entries.length} haiku entries from ${files.length} source files to ${OUT_DIR}`);
