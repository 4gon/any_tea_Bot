import type { DigestEntry } from './aiProcessor.js';

// ─── Category Emoji Map ───────────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
  AI: '🤖',
  Startups: '🚀',
  'Big Tech': '🏢',
  Security: '🔐',
  'Open Source': '🌍',
  'Developer Tools': '🛠️',
  Science: '🔬',
  Other: '📌',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Escape characters that break Telegram HTML parse mode. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function emoji(category: string): string {
  return CATEGORY_EMOJI[category] ?? '📌';
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
    timeZoneName: 'short',
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function formatDigest(
  entries: DigestEntry[],
  date: Date = new Date(),
): string {
  const header =
    `<b>📰 Daily Tech Digest</b>\n` +
    `<i>${escapeHtml(formatDate(date))}</i>\n` +
    `${'─'.repeat(28)}\n\n`;

  const body = entries
    .map((entry, index) => {
      const icon = emoji(entry.category);
      const title = escapeHtml(entry.title);
      const summary = escapeHtml(entry.summary);
      const category = escapeHtml(entry.category);

      return (
        `${index + 1}. ${icon} <b><a href="${entry.url}">${title}</a></b>\n` +
        `   <i>${category}</i>\n` +
        `   ${summary}`
      );
    })
    .join('\n\n');

  const footer =
    `\n\n${'─'.repeat(28)}\n` +
    `<i>🤖 Powered by Google Gemini · ${escapeHtml(formatTime(date))}</i>`;

  return header + body + footer;
}
