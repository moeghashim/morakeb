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
   - **Account: Workers Scripts: Edit** ✅
   - **Account: D1: Edit** ✅ (REQUIRED)
   - **Account: Queues: Edit** ✅ (REQUIRED)
4. Set account resources to your account (select your account from the dropdown)
5. Copy the token and update `.env`

### 2. Account ID
1. Go to https://dash.cloudflare.com/
2. Look at the right sidebar
3. Copy your Account ID (it's a long alphanumeric string)

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

## Worker Secrets (REQUIRED)

The Cloudflare Worker needs these secrets to function. Set them using one of these methods:

### Method 1: Using Wrangler CLI (Recommended)

```bash
# Set ENCRYPTION_KEY (will prompt for value)
wrangler secret put ENCRYPTION_KEY

# Set TELEGRAM_WEBHOOK_SECRET (will prompt for value)
wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

**Note:** These commands will prompt you to enter the secret value interactively. The values are stored securely in Cloudflare and are NOT stored in `wrangler.toml`.

### Method 2: Using Cloudflare Dashboard

**Step-by-step instructions:**

1. **Log in to Cloudflare Dashboard**
   - Go to https://dash.cloudflare.com/
   - Sign in with your Cloudflare account

2. **Navigate to your Worker**
   - In the left sidebar, click **"Workers & Pages"**
   - Find and click on your worker named **"morakeb"**
   - If the worker doesn't exist yet, deploy it first using `wrangler deploy`

3. **Open Settings**
   - Click on the **"Settings"** tab at the top of the worker page

4. **Go to Variables section**
   - Scroll down to find the **"Variables"** section
   - You'll see two subsections: **"Environment Variables"** (plain text) and **"Encrypted"** (secrets)

5. **Add Encrypted Secrets**
   - Under the **"Encrypted"** section, click **"Add variable"** or **"Edit variables"**
   - Click **"Add variable"** button
   - Enter the variable name: `ENCRYPTION_KEY`
   - Enter the value (generate one with: `openssl rand -base64 48`)
   - Click **"Save"** or **"Encrypt"**
   - Repeat for `TELEGRAM_WEBHOOK_SECRET`

6. **Verify secrets are set**
   - You should see both variables listed under the "Encrypted" section
   - The values will be hidden/masked for security

**Note:** After adding secrets, you may need to redeploy your worker for the changes to take effect.

### Generate Encryption Key

If you need to generate a new encryption key:

```bash
openssl rand -base64 48
```

### Optional: Add Telegram Bot Credentials (for testing)

If you want to test Telegram sending from Cloudflare without using the database:

1. **Get your Telegram Bot Token:**
   - Message @BotFather on Telegram
   - Send `/newbot` and follow instructions
   - Copy the bot token

2. **Get your Chat ID:**
   - Message @userinfobot on Telegram
   - It will reply with your chat ID

3. **Add as Worker Secrets:**
   ```bash
   wrangler secret put TELEGRAM_BOT_TOKEN
   wrangler secret put TELEGRAM_CHAT_ID
   ```
   Or via Dashboard → Workers → morakeb → Settings → Variables → Encrypted

4. **Test Telegram sending:**
   ```bash
   # Deploy the worker first
   wrangler deploy
   
   # Get your worker URL (usually https://morakeb.YOUR_SUBDOMAIN.workers.dev)
   # Then test with curl (replace YOUR_WORKER_URL with your actual worker URL)
   curl -X POST https://YOUR_WORKER_URL/test-telegram \
     -H "Content-Type: application/json" \
     -d '{"message": "Hello from Cloudflare Worker! 🚀"}'
   
   # Or pass credentials in the request body if not set as secrets
   curl -X POST https://YOUR_WORKER_URL/test-telegram \
     -H "Content-Type: application/json" \
     -d '{
       "botToken": "your-bot-token",
       "chatId": "your-chat-id",
       "message": "Test message"
     }'
   ```

If you want to test Telegram sending from Cloudflare without using the database:

1. **Get your Telegram Bot Token:**
   - Message @BotFather on Telegram
   - Send `/newbot` and follow instructions
   - Copy the bot token

2. **Get your Chat ID:**
   - Message @userinfobot on Telegram
   - It will reply with your chat ID

3. **Add as Worker Secrets:**
   ```bash
   wrangler secret put TELEGRAM_BOT_TOKEN
   wrangler secret put TELEGRAM_CHAT_ID
   ```
   Or via Dashboard → Workers → morakeb → Settings → Variables → Encrypted

4. **Test Telegram sending:**
   ```bash
   # Using curl (replace YOUR_WORKER_URL with your actual worker URL)
   curl -X POST https://YOUR_WORKER_URL/test-telegram \
     -H "Content-Type: application/json" \
     -d '{"message": "Hello from Cloudflare Worker! 🚀"}'
   
   # Or pass credentials in the request body
   curl -X POST https://YOUR_WORKER_URL/test-telegram \
     -H "Content-Type: application/json" \
     -d '{
       "botToken": "your-bot-token",
       "chatId": "your-chat-id",
       "message": "Test message"
     }'
   ```

## GitHub Secrets (Optional)

If you want GitHub Actions to auto-deploy:

1. Go to your repo → Settings → Secrets and variables → Actions
2. Add:
   - `CLOUDFLARE_API_TOKEN` = your token
   - `CLOUDFLARE_ACCOUNT_ID` = your account ID

**Note:** Worker secrets (`ENCRYPTION_KEY`, `TELEGRAM_WEBHOOK_SECRET`) are set separately using `wrangler secret put` or the dashboard. They are NOT GitHub secrets.
