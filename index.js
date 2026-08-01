/**
 * Job & Scholarship Auto-Poster → Telegram
 * ------------------------------------------
 * Pipeline: FETCH (job boards) -> FORMAT (message text) -> POST (Telegram) -> TRACK (avoid duplicates)
 *
 * Run once manually:      node index.js
 * Run on a schedule:      set up a cron job (see README.md) to run this every X hours
 */

const fs = require('fs');
const path = require('path');

// ---------- CONFIG ----------
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID; // your channel/group id, e.g. @yourchannel or -1001234567890
const SEEN_FILE = path.join(__dirname, 'seen.json');
const MAX_POSTS_PER_RUN = 5; // safety limit so you don't spam Telegram in one run

// ---------- DUPLICATE TRACKING ----------
function loadSeen() {
  if (!fs.existsSync(SEEN_FILE)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')));
}

function saveSeen(seenSet) {
  fs.writeFileSync(SEEN_FILE, JSON.stringify([...seenSet], null, 2));
}

// ---------- SOURCE 1: REMOTEOK (free, no key needed) ----------
async function fetchRemoteOK() {
  try {
    const res = await fetch('https://remoteok.com/api');
    const data = await res.json();
    // First item is metadata, skip it
    return data.slice(1).map(job => ({
      id: `remoteok-${job.id}`,
      type: 'job',
      title: job.position,
      company: job.company,
      location: job.location || 'Remote',
      url: job.url,
      tags: job.tags || [],
    }));
  } catch (err) {
    console.error('RemoteOK fetch failed:', err.message);
    return [];
  }
}

// ---------- SOURCE 2: ADZUNA (free tier, needs app_id + app_key) ----------
// Sign up free at https://developer.adzuna.com/
async function fetchAdzuna() {
  const APP_ID = process.env.ADZUNA_APP_ID;
  const APP_KEY = process.env.ADZUNA_APP_KEY;
  const COUNTRY = process.env.ADZUNA_COUNTRY || 'us'; // us, gb, ng, etc.

  if (!APP_ID || !APP_KEY) {
    console.log('Adzuna not configured — skipping (set ADZUNA_APP_ID and ADZUNA_APP_KEY to enable)');
    return [];
  }

  try {
    const url = `https://api.adzuna.com/v1/api/jobs/${COUNTRY}/search/1?app_id=${APP_ID}&app_key=${APP_KEY}&results_per_page=20`;
    const res = await fetch(url);
    const data = await res.json();
    return (data.results || []).map(job => ({
      id: `adzuna-${job.id}`,
      type: 'job',
      title: job.title,
      company: job.company?.display_name || 'Unknown',
      location: job.location?.display_name || COUNTRY.toUpperCase(),
      url: job.redirect_url,
      tags: [],
    }));
  } catch (err) {
    console.error('Adzuna fetch failed:', err.message);
    return [];
  }
}

// ---------- SOURCE 3: SCHOLARSHIPS (placeholder — plug in a scraper or API here) ----------
// Most scholarship sites have no public API. Options:
//   1. Find sites that offer RSS feeds (check for /feed or /rss.xml on scholarship blogs)
//   2. Use a scraping library (Playwright/Cheerio) on ONE site at a time, respecting robots.txt
// This function is a stub so the pipeline runs end-to-end; replace with a real source when ready.
async function fetchScholarships() {
  console.log('Scholarship source not yet connected — add a scraper or RSS feed here.');
  return [];
}

// ---------- FORMAT: turn raw listing into a Telegram-ready message ----------
function formatMessage(item) {
  if (item.type === 'job') {
    const tagLine = item.tags.length ? `\n🏷️ ${item.tags.slice(0, 5).join(', ')}` : '';
    return (
      `💼 *${escapeMd(item.title)}*\n` +
      `🏢 ${escapeMd(item.company)}\n` +
      `📍 ${escapeMd(item.location)}${tagLine}\n\n` +
      `🔗 [Apply here](${item.url})`
    );
  }
  if (item.type === 'scholarship') {
    return (
      `🎓 *${escapeMd(item.title)}*\n` +
      `🌍 ${escapeMd(item.location || 'International')}\n` +
      (item.deadline ? `⏰ Deadline: ${escapeMd(item.deadline)}\n` : '') +
      `\n🔗 [Details here](${item.url})`
    );
  }
  return `${item.title}\n${item.url}`;
}

// Telegram Markdown requires escaping certain characters
function escapeMd(text = '') {
  return text.replace(/([_*[\]()~`>#+=|{}.!-])/g, '\\$1');
}

// ---------- POST: send message to Telegram ----------
async function postToTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: false,
    }),
  });
  const result = await res.json();
  if (!result.ok) {
    throw new Error(`Telegram API error: ${result.description}`);
  }
  return result;
}

// ---------- MAIN PIPELINE ----------
async function run() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variables. See README.md.');
    process.exit(1);
  }

  console.log('Fetching listings from all sources...');
  const [remoteOkJobs, adzunaJobs, scholarships] = await Promise.all([
    fetchRemoteOK(),
    fetchAdzuna(),
    fetchScholarships(),
  ]);

  const allItems = [...remoteOkJobs, ...adzunaJobs, ...scholarships];
  console.log(`Fetched ${allItems.length} total listings.`);

  const seen = loadSeen();
  const newItems = allItems.filter(item => !seen.has(item.id));
  console.log(`${newItems.length} are new (not posted before).`);

  const toPost = newItems.slice(0, MAX_POSTS_PER_RUN);

  for (const item of toPost) {
    try {
      const message = formatMessage(item);
      await postToTelegram(message);
      seen.add(item.id);
      console.log(`Posted: ${item.title}`);
      // Telegram rate limit: wait ~1.5s between messages
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.error(`Failed to post "${item.title}":`, err.message);
    }
  }

  saveSeen(seen);
  console.log(`Done. Posted ${toPost.length} new listing(s).`);
}

run();
