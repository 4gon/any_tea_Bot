import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type { Article } from "./fetchNews.js";
import { jsonrepair } from "jsonrepair";

// ─── Constants ────────────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-3-flash-preview";

const SYSTEM_INSTRUCTION = `You are a senior tech news editor creating a daily briefing for busy professionals.
Your job: select the most impactful stories, summarize them clearly, and categorize them accurately.
Be concise, factual, and avoid hype. Never fabricate information.`;

const VALID_CATEGORIES = [
  "AI",
  "Startups",
  "Big Tech",
  "Security",
  "Open Source",
  "Developer Tools",
  "Science",
  "Other",
] as const;

export type Category = (typeof VALID_CATEGORIES)[number];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DigestEntry {
  category: Category;
  title: string;
  summary: string;
  url: string;
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildPrompt(articles: Article[]): string {
  const list = articles
    .map((a, i) => `${i + 1}. [${a.source}] ${a.title}\n   URL: ${a.url}`)
    .join("\n");

  return `From the tech news articles below, select the TOP 5 most important and interesting stories.

For each story return a JSON object with these exact keys:
- "category": one of ${VALID_CATEGORIES.map((c) => `"${c}"`).join(", ")}
- "title": the original article title (do not shorten or rewrite)
- "summary": exactly 2 sentences — what happened, and why it matters to tech professionals
- "url": the article URL (copy exactly as given)

Respond with ONLY a valid JSON array of 5 objects. No markdown, no explanation, no code fences.

Articles:
${list}`;
}

// ─── JSON Extractor ───────────────────────────────────────────────────────────

//   if (!Array.isArray(parsed) || parsed.length === 0) {
//     throw new Error("Gemini returned an empty array");
//   }

//   return parsed.map((item, idx) => {
//     const entry = item as Record<string, unknown>;
//     const category =
//       typeof entry["category"] === "string" &&
//       (VALID_CATEGORIES as readonly string[]).includes(entry["category"])
//         ? (entry["category"] as Category)
//         : "Other";

//     return {
//       category,
//       title: String(entry["title"] ?? `Article ${idx + 1}`),
//       summary: String(entry["summary"] ?? ""),
//       url: String(entry["url"] ?? ""),
//     };
//   });
// }
function extractJson(raw: string): DigestEntry[] {
  try {
    // 1. Repair the string (handles missing brackets, quotes, and truncation)
    const repaired = jsonrepair(raw);

    // 2. Parse the repaired string
    const parsed = JSON.parse(repaired);

    // 3. Ensure we have an array (Gemini sometimes wraps JSON in an object)
    const data = Array.isArray(parsed) ? parsed : parsed.data || [];

    return data.map((entry: any, idx: number) => ({
      category: (VALID_CATEGORIES.includes(entry.category)
        ? entry.category
        : "Other") as Category,
      title: String(entry.title ?? `Article ${idx + 1}`),
      summary: String(entry.summary ?? ""),
      url: String(entry.url ?? ""),
    }));
  } catch (e) {
    logger.error("JSON Repair & Parse failed", {
      error: e instanceof Error ? e.message : String(e),
      raw,
    });
    return [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

// export async function summarizeArticles(
//   articles: Article[],
// ): Promise<DigestEntry[]> {
//   logger.info("Calling Gemini AI", {
//     model: GEMINI_MODEL,
//     inputArticles: articles.length,
//   });

//   const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

//   const response = await ai.models.generateContent({
//     model: GEMINI_MODEL,
//     contents: buildPrompt(articles),
//     config: {
//       systemInstruction: SYSTEM_INSTRUCTION,
//       temperature: 0.3,
//       maxOutputTokens: 2000,
//       responseMimeType: "application/json",
//     },
//   });

//   logger.info("Raw Gemini response: ", { response });

//   const raw = response.text ?? "";

//   if (!raw.trim()) {
//     throw new Error("Gemini returned an empty response");
//   }

//   const entries = extractJson(raw);

//   logger.info("AI summarization complete", { entriesReturned: entries.length });

//   return entries;
// }

export async function summarizeArticles(
  articles: Article[],
): Promise<DigestEntry[]> {
  logger.info("Calling Gemini AI", {
    model: GEMINI_MODEL,
    inputArticles: articles.length,
  });

  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

  // 1. result is already the GenerateContentResponse object
  const result = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: buildPrompt(articles),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.1, // Lower temperature = more stable JSON
      maxOutputTokens: 32768,
      responseMimeType: "application/json",
    },
  });

  // 2. Correct way to access text in this SDK version
  const raw = result.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  logger.info("Raw Gemini response: ", { raw });

  if (!raw.trim()) {
    throw new Error("Gemini returned an empty response");
  }

  // 3. Log truncation warning using finishReason
  const finishReason = result.candidates?.[0]?.finishReason;
  if (finishReason === "MAX_TOKENS") {
    logger.warn("Gemini response was truncated. JSON might be incomplete.");
  }

  logger.info("AI raw response received", { raw });

  return extractJson(raw);
}
