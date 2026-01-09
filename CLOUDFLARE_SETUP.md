# Cloudflare API Key Setup

## Quick Setup

Add these two lines to your `.env` file:

```bash
CLOUDFLARE_API_TOKEN=your-token-here
CLOUDFLARE_ACCOUNT_ID=your-account-id-here
```

## How to Get Your Credentials

### 1. API Token
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token" or edit your existing token
3. **IMPORTANT**: Set these exact permissions:
   - **Account: Workers Scripts: Edit** ✅ (you have this)
   - **Account: D1: Edit** ❌ (missing - REQUIRED)
   - **Account: Queues: Edit** ❌ (missing - REQUIRED)
4. Set account resources to your account: `3b71aa32c089339c94b505e4ea5d1317`
5. Copy the token and update `.env`

### 2. Account ID
1. Go to https://dash.cloudflare.com/
2. Look at the right sidebar
3. Copy your Account ID (already set: `3b71aa32c089339c94b505e4ea5d1317`)

## Verify Token Permissions

Run this to check your token permissions:

```bash
bun scripts/verify-cloudflare-token.ts
```

## Current Status

Your token currently has:
- ✅ Authentication working
- ✅ Workers Scripts:Edit permission
- ❌ D1:Edit permission (MISSING - add this)
- ❌ Queues:Edit permission (MISSING - add this)

## Verify Setup

After adding to `.env`, test with:

```bash
# Dry run (won't actually deploy)
bun scripts/deploy-agent.ts --dry-run

# Or check if credentials are loaded
echo $CLOUDFLARE_API_TOKEN
```

## GitHub Secrets (Optional)

If you want GitHub Actions to auto-deploy:

1. Go to your repo → Settings → Secrets and variables → Actions
2. Add:
   - `CLOUDFLARE_API_TOKEN` = your token
   - `CLOUDFLARE_ACCOUNT_ID` = your account ID
