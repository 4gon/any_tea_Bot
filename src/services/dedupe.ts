import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { Article } from './fetchNews.js';
import { logger } from '../logger.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Path relative to working directory (backend-node/) */
const SEEN_FILE = join(process.cwd(), 'seen_urls.json');

/** Cap stored hashes to prevent unbounded file growth */
const MAX_STORED_HASHES = 500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

function loadSeen(): Set<string> {
  if (!existsSync(SEEN_FILE)) return new Set();
  try {
    const raw = readFileSync(SEEN_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    logger.warn('Could not read seen_urls.json — starting fresh');
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  try {
    // Keep only the most recent MAX_STORED_HASHES entries
    const trimmed = [...seen].slice(-MAX_STORED_HASHES);
    writeFileSync(SEEN_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch (err) {
    logger.warn('Could not save seen_urls.json', { error: String(err) });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface DedupeResult {
  fresh: Article[];
  skipped: number;
}

export function dedupe(articles: Article[]): DedupeResult {
  const seen = loadSeen();
  const before = seen.size;

  const fresh: Article[] = [];
  for (const article of articles) {
    const hash = hashUrl(article.url);
    if (!seen.has(hash)) {
      seen.add(hash);
      fresh.push(article);
    }
  }

  saveSeen(seen);

  logger.info('Deduplication complete', {
    input: articles.length,
    fresh: fresh.length,
    skipped: articles.length - fresh.length,
    totalTracked: seen.size,
    newHashes: seen.size - before,
  });

  return { fresh, skipped: articles.length - fresh.length };
}
