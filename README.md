# Job & Scholarship Auto-Poster (Telegram)

Pulls job/scholarship listings from multiple sources and posts new ones to a Telegram channel automatically.

## How it works (the 4-step pattern)
1. **FETCH** — pulls listings from RemoteOK (free, no signup) and Adzuna (free signup)
2. **FORMAT** — turns raw data into a clean Telegram message
3. **POST** — sends it to your Telegram channel/group via a bot
4. **TRACK** — remembers what's already been posted (`seen.json`) so nothing repeats

## Setup (do this once)

### 1. Install Node.js
If you don't have it: https://nodejs.org (get the LTS version)

### 2. Install dependencies
```bash
npm install
```
(This project only uses built-in `fetch`, so there's nothing extra to install unless you add more sources later.)

### 3. Create a Telegram bot
1. Open Telegram, search for **@BotFather**
2. Send `/newbot`, follow the prompts, name your bot
3. BotFather gives you a token like `123456789:ABCdefGhIJKlmNoPQRstuVwxyZ` — save it

### 4. Create a channel (or group) and get its Chat ID
1. Create a Telegram channel (or use an existing one)
2. Add your bot as an **admin** of the channel
3. Post any message in the channel, then visit:
   `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   in your browser — find `"chat":{"id": -100XXXXXXXXXX}` in the response. That number is your Chat ID.
   (If it's a public channel, you can just use `@yourchannelname` instead of the numeric ID.)

### 5. (Optional but recommended) Get a free Adzuna API key
1. Sign up free at https://developer.adzuna.com/
2. Get your `app_id` and `app_key`
3. Skip this step if you only want RemoteOK for now — the script still works without it.

### 6. Set your environment variables
Create a file called `.env` in this folder (or set these in your terminal/hosting platform):
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
ADZUNA_APP_ID=your_adzuna_app_id
ADZUNA_APP_KEY=your_adzuna_app_key
ADZUNA_COUNTRY=us
```
Then load them before running (Linux/Mac):
```bash
export $(cat .env | xargs) && node index.js
```
On Windows (PowerShell):
```powershell
Get-Content .env | ForEach-Object { $n,$v = $_ -split '=',2; [System.Environment]::SetEnvironmentVariable($n,$v) }
node index.js
```

## Running it
```bash
node index.js
```
First run will post up to 5 new listings (adjustable via `MAX_POSTS_PER_RUN` in `index.js`) and save what's been posted to `seen.json` so it never repeats them.

## Automating it to run on a schedule
You need this script to run automatically every few hours. Options, easiest first:

1. **Your own computer + cron (Mac/Linux)** — free, but only works while your computer is on.
   ```bash
   crontab -e
   # add this line to run every 3 hours:
   0 */3 * * * cd /path/to/job-scholarship-bot && /usr/bin/node index.js >> log.txt 2>&1
   ```

2. **A cheap VPS (DigitalOcean, Linode — ~$4-6/month)** — upload this folder, set up cron there instead, runs 24/7 even when your computer is off.

3. **GitHub Actions (free)** — put this project in a GitHub repo, add a workflow file that runs it on a schedule. No server needed. Ask me if you want this set up — it's actually the best free option for something this size.

## Adding the scholarship source
`fetchScholarships()` in `index.js` is currently a placeholder. To connect a real source:
- Look for scholarship sites with an RSS feed (search "site:scholarshipsite.com rss")
- Or use a scraping library like `cheerio` (for simple HTML) or `playwright` (for JS-heavy sites) on ONE specific site — check that site's terms of service first
- Send me the specific site(s) you want and I'll help wire that source in

## Adding more job sources
Same pattern as `fetchRemoteOK()` / `fetchAdzuna()` — find a job board with a public API (USAJobs, Jooble, Indeed Publisher API, etc.), write a new `fetchXxx()` function following the same shape (return `{id, type, title, company, location, url, tags}`), then add it to the `Promise.all([...])` list in `run()`.

## Important notes
- **LinkedIn is intentionally not included.** Scraping LinkedIn violates their Terms of Service and they actively detect and block it (and pursue legal action in some cases). Stick to job boards with public APIs.
- **Telegram rate limits**: don't post too fast — the script already waits 1.5s between messages and caps posts per run at 5. Raise `MAX_POSTS_PER_RUN` carefully.
- `seen.json` is your duplicate-tracking file — don't delete it unless you want to re-post everything.
