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

if (!botToken || !chatId) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env');
  process.exit(1);
}

console.log('Testing Telegram bot connection...\n');
console.log(`Bot Token: ${botToken.substring(0, 10)}...`);
console.log(`Chat ID: ${chatId}\n`);

// Test 1: Get bot info
console.log('1. Testing bot authentication...');
const botInfo = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
const botData = await botInfo.json();
if (botData.ok) {
  console.log(`✓ Bot authenticated: @${botData.result.username}`);
} else {
  console.error('✗ Bot authentication failed:', botData);
  process.exit(1);
}

// Test 2: Try to get chat info
console.log('\n2. Testing chat access...');
const chatInfo = await fetch(`https://api.telegram.org/bot${botToken}/getChat?chat_id=${chatId}`);
const chatData = await chatInfo.json();
if (chatData.ok) {
  console.log(`✓ Chat found: ${chatData.result.title || chatData.result.first_name || 'Private chat'}`);
  console.log(`  Type: ${chatData.result.type}`);
} else {
  console.error('✗ Chat not found or bot not in chat');
  console.error(`  Error: ${chatData.description}`);
  console.error('\nTo fix this:');
  console.error('  1. Make sure the bot is added to the chat/channel');
  console.error('  2. For groups: Make the bot an admin');
  console.error('  3. For private chats: Start a conversation with the bot first');
  console.error('  4. Get your chat ID by messaging @userinfobot on Telegram');
  process.exit(1);
}

// Test 3: Send a test message
console.log('\n3. Sending test message...');
const testMessage = '🧪 Test message from Morakeb bot - إذا رأيت هذه الرسالة، فالبوت يعمل بشكل صحيح!';
const sendResult = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: chatId,
    text: testMessage,
    parse_mode: 'HTML',
  }),
});

const sendData = await sendResult.json();
if (sendData.ok) {
  console.log('✓ Test message sent successfully!');
  console.log(`  Message ID: ${sendData.result.message_id}`);
} else {
  console.error('✗ Failed to send message');
  console.error(`  Error: ${sendData.description}`);
  console.error(`  Error code: ${sendData.error_code}`);
}
