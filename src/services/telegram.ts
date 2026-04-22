import { config } from '../config.js';
import { logger } from '../logger.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const TELEGRAM_BASE = `https://api.telegram.org/bot${config.botToken}`;
const MAX_MESSAGE_LENGTH = 4096;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;
const CHUNK_PAUSE_MS = 400;

// ─── Types ────────────────────────────────────────────────────────────────────

interface TelegramResponse {
  ok: boolean;
  description?: string;
  parameters?: { retry_after?: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Split a message into chunks ≤ MAX_MESSAGE_LENGTH,
 * preferring to break at newline boundaries.
 */
function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > MAX_MESSAGE_LENGTH) {
    const slice = remaining.slice(0, MAX_MESSAGE_LENGTH);
    const cutAt = slice.lastIndexOf('\n');
    const split = cutAt > 0 ? cutAt : MAX_MESSAGE_LENGTH;
    chunks.push(remaining.slice(0, split).trim());
    remaining = remaining.slice(split).trim();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

// ─── Core Sender ─────────────────────────────────────────────────────────────

async function sendChunk(
  chatId: string,
  text: string,
  attempt = 1,
): Promise<void> {
  const body = JSON.stringify({
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });

  let response: Response;
  try {
    response = await fetch(`${TELEGRAM_BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch (networkErr) {
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      logger.warn('Network error sending to Telegram, retrying', {
        attempt,
        delay,
        error: String(networkErr),
      });
      await sleep(delay);
      return sendChunk(chatId, text, attempt + 1);
    }
    throw new Error(`Telegram network error after ${MAX_RETRIES} attempts: ${String(networkErr)}`);
  }

  const data = (await response.json()) as TelegramResponse;

  if (!data.ok) {
    const isRetryable = response.status === 429 || response.status >= 500;

    if (isRetryable && attempt < MAX_RETRIES) {
      // Respect Telegram's retry_after header if provided
      const retryAfter = data.parameters?.retry_after ?? 0;
      const delay = Math.max(RETRY_BASE_MS * Math.pow(2, attempt - 1), retryAfter * 1000);

      logger.warn('Telegram API error, retrying', {
        attempt,
        status: response.status,
        description: data.description,
        delay,
      });
      await sleep(delay);
      return sendChunk(chatId, text, attempt + 1);
    }

    throw new Error(
      `Telegram API error (${response.status}): ${data.description ?? 'unknown'}`,
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendMessage(
  chatId: string,
  text: string,
): Promise<void> {
  if (!text?.trim()) throw new Error('Cannot send an empty message');

  const chunks = splitMessage(text);

  logger.info('Sending Telegram message', {
    chunks: chunks.length,
    totalChars: text.length,
  });

  for (let i = 0; i < chunks.length; i++) {
    await sendChunk(chatId, chunks[i]!);
    if (i < chunks.length - 1) await sleep(CHUNK_PAUSE_MS);
  }

  logger.info('Telegram message sent successfully', { chunks: chunks.length });
}
