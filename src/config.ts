import 'dotenv/config';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppConfig {
  botToken: string;
  chatId: string;
  geminiApiKey: string;
  maxArticles: number;
  rssFeeds: string[];
}

// ─── Default RSS Feeds ────────────────────────────────────────────────────────

const DEFAULT_RSS_FEEDS = [
  'https://techcrunch.com/feed/',
  'https://hnrss.org/frontpage',
  'https://www.theverge.com/rss/tech/index.xml',
  'https://feeds.wired.com/wired/index',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `[Config] Missing required environment variable: ${name}.\n` +
        `  Check your .env file or GitHub Secrets configuration.`,
    );
  }
  return value.trim();
}

function parseRssFeeds(): string[] {
  const raw = process.env['RSS_FEEDS'];
  if (!raw) return DEFAULT_RSS_FEEDS;
  const feeds = raw.split(',').map((f) => f.trim()).filter(Boolean);
  return feeds.length > 0 ? feeds : DEFAULT_RSS_FEEDS;
}

function parseMaxArticles(): number {
  const raw = process.env['MAX_ARTICLES'];
  if (!raw) return 10;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 30) : 10;
}

// ─── Exported Config (validated at import time) ───────────────────────────────

export const config: AppConfig = {
  botToken: requireEnv('BOT_TOKEN'),
  chatId: requireEnv('CHAT_ID'),
  geminiApiKey: requireEnv('GEMINI_API_KEY'),
  maxArticles: parseMaxArticles(),
  rssFeeds: parseRssFeeds(),
};
