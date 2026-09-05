# The Daily Paper — a personal UPSC current-affairs dashboard

A single page that replaces multiple news apps: it pulls headlines from
**The Hindu, PIB, and Times of India**, then uses Claude to intelligently
filter, deduplicate, and organize them for UPSC Civil Services prep —
GS I–IV, Prelims Radar, a daily quiz, a schemes tracker, Mains enrichment,
and a "What I should remember" summary. It refreshes itself automatically
every morning at **9:00 AM IST**.

## How it's different from a normal news aggregator

Most of what The Hindu/PIB/TOI publish each day (sports, entertainment,
routine statements) has no UPSC value. This isn't a pass-through feed —
`curate.mjs` sends the day's raw headlines to Google's Gemini API with
detailed instructions to act as a strict UPSC editor: discard what doesn't
matter, merge duplicate coverage of the same event across the three
sources, tag every story by GS Paper and Prelims/Mains relevance, and
generate the quiz/schemes/enrichment sections from what's actually in the
news that day.

## Pieces

- **`fetch-sources.mjs`** — pulls raw headlines from The Hindu, PIB, and
  Times of India RSS feeds → `raw-articles.json`
- **`curate.mjs`** — sends those headlines to the free Gemini API with UPSC
  curation instructions → `curated.json`
- **`index.html`** — the dashboard. Reads `curated.json` and renders it,
  with the 15 / 30 / 60-minute time modes
- **`.github/workflows/update-upsc.yml`** — runs both scripts automatically
  every day at 9:00 AM IST and commits the result

## Setup (15–20 minutes, one time)

1. **Create a GitHub repo** and upload all files here, keeping the
   `.github` folder structure intact. (Web upload sometimes drops the
   hidden `.github` folder — if `update-upsc.yml` isn't visible after
   uploading, create it manually via "Add file → Create new file" and
   paste its contents.)

2. **Get a free Gemini API key** (this is what powers the intelligent
   curation — Google's Gemini API has a genuine free tier, no credit card
   needed, and one run/day here uses a tiny fraction of the daily limit):
   - Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - Sign in with any Google account → **Create API key**
   - Copy the key

3. **Add the API key as a repo secret**: Settings → **Secrets and
   variables** → **Actions** → **Secrets** tab → **New repository secret**
   → name it `GEMINI_API_KEY`, paste the key.

4. **Turn on GitHub Pages**: Settings → **Pages** → Source: "Deploy from a
   branch" → Branch `main`, folder `/ (root)` → Save. You'll get a live URL
   like `https://yourusername.github.io/the-daily-paper/`.

5. **Run the workflow once to test**: Actions tab → "Update UPSC Daily
   Briefing" → enable it if prompted → **Run workflow**. This takes about
   30–60 seconds (fetching feeds + one Claude API call).

6. Open your GitHub Pages link — you should see today's real curated
   briefing in place of the placeholder content.

From here on, it updates itself every morning — open the link any time
after 9 AM IST and the day's briefing is there.

## Customizing

- **Feeds**: edit the `FEEDS` array in `fetch-sources.mjs` to add/remove
  sections or sources.
- **Curation rules**: everything Gemini does — what counts as UPSC-relevant,
  the exact output structure, quiz style — is defined in the `SYSTEM_PROMPT`
  string inside `curate.mjs`. Edit it directly to change behavior (e.g. add
  a state you want extra coverage on, change quiz difficulty, add a
  "Static GK connect" section).
  This is a real, editable prompt, not a fixed algorithm.
- **Update time**: change the `cron` line in
  `.github/workflows/update-upsc.yml` (times are in UTC; 9:00 AM IST =
  `30 3 * * *`).
- **Design**: all styling is in the `<style>` block in `index.html` —
  colors are defined once under `:root`.

## Notes on the RSS feeds

The Hindu, PIB, and Times of India RSS URLs occasionally change. If a
section in `raw-articles.json` shows 0 items after a run, check the
Actions log for that feed's error — you may just need to find the new URL
on the publisher's site and swap it into `fetch-sources.mjs`.

## Running locally (optional, to test before deploying)

```bash
node fetch-sources.mjs                    # pulls raw-articles.json
GEMINI_API_KEY=AI... node curate.mjs      # produces curated.json
# then open index.html in a browser
```

## Cost

This uses Gemini's standing free tier — no billing setup, no card, and one
run a day is well within the free daily request/token limits, so this
should stay $0/month indefinitely under normal use.
