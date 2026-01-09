# Deployment Plan: GitHub Push & Cloudflare Deployment

## Overview

This plan automates deployment to GitHub and Cloudflare Workers using a background agent.

## Part 1: Push to GitHub

**Current Status:**
- CI workflow exists (`.github/workflows/ci.yml`) - runs on push to main
- VPS deployment workflow exists (`.github/workflows/deploy.yml`) - runs when `DEPLOY_ENABLED='true'`

**Automated Steps:**
1. Pre-deployment checks (typecheck, test)
2. Git push to origin/main
3. GitHub Actions automatically runs CI and VPS deploy

## Part 2: Deploy to Cloudflare

**Architecture:**
- Uses Cloudflare Workers with D1 database (SQLite-compatible)
- Hono framework (fully compatible with Workers)
- Cron triggers for scheduled checks (once daily at midnight UTC)
- Cloudflare Queue for background job processing

**Verified Compatibility:**
- ✅ Hono works with Cloudflare Workers
- ✅ Drizzle ORM supports Cloudflare D1
- ✅ Cron Triggers available for scheduled tasks
- ✅ Cloudflare Queue available for background jobs

## Usage

### Run Deployment Agent

```bash
# Dry run (see what would happen)
bun scripts/deploy-agent.ts --dry-run

# Full deployment
bun scripts/deploy-agent.ts

# Deploy only to Cloudflare (skip GitHub)
bun scripts/deploy-agent.ts --skip-github

# Run as background daemon
bun scripts/deploy-agent.ts --daemon
```

### Manual Steps (One-time Setup)

1. **Install Wrangler CLI:**
   ```bash
   npm install -g wrangler
   # or
   bun add -d wrangler
   ```

2. **Create D1 Database:**
   ```bash
   wrangler d1 create morakeb-db
   ```
   Copy the `database_id` to `wrangler.toml`

3. **Create Queue:**
   ```bash
   wrangler queues create monitor-checks
   ```

4. **Run Migrations:**
   ```bash
   # Apply all migrations
   wrangler d1 execute morakeb-db --file=./drizzle/0000_boring_kang.sql
   wrangler d1 execute morakeb-db --file=./drizzle/0001_funny_titania.sql
   # ... repeat for all migration files
   ```

5. **Set Environment Variables:**
   Add to your `.env` file (see below)

6. **Set GitHub Secrets (for CI/CD):**
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

## Files Created

- `scripts/deploy-agent.ts` - Background deployment agent
- `wrangler.toml` - Cloudflare configuration
- `src/cloudflare/index.ts` - Worker entry point (needs implementation)
- `.github/workflows/deploy-cloudflare.yml` - GitHub Actions workflow

## Implementation Notes

### DB Class Refactoring Required

The current `DB` class uses synchronous Bun SQLite methods. For D1, these need to be async:
- `.run()` → `await .execute()`
- `.get()` → `await .first()`
- `.all()` → `await .execute()` then process results

### Queue Adaptation

Replace `plainjob` with Cloudflare Queue bindings for background processing.

### Cron Schedule

Set to `"0 0 * * *"` (once daily at midnight UTC) in `wrangler.toml`.

## Testing

```bash
# Test locally
wrangler dev --test-scheduled

# Test cron trigger
curl "http://localhost:8787/__scheduled?cron=0+0+*+*+*"
```

## Troubleshooting

- Check logs: `tail -f deploy-agent.log` (if running as daemon)
- Verify prerequisites: `git --version`, `wrangler --version`
- Check environment variables: `echo $CLOUDFLARE_API_TOKEN`
- Test Cloudflare connection: `wrangler whoami`

## Where to Add Cloudflare API Keys

### 1. Local `.env` file (for running the agent locally)

Add these lines to your `.env` file in the project root:

```bash
# Cloudflare API credentials
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token-here
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id-here
```

To get these values:
- API Token: https://dash.cloudflare.com/profile/api-tokens → Create Token → Use "Edit Cloudflare Workers" template
- Account ID: https://dash.cloudflare.com/ → Right sidebar → Account ID

### 2. GitHub Secrets (for CI/CD)

If you want GitHub Actions to deploy automatically:

1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Add these secrets:
   - `CLOUDFLARE_API_TOKEN` = your Cloudflare API token
   - `CLOUDFLARE_ACCOUNT_ID` = your Cloudflare account ID

### 3. Environment variables (for daemon/background mode)

If running as a daemon, export them before starting:

```bash
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
bun scripts/deploy-agent.ts --daemon
```
