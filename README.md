<div align="center">
  <strong>Morakeb</strong> is a self‑hosted content change monitor with a TUI.<br />
  Track pages, feeds, and APIs; get readable diffs and optional AI summaries.

  <br /><br />
  <em>
    Webpages • Markdown • JSON • XML/Atom
    <br />
    Readable diffs • AI summaries • Notifications
  </em>
</div>

## Project Status

**Current Version:** 0.1.0  
**Repository:** [https://github.com/moeghashim/morakeb](https://github.com/moeghashim/morakeb)  
**Cloudflare Deployment:** [https://morakeb.moe-3b7.workers.dev](https://morakeb.moe-3b7.workers.dev) (Placeholder - DB refactoring pending)

### ✅ Implemented Features

- **Monitoring:** Webpages, APIs (JSON), Markdown, XML/Atom feeds
- **AI Summaries:** 
  - Droid CLI (no API keys required)
  - AI SDK providers (Anthropic, OpenAI, Google)
  - Comprehensive changelog summarization in Arabic
  - All changelog items included (no truncation)
  - LTR version numbers in RTL Arabic text
- **Notifications:** 
  - Telegram (fully implemented)
  - Instagram (basic implementation)
- **TUI:** Full-featured terminal UI for managing monitors and settings
- **Database:** SQLite with Drizzle ORM, migrations supported
- **Background Jobs:** Parallel monitor checks with job locking
- **Retention:** Configurable snapshot and change retention

### 🚧 In Progress / Planned

- **Cloudflare Workers:** Basic structure deployed, DB refactoring needed for D1 compatibility
- **Queue System:** Cloudflare Queues integration (requires paid plan)
- **Cron Triggers:** Scheduled monitor checks (structure ready)

## Quick Start

Requirements: Bun 1.3+, SQLite (bundled with Bun), a shell.

Clone and install:
```bash
git clone https://github.com/moeghashim/morakeb.git
cd morakeb
bun install
```

Setup env and database:
```bash
bun setup:local
```

Run the service and TUI (local dev):
```bash
bun dev
```

In another terminal:
```bash
bun morakeb
```

## Features

### Monitoring
- Monitors: webpages, APIs (JSON), Markdown, XML/Atom feeds
- HTML→Markdown conversion for stable diffing
- Plugin system for specialized feeds (GitHub releases, Atom feeds)
- 5 MB max fetch size (oversize pages are skipped)

### AI Summaries
- **Droid:** `droid exec` CLI (no API keys needed). See docs: https://docs.factory.ai/cli/droid-exec/overview.md
- **AI SDK:** Anthropic, OpenAI, or Google (API keys encrypted at rest)
- Configure in TUI → Settings (provider/model, verify keys)
- **Recent Improvements:**
  - All changelog items are included (no 5-item limit)
  - Version numbers display correctly in LTR format within RTL Arabic text
  - Engaging Arabic summaries with concise, action-oriented bullets
  - Materiality filtering to focus on user-facing changes

### Notifications
- **Telegram:** Fully implemented with HTML formatting
- **Instagram:** Basic implementation (24-hour messaging window limitation)
- Channel management via TUI
- Support for immediate and weekly digest notifications

### TUI Overview

Start:
```bash
bun morakeb
```

Navigation:
- **Monitors:** Add → List → Detail → Link notification channel
- **Settings:** Choose AI provider/model, verify keys, enable/disable summaries
- **Controls:** ↑/↓ to navigate, Enter to select, ESC/← to go back, q to quit

## Local Development

```bash
bun dev          # Start dev server with watch mode
bun typecheck    # Type check TypeScript
bun test         # Run test suite
bun build        # Build for production
```

## Deployment Options

### VPS Deployment

Create and deploy in one flow:
```bash
bun setup:vps
```

Prompts include:
- Hetzner API key
- Server name, region, size
- Install path
- SSH key
- GitHub auto‑deploy (optional)

After deployment:
```bash
bun morakeb --remote
```

### Cloudflare Workers

**Status:** Basic structure deployed, DB refactoring pending

The project includes Cloudflare Workers support:
- Worker entry point: `src/cloudflare/index.ts`
- Configuration: `wrangler.toml`
- D1 database binding configured
- Cron triggers configured (daily at midnight UTC)

**Current Limitation:** The DB class uses synchronous Bun SQLite methods and needs refactoring for async D1 operations.

**Deployment:**
```bash
wrangler deploy
```

**GitHub Actions:** Auto-deploy workflow configured (`.github/workflows/deploy-cloudflare.yml`). Requires GitHub secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Data & Backups

- SQLite at `data/changes.db` (WAL mode)
- Back up with `-wal` and `-shm` side files if running live
- Database migrations via Drizzle Kit

## Recent Updates

- **Changelog Summarization:** Improved to include all items from changelogs, not just top 5
- **Version Display:** Version numbers now display correctly in LTR format within RTL Arabic text
- **Arabic Summaries:** Enhanced style with engaging, concise bullets (5-10 words)
- **Notification Channels:** Added Instagram support (basic implementation)

## License

MIT

## Contributing

- Keep changes focused and type‑safe
- Include tests for new behavior
- Use timestamped, minimal logs (no emojis)
- Follow the patterns in `AGENTS.md` for development workflow
