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

console.log('Getting channel information...\n');
console.log('Method 1: Check recent updates (channels the bot has seen)...\n');

const updates = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=50`);
const updatesData = await updates.json();

if (!updatesData.ok) {
  console.error('Failed to get updates:', updatesData.description);
  process.exit(1);
}

const channels: Array<{ id: string; title: string; type: string }> = [];
const groups: Array<{ id: string; title: string; type: string }> = [];
const privateChats: Array<{ id: string; title: string; type: string }> = [];

for (const update of updatesData.result) {
  if (update.message?.chat || update.channel_post?.chat) {
    const chat = update.message?.chat || update.channel_post?.chat;
    const chatId = String(chat.id);
    const title = chat.title || chat.first_name || chat.username || 'Unknown';
    const type = chat.type || 'unknown';
    
    const entry = { id: chatId, title, type };
    
    if (type === 'channel') {
      if (!channels.find(c => c.id === chatId)) {
        channels.push(entry);
      }
    } else if (type === 'group' || type === 'supergroup') {
      if (!groups.find(g => g.id === chatId)) {
        groups.push(entry);
      }
    } else {
      if (!privateChats.find(p => p.id === chatId)) {
        privateChats.push(entry);
      }
    }
  }
}

if (channels.length > 0) {
  console.log('📢 Channels found:');
  channels.forEach((ch, i) => {
    console.log(`  ${i + 1}. ${ch.title}`);
    console.log(`     ID: ${ch.id}`);
    console.log(`     Type: ${ch.type}\n`);
  });
}

if (groups.length > 0) {
  console.log('👥 Groups found:');
  groups.forEach((g, i) => {
    console.log(`  ${i + 1}. ${g.title}`);
    console.log(`     ID: ${g.id}`);
    console.log(`     Type: ${g.type}\n`);
  });
}

if (channels.length === 0 && groups.length === 0) {
  console.log('No channels or groups found in recent updates.\n');
  console.log('To get your channel ID:');
  console.log('');
  console.log('Option 1: Forward a message from the channel');
  console.log('  1. Post any message in your channel');
  console.log('  2. Forward that message to @RawDataBot');
  console.log('  3. Look for "chat" → "id" in the response (usually starts with -100)');
  console.log('');
  console.log('Option 2: Use channel username (if public)');
  console.log('  If your channel is public, you can use the username format:');
  console.log('  TELEGRAM_CHAT_ID=@yourchannelname');
  console.log('  (Note: Include the @ symbol in the .env file)');
  console.log('');
  console.log('Option 3: Post in channel and check bot updates');
  console.log('  1. Make sure the bot is an admin of the channel');
  console.log('  2. Post a message in the channel');
  console.log('  3. Run this script again');
  console.log('');
  
  if (privateChats.length > 0) {
    console.log('Current private chat ID in use:');
    privateChats.forEach(p => {
      console.log(`  ${p.title}: ${p.id}`);
    });
  }
} else {
  const targetChannel = channels[0] || groups[0];
  console.log('='.repeat(60));
  console.log(`Recommended Channel/Group ID: ${targetChannel.id}`);
  console.log(`Name: ${targetChannel.title}`);
  console.log('='.repeat(60));
  console.log('\nTo use this, update your .env file:');
  console.log(`TELEGRAM_CHAT_ID=${targetChannel.id}\n`);
}
