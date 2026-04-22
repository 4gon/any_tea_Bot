import { XMLParser } from "fast-xml-parser";
import { config } from "../config.js";
import { logger } from "../logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Article {
  title: string;
  url: string;
  publishedAt: Date;
  source: string;
}

// ─── XML Parser Setup ─────────────────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

// ─── Feed Parsers ─────────────────────────────────────────────────────────────

/** Normalize a raw feed item (RSS or Atom) into an Article. */
function normalizeItem(
  item: Record<string, unknown>,
  source: string,
): Article | null {
  // Title — may be a nested text node
  const rawTitle = item["title"];
  const title =
    typeof rawTitle === "string"
      ? rawTitle
      : typeof rawTitle === "object" && rawTitle !== null
        ? String((rawTitle as Record<string, unknown>)["#text"] ?? "")
        : "";

  // URL — RSS uses <link>, Atom uses <link href="..."> or <id>
  const rawLink = item["link"];
  let url = "";
  if (typeof rawLink === "string") {
    url = rawLink;
  } else if (typeof rawLink === "object" && rawLink !== null) {
    url =
      String((rawLink as Record<string, unknown>)["@_href"] ?? "") ||
      String((rawLink as Record<string, unknown>)["#text"] ?? "");
  }
  if (!url) url = String(item["id"] ?? item["guid"] ?? "");

  const pubRaw = item["pubDate"] ?? item["published"] ?? item["updated"] ?? "";
  const publishedAt = pubRaw ? new Date(String(pubRaw)) : new Date();

  if (!title.trim() || !url.trim()) return null;

  return {
    title: title.trim(),
    url: url.trim(),
    publishedAt: isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
    source,
  };
}

/** Fetch and parse a single RSS/Atom feed URL. */
async function fetchFeed(feedUrl: string): Promise<Article[]> {
  const source = new URL(feedUrl).hostname.replace("www.", "");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    const response = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "TelegramDigestBot/1.0 (automated news digest)",
        Accept: "application/rss+xml, application/atom+xml, text/xml, */*",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    const parsed = xmlParser.parse(xml) as Record<string, unknown>;

    // Support RSS 2.0 and Atom
    const rawItems: unknown[] =
      (parsed["rss"] as Record<string, unknown> | undefined)?.[
        "channel"
      ] instanceof Object
        ? (((parsed["rss"] as Record<string, Record<string, unknown>>)?.[
            "channel"
          ]?.["item"] as unknown[]) ?? [])
        : (((parsed["feed"] as Record<string, unknown>)?.[
            "entry"
          ] as unknown[]) ?? []);

    const items = Array.isArray(rawItems) ? rawItems : [rawItems];

    const articles = items
      .map((item) => normalizeItem(item as Record<string, unknown>, source))
      .filter((a): a is Article => a !== null);

    logger.info("Feed fetched", { source, articles: articles.length });
    return articles;
  } catch (err) {
    logger.warn("Failed to fetch feed — skipping", {
      feedUrl,
      error: String(err),
    });
    return [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchNews(): Promise<Article[]> {
  logger.info("Fetching news", { feeds: config.rssFeeds.length });

  const settled = await Promise.allSettled(
    config.rssFeeds.map((url) => fetchFeed(url)),
  );

  const articles: Article[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      articles.push(...result.value);
    }
  }

  // Most recent first
  articles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  logger.info("Total articles fetched", { count: articles.length });
  return articles;
}
