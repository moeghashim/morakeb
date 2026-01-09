# Instagram Channel Setup Guide

This guide explains how to set up Instagram messaging for sending summaries to an Instagram channel.

## Prerequisites

1. **Instagram Business Account**: Your Instagram account must be converted to a Business account
2. **Facebook Page**: Your Instagram Business account must be linked to a Facebook Page
3. **Facebook App**: You need a Facebook App with Instagram permissions

## Step 1: Create Facebook App

1. Go to https://developers.facebook.com/
2. Click "My Apps" → "Create App"
3. Choose "Business" as the app type
4. Fill in app details and create the app

## Step 2: Add Instagram Product

1. In your Facebook App dashboard, click "Add Product"
2. Find "Instagram" and click "Set Up"
3. This will add Instagram Messaging capabilities

## Step 3: Get Required Credentials

### Access Token

1. Go to Tools → Graph API Explorer
2. Select your app
3. Add permissions:
   - `instagram_basic`
   - `pages_messaging`
   - `pages_read_engagement`
4. Generate access token (or use long-lived token)

### Page ID

1. Go to your Facebook Page
2. Click "About" → find "Page ID"
3. Or use Graph API: `GET /me/accounts` to list your pages

### Recipient ID (PSID)

The Page-Scoped ID (PSID) is required to send messages. You can get it:

**Option 1: From Webhook (Recommended)**
- Set up a webhook to receive messages
- When a user messages your Instagram account, you'll receive their PSID

**Option 2: From Graph API**
- Use `GET /{page-id}/conversations` to list conversations
- Each conversation has participants with PSIDs

**Option 3: Test with Your Own Account**
- Message your Instagram Business account from your personal account
- Check webhook or use Graph API to get your PSID

## Step 4: Configure in App

1. Open the TUI: `bun changes`
2. Go to Settings → Notification Channels → Add Channel
3. Select "Instagram"
4. Enter:
   - **Name**: e.g., "My Instagram Channel"
   - **Access Token**: Your Instagram Graph API access token
   - **Page ID**: Your Facebook Page ID
   - **Recipient ID**: The PSID of the user/channel to send to

## Important Limitations

⚠️ **24-Hour Messaging Window**: Instagram only allows sending messages to users who have messaged you first, and only within 24 hours of their last message. After 24 hours, you can only send messages if the user initiates a new conversation.

## Testing

After setup, you can test by:
1. Making sure the recipient has messaged your Instagram account recently (within 24 hours)
2. Running: `bun run scripts/test-telegram-send.ts` (modify to use Instagram)
3. Or trigger a monitor check that will send notifications

## Troubleshooting

**Error: "User not found"**
- Make sure the recipient has messaged your Instagram account first
- Verify the PSID is correct

**Error: "24-hour window expired"**
- The user must send a new message to restart the 24-hour window
- You cannot initiate conversations after 24 hours

**Error: "Invalid access token"**
- Regenerate your access token
- Make sure it has the required permissions

## Resources

- [Instagram Messaging API Documentation](https://developers.facebook.com/docs/instagram-api/guides/messaging)
- [Facebook Graph API Explorer](https://developers.facebook.com/tools/explorer/)
- [Instagram Business Setup](https://www.facebook.com/business/help/898752960195806)
