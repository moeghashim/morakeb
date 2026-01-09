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
if (!botToken) {
  console.error('TELEGRAM_BOT_TOKEN not found in .env');
  process.exit(1);
}

console.log('Fetching recent chats from bot...\n');
const updates = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=20`);
const updatesData = await updates.json();

if (!updatesData.ok) {
  console.error('Failed to get updates:', updatesData.description);
  process.exit(1);
}

if (updatesData.result.length === 0) {
  console.log('No messages found. Please:');
  console.log('1. Open Telegram and find @TermsTrustBot');
  console.log('2. Start a conversation and send any message');
  console.log('3. Run this script again\n');
  process.exit(1);
}

console.log('Found recent chats:\n');
const chats = new Map<string, { title: string; type: string; lastMessage: string }>();

for (const update of updatesData.result) {
  if (update.message?.chat) {
    const chat = update.message.chat;
    const chatId = String(chat.id);
    const title = chat.title || chat.first_name || chat.username || 'Unknown';
    const type = chat.type || 'private';
    const lastMsg = update.message.text || '[media or other]';
    
    if (!chats.has(chatId)) {
      chats.set(chatId, { title, type, lastMessage: lastMsg });
    }
  }
}

if (chats.size === 0) {
  console.log('No chats found in updates');
  process.exit(1);
}

let index = 1;
for (const [chatId, info] of chats.entries()) {
  console.log(`${index}. Chat ID: ${chatId}`);
  console.log(`   Title: ${info.title}`);
  console.log(`   Type: ${info.type}`);
  console.log(`   Last message: ${info.lastMessage.substring(0, 50)}...\n`);
  index++;
}

const latestChat = Array.from(chats.keys())[0];
console.log('='.repeat(60));
console.log(`Latest chat ID: ${latestChat}`);
console.log('='.repeat(60));
console.log('\nTo use this chat ID, update your .env file:');
console.log(`TELEGRAM_CHAT_ID=${latestChat}\n`);
