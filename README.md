# Telegram AI Digest Bot

A serverless daily tech news digest bot powered by **Google Gemini** and delivered via **Telegram**. Runs automatically every morning via **GitHub Actions** — no server required.

## How It Works

```
GitHub Actions (cron 08:00 IST)
  │
  ├─ Fetch   → RSS feeds (TechCrunch, Hacker News, The Verge, Wired)
  ├─ Dedupe  → Filter articles already sent (persisted in seen_urls.json)
  ├─ AI      → Google Gemini selects top 5 stories + 2-line summaries
  ├─ Format  → Telegram HTML with emoji categories
  └─ Send    → Telegram Bot API → your channel/chat
```

## Setup

### 1. Create a Telegram Bot
1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Run `/newbot` and follow the prompts
3. Copy the **Bot Token**
4. Add the bot to your channel as an **Admin** (or just start a chat with it)
5. Get your **Chat ID** — for a channel use `@channelname`, for a private chat use [@userinfobot](https://t.me/userinfobot)

### 2. Get a Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Click **Create API Key**
3. Copy the key

### 3. Add GitHub Secrets
In your repo: **Settings → Secrets and variables → Actions → New repository secret**

| Secret Name     | Value                          |
|-----------------|-------------------------------|
| `BOT_TOKEN`     | Your Telegram bot token        |
| `CHAT_ID`       | Your Telegram chat/channel ID  |
| `GEMINI_API_KEY`| Your Google AI Studio API key  |

### 4. Deploy
Push to GitHub — the workflow runs automatically at **08:00 AM IST** every day.

## Local Development

```bash
cd backend-node

# Install dependencies
npm install

# Copy and fill in your credentials
cp .env.example .env
# Edit .env with your BOT_TOKEN, CHAT_ID, GEMINI_API_KEY

# Run directly with tsx (no build needed)
npm run dev

# Or build + run
npm run build && npm start
```

## Manual Trigger
Go to your repo → **Actions** → **Daily Telegram Digest** → **Run workflow**

## Configuration

You can optionally set these in `.env` or as GitHub Secrets:

| Variable      | Default                        | Description                            |
|---------------|-------------------------------|----------------------------------------|
| `RSS_FEEDS`   | TechCrunch, HN, Verge, Wired  | Comma-separated RSS feed URLs          |
| `MAX_ARTICLES`| `10`                          | Max articles passed to Gemini          |

## Project Structure

```
backend-node/
├── src/
│   ├── config.ts              # Env var validation
│   ├── logger.ts              # Structured JSON logger
│   ├── main.ts                # Orchestration entry point
│   └── services/
│       ├── fetchNews.ts       # RSS fetching (multi-feed, timeout)
│       ├── dedupe.ts          # URL-hash deduplication
│       ├── aiProcessor.ts     # Gemini summarization
│       ├── formatter.ts       # Telegram HTML formatting
│       └── telegram.ts        # Telegram sender (retry + chunking)
├── .github/workflows/
│   └── daily.yml              # GitHub Actions cron workflow
├── seen_urls.json             # Dedup state (auto-updated by CI)
├── .env.example               # Environment variable template
└── README.md
```

## Tech Stack

- **Runtime**: Node.js 20 (TypeScript, ESM)
- **AI**: Google Gemini 2.0 Flash via `@google/genai`
- **RSS Parsing**: `fast-xml-parser`
- **Delivery**: Telegram Bot API (native `fetch`, no axios)
- **CI/CD**: GitHub Actions (cron + manual dispatch)
