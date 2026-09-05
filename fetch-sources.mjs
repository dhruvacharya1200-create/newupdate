// fetch-sources.mjs
// Pulls raw headlines + short descriptions from The Hindu, PIB, and
// Times of India RSS feeds, normalizes them, and writes raw-articles.json.
// This is the "collect" step — no intelligence applied here.
// curate.mjs (the next step) does the actual UPSC-relevant filtering.

import fs from 'fs';

// Add/remove feeds here. `source` is shown to the reader and used later
// for deduplication across outlets.
const FEEDS = [
  // --- The Hindu ---
  { source: 'The Hindu', section: 'National', url: 'https://www.thehindu.com/news/national/feeder/default.rss' },
  { source: 'The Hindu', section: 'International', url: 'https://www.thehindu.com/news/international/feeder/default.rss' },
  { source: 'The Hindu', section: 'Economy', url: 'https://www.thehindu.com/business/Economy/feeder/default.rss' },
  { source: 'The Hindu', section: 'Sci-Tech', url: 'https://www.thehindu.com/sci-tech/feeder/default.rss' },
  { source: 'The Hindu', section: 'Environment', url: 'https://www.thehindu.com/sci-tech/energy-and-environment/feeder/default.rss' },
  { source: 'The Hindu', section: 'Editorial', url: 'https://www.thehindu.com/opinion/editorial/feeder/default.rss' },

  // --- PIB (Government of India press releases) ---
  { source: 'PIB', section: 'Press Releases', url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1' },

  // --- Times of India ---
  { source: 'Times of India', section: 'India', url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms' },
  { source: 'Times of India', section: 'World', url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms' },
  { source: 'Times of India', section: 'Business', url: 'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms' },
  { source: 'Times of India', section: 'Science', url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128672765.cms' },
  { source: 'Times of India', section: 'Environment', url: 'https://timesofindia.indiatimes.com/rssfeeds/2647163.cms' },
];

const MAX_ITEMS_PER_FEED = 25;
const MAX_AGE_HOURS = 48; // ignore anything older than this

function decodeEntities(str) {
  return str
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')      // strip any embedded HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function tagContent(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? decodeEntities(match[1]) : '';
}

function parseItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      title: tagContent(block, 'title'),
      link: tagContent(block, 'link'),
      pubDate: tagContent(block, 'pubDate'),
      description: tagContent(block, 'description').slice(0, 400),
    });
  }
  return items;
}

function isRecent(pubDate) {
  const t = new Date(pubDate).getTime();
  if (isNaN(t)) return true; // if we can't parse it, don't discard it
  const ageHours = (Date.now() - t) / 3600000;
  return ageHours <= MAX_AGE_HOURS;
}

async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UPSCDailyBot/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  return parseItems(xml)
    .filter((item) => isRecent(item.pubDate))
    .slice(0, MAX_ITEMS_PER_FEED)
    .map((item) => ({ ...item, source: feed.source, section: feed.section }));
}

async function main() {
  const allArticles = [];

  for (const feed of FEEDS) {
    try {
      const items = await fetchFeed(feed);
      allArticles.push(...items);
      console.log(`✔ ${feed.source} / ${feed.section}: ${items.length} recent items`);
    } catch (err) {
      console.error(`✘ ${feed.source} / ${feed.section} failed: ${err.message}`);
    }
  }

  fs.writeFileSync(
    'raw-articles.json',
    JSON.stringify({ fetchedAt: new Date().toISOString(), articles: allArticles }, null, 2)
  );
  console.log(`\nraw-articles.json written with ${allArticles.length} articles total.`);
}

main();
