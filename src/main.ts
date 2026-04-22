// Config import must come first — validates all env vars before anything else
import { config } from "./config.js";
import { logger } from "./logger.js";
import { fetchNews } from "./services/fetchNews.js";
import { dedupe } from "./services/dedupe.js";
import { summarizeArticles } from "./services/aiProcessor.js";
import { formatDigest } from "./services/formatter.js";
import { sendMessage } from "./services/telegram.js";

// ─── Orchestration ────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  logger.info("🚀 Daily digest bot starting", {
    maxArticles: config.maxArticles,
    feeds: config.rssFeeds.length,
  });

  // 1. Fetch news from all RSS feeds
  const allArticles = await fetchNews();

  if (allArticles.length === 0) {
    throw new Error(
      "No articles fetched from any RSS feed. Check feed URLs or network connectivity.",
    );
  }

  // 2. Deduplicate — filter out articles already seen in previous runs
  const { fresh, skipped } = dedupe(allArticles);

  let toProcess = fresh;

  // Fallback: if all articles are already seen (e.g. first run after long pause),
  // fall back to top articles from the full list to ensure we always send a digest.
  if (fresh.length < 5) {
    logger.warn(
      "Not enough fresh articles — falling back to full article list",
      {
        fresh: fresh.length,
        skipped,
        fallbackCount: allArticles.length,
      },
    );
    toProcess = allArticles;
  }

  // 3. Limit to configured max before sending to AI (controls cost / token usage)
  const candidate = toProcess.slice(0, config.maxArticles);

  // 4. AI summarization via Gemini
  const digestEntries = await summarizeArticles(candidate);

  // 5. Format for Telegram (HTML)
  const message = formatDigest(digestEntries);
  // 6. Send to Telegram
  await sendMessage(config.chatId, message);

  logger.info("✅ Daily digest sent successfully");
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

run().catch((err: unknown) => {
  logger.error("❌ Bot run failed — exiting with code 1", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1); // Makes GitHub Actions mark the run as FAILED
});
