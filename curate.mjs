// curate.mjs
// Takes raw-articles.json (collected by fetch-sources.mjs) and sends it to
// the Claude API with detailed UPSC Civil Services curation instructions.
// Claude does the actual intelligence: filtering, GS-paper classification,
// cross-source deduplication, quiz generation, schemes tracking, etc.
// Output: curated.json, which index.html reads and displays.

import fs from 'fs';

// Uses Google Gemini's free tier (no credit card needed) by default.
// Get a key at https://aistudio.google.com/apikey
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.0-flash';

if (!API_KEY) {
  console.error('GEMINI_API_KEY is not set. Add it as a repo secret (see README).');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync('raw-articles.json', 'utf8'));

// Trim each article to keep the request compact and cheap.
const compactArticles = raw.articles.map((a) => ({
  title: a.title,
  source: a.source,
  section: a.section,
  link: a.link,
  pubDate: a.pubDate,
  description: a.description,
}));

const SYSTEM_PROMPT = `You are the chief editor of a personal daily current-affairs briefing for a single, serious UPSC Civil Services (India) aspirant. You will be given a raw list of headlines from The Hindu, PIB, and Times of India (title, source, section, link, pubDate, short description). Most of this raw list is NOT useful for UPSC. Your job is to act as a strict, expert curator — not a news re-publisher.

## What to discard entirely
Celebrity news, entertainment, films/OTT, sports results, routine crime/accident reports with no policy angle, viral/human-interest stories, routine political statements or slogans with no policy substance, purely local civic news with no national/state policy significance, stock market day-to-day movement with no structural significance, advertising/promotional content.

## What to keep
Anything with genuine UPSC relevance across GS I (History, Art & Culture, Geography, Society), GS II (Polity, Constitution, Governance, Social Justice, International Relations), GS III (Economy, Agriculture, Environment, Ecology, Disaster Management, Internal Security, Science & Technology — including space, AI, biotech, health tech, defence tech, nuclear tech, emerging tech), and GS IV (Ethics/governance-related ethical dimensions, usable case studies). A story from a "soft" section can still be important if it has genuine significance for Economy, Environment, International Relations, Governance, Security, Society, or Science & Tech — judge by substance, not by which section it was filed under.

## Deduplication (critical)
The same real-world event is often reported by more than one of the three sources. Detect this and merge them into ONE story, listing all reporting sources with their own headline/link under "sources". Do not create near-duplicate entries for the same underlying event.

## Output format
Return ONLY a single valid JSON object — no markdown fences, no commentary before or after. Use exactly this shape:

{
  "frontPage": [ StoryObject, ... ],       // 5 to 8 most important stories of the day, across categories
  "gs1": [ StoryObject, ... ],
  "gs2": [ StoryObject, ... ],
  "gs3": [ StoryObject, ... ],
  "gs4": [ StoryObject, ... ],             // may be empty most days — do not force ethics content that isn't there
  "prelimsRadar": [ FactObject, ... ],     // 6 to 15 standalone facts: places, species, orgs, reports, indices, schemes, terms, personalities
  "quiz": [ QuizObject, ... ],             // 5 to 10 UPSC-style MCQs based only on today's/this week's important news
  "schemes": [ SchemeObject, ... ],        // government schemes appearing in today's/recent news
  "mainsEnrichment": [ EnrichObject, ... ],// data points, committee recommendations, SC judgments, reports, constitutional provisions, international examples/quotes useful to strengthen Mains answers
  "whatToRemember": [ "short punchy bullet", ... ]  // 4 to 8 bullets: the absolute must-remember takeaways of the day
}

StoryObject:
{
  "headline": "clear, neutral headline in your own words (do not copy source headline verbatim)",
  "sources": [ { "name": "The Hindu", "url": "https://..." }, ... ],   // 1+ entries
  "date": "YYYY-MM-DD",
  "gsPaper": "GS I" | "GS II" | "GS III" | "GS IV" | "GS I & III" (combine if genuinely spans papers),
  "relevance": "Prelims" | "Mains" | "Both",
  "importance": "High" | "Medium",
  "topic": "short syllabus topic label, e.g. 'Federalism', 'Space Technology', 'Disaster Management'",
  "summary": "2-3 sentence neutral factual summary in your own words",
  "whyItMatters": "2-4 lines explaining why this matters for UPSC and which syllabus topic it connects to"
}

FactObject: { "fact": "short factual nugget", "category": "Places" | "Species" | "Organizations" | "Reports/Indices" | "Schemes" | "Terminology" | "Personalities", "detail": "1-2 lines of context" }

QuizObject: { "question": "...", "options": ["A...", "B...", "C...", "D..."], "correctIndex": 0-3, "explanation": "why this is correct, 1-3 lines" }

SchemeObject: { "name": "...", "ministry": "...", "beneficiaries": "...", "objective": "1-2 lines", "keyFeatures": ["...", "..."], "funding": "brief funding/implementation note if known, else omit or say 'Not specified in source coverage'", "upscRelevance": "1-2 lines" }

EnrichObject: { "topic": "...", "points": ["fact/quote/example/judgment/recommendation, in your own words, 1-2 lines each", ...] }

## Style rules
- Never copy source headlines or sentences verbatim — always rewrite in your own neutral words (this output will be published on a public webpage).
- Be selective. If a day is genuinely light on UPSC-relevant news, return fewer items rather than padding with borderline stories. Quality over quantity is the entire point of this product.
- Ground every quiz question and every "whatToRemember" bullet in the actual articles provided — do not invent events.
- If nothing qualifies for a section (e.g. gs4), return an empty array for it.`;

async function callGemini() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [{
            text: `Here are today's raw headlines (${compactArticles.length} items) as JSON. Curate them per your instructions and return ONLY the JSON object described in the system prompt.\n\n${JSON.stringify(compactArticles)}`,
          }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 8000,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
  if (!text) throw new Error('No text in Gemini response: ' + JSON.stringify(data).slice(0, 500));
  return text;
}

function extractJson(text) {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
  return JSON.parse(cleaned);
}

async function main() {
  console.log(`Sending ${compactArticles.length} articles to ${MODEL} for curation...`);
  const responseText = await callGemini();
  const curated = extractJson(responseText);

  const today = new Date();
  const output = {
    date: today.toISOString().slice(0, 10),
    updatedAt: today.toISOString(),
    frontPage: curated.frontPage || [],
    gs1: curated.gs1 || [],
    gs2: curated.gs2 || [],
    gs3: curated.gs3 || [],
    gs4: curated.gs4 || [],
    prelimsRadar: curated.prelimsRadar || [],
    quiz: curated.quiz || [],
    schemes: curated.schemes || [],
    mainsEnrichment: curated.mainsEnrichment || [],
    whatToRemember: curated.whatToRemember || [],
  };

  fs.writeFileSync('curated.json', JSON.stringify(output, null, 2));
  console.log('curated.json written.');
  console.log(`Front page: ${output.frontPage.length}, GS1: ${output.gs1.length}, GS2: ${output.gs2.length}, GS3: ${output.gs3.length}, GS4: ${output.gs4.length}, Quiz: ${output.quiz.length}, Schemes: ${output.schemes.length}`);
}

main().catch((err) => {
  console.error('Curation failed:', err.message);
  process.exit(1);
});
