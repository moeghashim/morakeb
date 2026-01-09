#!/usr/bin/env bun
import { readFileSync, existsSync } from 'node:fs';

// Load .env file
function loadEnv() {
  const envPath = '.env';
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
  }
}

loadEnv();

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

console.log('Current Configuration:');
console.log(`  Bot Token: ${botToken ? botToken.substring(0, 15) + '...' : 'NOT SET'}`);
console.log(`  Chat ID: ${chatId || 'NOT SET'}\n`);

if (!botToken || !chatId) {
  console.error('Missing configuration in .env file');
  process.exit(1);
}

// Test bot info
console.log('1. Verifying bot...');
const botInfo = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
const botData = await botInfo.json();
if (!botData.ok) {
  console.error('✗ Bot token is invalid');
  process.exit(1);
}
console.log(`✓ Bot: @${botData.result.username} (${botData.result.first_name})\n`);

// Try to get updates to see recent chats
console.log('2. Checking recent chats...');
const updates = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=10`);
const updatesData = await updates.json();
if (updatesData.ok && updatesData.result.length > 0) {
  console.log('Recent chats the bot has interacted with:');
  const chatIds = new Set<string>();
  for (const update of updatesData.result) {
    if (update.message?.chat) {
      const id = String(update.message.chat.id);
      const title = update.message.chat.title || update.message.chat.first_name || 'Private chat';
      chatIds.add(`${id} (${title})`);
    }
  }
  Array.from(chatIds).forEach(id => console.log(`  - ${id}`));
  console.log('');
} else {
  console.log('  No recent chats found. Make sure to:');
  console.log('  1. Start a conversation with @TermsTrustBot');
  console.log('  2. Send any message to the bot\n');
}

// Test sending to the configured chat ID
console.log(`3. Testing chat ID: ${chatId}...`);
const chatInfo = await fetch(`https://api.telegram.org/bot${botToken}/getChat?chat_id=${chatId}`);
const chatData = await chatInfo.json();

if (chatData.ok) {
  console.log(`✓ Chat found: ${chatData.result.title || chatData.result.first_name || 'Private chat'}`);
  console.log(`  Type: ${chatData.result.type}\n`);
  
  // Try sending a test message
  console.log('4. Sending test message...');
  const testMsg = '✅ اختبار - إذا رأيت هذه الرسالة، فكل شيء يعمل بشكل صحيح!';
  const sendResult = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: testMsg,
      parse_mode: 'HTML',
    }),
  });
  
  const sendData = await sendResult.json();
  if (sendData.ok) {
    console.log('✓ Test message sent successfully!');
    console.log(`  Message ID: ${sendData.result.message_id}\n`);
    console.log('🎉 Telegram is configured correctly!');
  } else {
    console.error('✗ Failed to send message');
    console.error(`  Error: ${sendData.description}`);
  }
} else {
  console.error(`✗ Chat not found: ${chatData.description}`);
  console.error('\nPossible issues:');
  console.error('  1. Chat ID is incorrect');
  console.error('  2. Bot is not added to the chat/channel');
  console.error('  3. For private chats: Start a conversation with the bot first');
  console.error('  4. For groups: Add the bot and make it an admin');
  console.error('\nTo get your chat ID:');
  console.error('  - For private chats: Message @userinfobot');
  console.error('  - For groups: Add @RawDataBot and check the "chat" field');
  console.error('  - Or check the recent chats listed above\n');
}
