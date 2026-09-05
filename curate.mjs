// curate.mjs
import fs from 'fs';

const API_KEY = process.env.GEMINI_API_KEY;
// Stable model version
const MODEL = 'gemini-1.5-flash';

if (!API_KEY) {
  console.error('GEMINI_API_KEY is not set. Add it as a repo secret.');
  process.exit(1);
}

// 1. Load and Clean Input
// 176 articles bahut zyada hain, isliye hum top 80 le rahe hain taaki JSON cut-off na ho.
const rawData = JSON.parse(fs.readFileSync('raw-articles.json', 'utf8'));
const compactArticles = rawData.articles
  .slice(0, 80) 
  .map((a) => ({
    title: a.title?.substring(0, 200),
    source: a.source,
    description: a.description?.substring(0, 250),
    link: a.link,
    pubDate: a.pubDate,
  }));

const SYSTEM_PROMPT = `You are a UPSC Civil Services expert curator.
Your task is to filter the provided news for a serious aspirant.

## STRICT FILTERING RULES
- KEEP: GS I (History/Geo), GS II (Polity/IR/Governance), GS III (Economy/Env/Sci-Tech/Security), GS IV (Ethics).
- DISCARD: Sports, Celebrity, Bollywood, local crime, routine political news, or stock market daily ups/downs.
- DEDUPLICATE: If multiple sources report the same news, merge them into ONE StoryObject.

## OUTPUT FORMAT
Return ONLY a valid JSON object. No markdown, no backticks.
{
  "frontPage": [], 
  "gs1": [], "gs2": [], "gs3": [], "gs4": [],
  "prelimsRadar": [], 
  "quiz": [], 
  "schemes": [],
  "mainsEnrichment": [],
  "whatToRemember": []
}

## CRITICAL JSON RULES
- Summaries must be strictly 2 sentences max.
- Do NOT use literal newlines inside a string; use \\n instead.
- If you use a quote inside a summary, escape it like this: \\" `;

async function callGemini() {
  // FIXED: Changed v1beta to v1 to avoid 404 error
  const url = `https://generativelanguage.googleapis.com/v1/models/${MODEL}:generateContent?key=${API_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [{
            text: `Curate these ${compactArticles.length} items into the requested JSON format:\n\n${JSON.stringify(compactArticles)}`,
          }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.1, 
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini API Error ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function extractJson(text) {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    
    if (start === -1 || end === -1) {
      throw new Error("AI did not return a valid JSON block.");
    }

    let jsonString = text.substring(start, end + 1);
    
    // Cleaning literal newlines that break JSON parsing
    jsonString = jsonString.replace(/\n/g, ' ').replace(/\r/g, ' ');

    return JSON.parse(jsonString);
  } catch (e) {
    console.error("FAILED TO PARSE JSON. Raw Response:");
    console.error(text.substring(0, 1000));
    throw e;
  }
}

async function main() {
  console.log(`Sending ${compactArticles.length} articles to ${MODEL}...`);
  
  try {
    const responseText = await callGemini();
    const curated = extractJson(responseText);

    const today = new Date();
    const output = {
      date: today.toISOString().slice(0, 10),
      updatedAt: today.toISOString(),
      ...curated
    };

    fs.writeFileSync('curated.json', JSON.stringify(output, null, 2));
    console.log('Success: curated.json written.');
    console.log(`FrontPage: ${output.frontPage.length}, GS2: ${output.gs2.length}, GS3: ${output.gs3.length}`);
  } catch (err) {
    console.error('Curation failed:', err.message);
    process.exit(1);
  }
}

main();
