<div align="center">
  <strong>Changes</strong> is a self‑hosted content change monitor with a TUI.<br />
  Track pages, feeds, and APIs; get readable diffs and optional AI summaries.

  <br /><br />
  <em>
    Webpages • Markdown • JSON • XML/Atom
    <br />
    Readable diffs • AI summaries • Notifications
  </em>
</div>

## Quick Start

Requirements: Bun 1.3+, SQLite (bundled with Bun), a shell.

Clone and install:
```bash
git clone https://github.com/iannuttall/changes.git
```
```bash
cd changes
```
```bash
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
```bash
bun changes
```

## Features

- Monitors: webpages, APIs (JSON), Markdown, XML/Atom feeds
- HTML→Markdown conversion for stable diffing
- AI summaries (optional)
  - Provider: Droid CLI (no API keys) or AI SDK (Anthropic/OpenAI/Google)
  - Configure in TUI → Settings (provider/model, verify keys)
- Notifications: Telegram
- TUI over SSH; API is local and used only by the TUI
- SQLite storage; easy to run on a small VPS
- Parallel background checks with per‑monitor locking
- 5 MB max fetch size (oversize pages are skipped)
- Retention defaults: keep last 20 snapshots and 20 changes per monitor (adjust in TUI → Settings → Retention)

## TUI Overview

Start:
```bash
bun changes
```
- Monitors: Add → List → Detail → Link notification channel
- Settings: Choose AI provider/model, verify keys, enable/disable summaries
- Controls: ↑/↓ to navigate, Enter to select, ESC/← to go back, q to quit

## Local Development

```bash
bun dev
```
```bash
bun typecheck
```
```bash
bun test
```
```bash
bun build
```

## Deployed to a VPS

Create and deploy in one flow:
```bash
bun setup:vps
```

Prompts include:
- Hetzner API key
- Server name
- Region
- Server size
- Install path
- Login key (SSH key)
- GitHub auto‑deploy (optional)

After it finishes:
- The app runs on the server.
- On your computer, open the dashboard with:
```bash
bun changes --remote
```

## AI Summaries (details)

- Droid: `droid exec` is installed during setup when needed. See docs: https://docs.factory.ai/cli/droid-exec/overview.md
- AI SDK (Anthropic/OpenAI/Google): set API keys via TUI → Settings → Edit AI (keys are encrypted at rest). Models can be selected per‑provider.

## Data & Backups

- SQLite at `data/changes.db` (WAL mode). Back it up with the `-wal` and `-shm` side files if running live.

## License

MIT

## Contributing

- Keep changes focused and type‑safe. Include tests for new behavior.
- Use timestamped, minimal logs (no emojis).
